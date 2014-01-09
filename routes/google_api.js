var request = require('request');
var async = require('async');
var db = "http://localhost:5984/calendar";

var syncInfoUrl = db + "/google-sync";

var googleConverter = require('../lib/googleConverter.js');
var UUID = require('../lib/uuid.js');

var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;

var oauth2Client = null;

function getOAuthClient(req, callback) {
	if (oauth2Client != null) {
		callback(oauth2Client);
	} else {
		request(syncInfoUrl, function(err, res, body) {
			var obj = JSON.parse(body);
			if (err) {
				console.error("Error retrieving google-sync-token");
				callback(null);
			} else {
				var baseUrl = req.protocol + "://" + req.get('host');
				var redirectUrl = baseUrl + '/google-sync/codecallback';
				oauth2Client = new OAuth2Client(obj.clientId, obj.clientSecret, redirectUrl);
				callback(oauth2Client);
			}
		});
	}
}

/* returns client with token */
function getAuthClient(req, callback) {
	request(syncInfoUrl, function(err, res, body) {
		if (err) {
			throw "ERROR (getting syncInfo from Couch): " + err;
		}
		var json = JSON.parse(body);

		// this function applies tokens to client and calls callback
		var setTokensAndCallback = function(syncInfo) {
			request.put({
				url : syncInfoUrl,
				json : syncInfo
			}, function(err) {
				if (err) {
					console.error("ERROR persisting syncInfo: " + JSON.stringify(err));
				}
			});

			getOAuthClient(req, function(client) {
				client.credentials = {
					access_token : syncInfo.accessToken,
					refresh_token : syncInfo.refreshToken
				};
				callback(client);
			});
		};

		if (!(json.accessToken && json.refreshToken)) {
			getOAuthClient(req, function(oauth2Client) {
				oauth2Client.getToken(json.code, function(err, tokens) {
					if (err) {
						throw "ERROR: [oauth2Client.getToken(" + json.code + ")] " + err;
					}
					json.accessToken = tokens.access_token;
					json.refreshToken = tokens.refresh_token;
					setTokensAndCallback(json);
				});
			});
		} else {
			setTokensAndCallback(json);
		}
	});
}

exports.generateAuthUrl = function(req, res) {
	getOAuthClient(req, function(oauth2Client) {
		var url = oauth2Client.generateAuthUrl({
			access_type : 'offline',
			scope : 'https://www.googleapis.com/auth/calendar'
		});
		res.send({
			"authUrl" : url
		});
	});
};

exports.codecallback = function(req, res) {
	var code = req.query.code;

	request.get(syncInfoUrl, function(err, response, body) {
		if (err) {
			res.send("ERROR: " + JSON.stringify(err));
		} else {
			var json = JSON.parse(body);

			json.code = code;
			// invalidate tokens (they refer another code)
			json.accessToken = null;
			json.refreshToken = null;

			request.put({
				url : syncInfoUrl,
				json : json
			}, function(err, response, body) {
				if (err) {
					res.send("ERROR: " + JSON.stringify(err));
				} else {
					res.render('redirect', {
						url : "/index.html#/google-test-api",
						message : "Google API Code (Zugriffsberechtigung) erhalten.",
					});
				}
			});
		}
	});
};

function loadClientAndAuthClient(req, callback) {
	getAuthClient(req, function(authClient) {
		googleapis.discover('calendar', 'v3').execute(function(err, client) {
			callback(err, client, authClient);
		});
	});
}

exports.selectCalendars = function(req, res) {
	getAuthClient(req, function(authClient) {
		googleapis.discover('calendar', 'v3').execute(function(err, client) {
			client.calendar.calendarList.list().withAuthClient(authClient).execute(function(err, results) {
				if (err) {
					console.error("Error retriving calender list: " + JSON.stringify(err));
					res.status = 400;
					res.send(err);
					return;
				}
				var list = googleConverter.convertCalendarList(results);
				// now we replace the calendars we already saved locally with
				// local objects
				// TODO: we need to deal with the case of local changes, for
				// example the name could have been changed.
				// this might confuse the user.
				var googleIdViewUrl = db + '/_design/calendar/_view/by_google_id?key='
				async.mapSeries(list, function(item, callback) {
					var url = googleIdViewUrl + '"' + item.google.id + '"';
					console.log("GET: " + url);
					request.get(url, function(err, res, body) {
						if (err) {
							callback(err);
						} else {
							var obj = JSON.parse(body);
							if (obj.error) {
								// Special characters (#) ?? FIXME!
								console.error("TODO: error retrieving calendar - ignored! URL: " + url);
								callback(null, item);
							} else if (obj.rows.length == 0) {
								// not found, use google item
								callback(null, item);
							} else {
								// found -> replace
								callback(null, obj.rows[0].value);
							}
						}
					});
				}, function(err, map_results) {
					if (err) {
						var error = "ERROR in mapSeries (replace google with local calendars if present): " + JSON.stringify(err);
						console.error(error);
						throw error;
					}
					res.send(map_results);
				});
			});
		});
	});
};

exports.sync = function(req, res) {
	var calId = req.query.id;
	var calendarObj;
	var client;
	var authClient;
	// prepare
	async.parallel([ function loadCalendarFromCouchDB(callback) {
		request.get(db + "/" + calId, function(err, res, body) {
			if (err) {
				return callback(err);
			}
			calendarObj = JSON.parse(body);
			callback();
		});
	}, function loadClient(callback) {
		loadClientAndAuthClient(req, function(err, client2, authClient2) {
			if (err)
				return callback(err);
			client = client2;
			authClient = authClient2;
			callback();
		});
	} ], function(err) {
		if (err) {
			console.error("ERROR in sync: " + err);
			return res.send(err);
		}
		// sync
		var events = [];
		async.series([ function checkEtag(callback) {
			if (!calendarObj.google.lastSync) {
				// first sync, no check needed.
				return callback();
			}
			client.calendar.calendar.get(calendarObj.google.id).withAuthClient(authClient).execute(function(err, result) {
				if (err)
					return callback(err);
				if (result.etag == calendarObj.google.etag) {
					console.log("Not syncing, etags equal.");
					callback("ETags equal - no sync needed");
				} else {
					console.log("Etags differ - starting sync!");
					callback();
				}
			});
		}, function loadRemoteEvents(callback) {
			var loadPage = function(pageToken) {
				console.log("[GoogleSync] Loading event page: " + pageToken);
				var options = pageToken ? {
					calendarId : calendarObj.google.id,
					pageToken : pageToken
				} : {
					// first page
					calendarId : calendarObj.google.id,
				};

				client.calendar.events.list(options).withAuthClient(authClient).execute(function(err, result) {
					if (err) {
						console.error("[GoogleSync] error loading event list: " + JSON.stringify(err));
						return callback(err);
					}
					events = events.concat(result.items);
					var nextPage = result.nextPageToken;
					if (nextPage) {
						// Recursively load following pages...
						loadPage(nextPage);
					} else {
						console.log("[GoogleSync] Last event page loaded.");
						callback();
					}
				});
			};
			// First Page
			loadPage();
		} ], function(err) {
			if (err) {
				res.send({
					log : [ {
						"error" : err
					} ]
				});
			} else {
				persistEventList(events, calId, function(err, results) {
					res.send({
						err : err,
						log : results
					});
				});
			}
		});
	});
};

/**
 * events: List Google Events calId: _id of calendar in CouchDB callback:
 * function(err, results)
 */
var persistEventList = function(events, calId, callback) {
	var list = googleConverter.convertEventList(events, calId);
	var batchID = UUID.generate();
	// generate UUIDs
	list.forEach(function(entry) {
		entry._id = UUID.generate();
		if (!entry.batch) {
			entry.batch = [];
		}
		entry.batch.push(batchID);
	});
	// TODO: parallel?
	// Persist events
	async.mapSeries(list, function(item, callback) {
		request.put({
			url : db + "/" + item._id,
			json : item
		}, function(err, res, json) {
			callback(err, json);
		});
	}, callback);
};