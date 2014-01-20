var request = require('request');
var async = require('async');
var db = "http://localhost:5984/calendar";
var designDocUrl = db + "/_design/calendar/";

var googleConverter = require('../lib/googleConverter.js');
var UUID = require('../lib/uuid.js');

var log = function(s) {
	console.log("[google_api] " + s);
};

exports.injectDependencies = {
	request : function(requestReplacement) {
		request = requestReplacement;
		log("Dependency request replaced.");
	}
};

exports.google = {
	converter : require('../lib/googleConverter.js'),
	api : require('../lib/googleAPIWrapper'),
};

exports.generateAuthUrl = function(req, res) {
	this.google.api.getAuthUrl(function(err, url) {
		res.send({
			"authUrl" : url
		});
	});
};

/**
 * Should be called by redirect from Google allow-page - saves this clients
 * "Code" with this code, access tokens can be requested
 */
exports.codecallback = function(req, res) {
	var code = req.query.code;
	this.google.api.saveCode(code, function(err) {
		if (err) {
			res.send("ERROR: " + JSON.stringify(err));
		} else {
			res.render('redirect', {
				url : "/index.html#/google-test-api",
				message : "Google API Code (Zugriffsberechtigung) erhalten.",
			});
		}
	});
};

exports.selectCalendars = function(req, res) {
	this.google.api.getAllCalendars(function(err, result) {
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
		var googleIdViewUrl = db + '/_design/calendar/_view/by_google_id?key=';
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
};

function loadRemoteEvents(googleId, callback) {
	var events = [];
	var loadPage = function(pageToken) {
		console.log("[GoogleSync] Loading event page: " + pageToken);

		that.google.api.getEventPage(googleId, pageToken, function(err, result) {
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
				callback(null, events);
			}
		});
	};
	// First Page
	loadPage();
};

/**
 * @param callback:
 *            function(err, {changedRemote: [], changedLocal: []})
 */
exports.sync_getTodo = function(calId, syncTodoCallback) {
	var that = this;
	var calendarObj;

	// prepare
	async.parallel([ function loadCalendarFromCouchDB(callback) {
		request.get(db + "/" + calId, function(err, res, body) {
			if (err) {
				return callback(err);
			}
			calendarObj = JSON.parse(body);
			callback();
		});
	} ], function(err) {
		if (err) {
			return syncTodoCallback(err);
		}
		if (!calendarObj.google) {
			var error = "Calendar is no google calendar!";
			console.error("ERROR in google-sync: " + error);
			return syncTodoCallback(error);
		}
		// sync
		var isFirstSync = !calendarObj.google.lastSync;
		var mustCheckRemote;
		if (isFirstSync) {
			// first sync, no check needed.
			mustCheckRemote = true;
		} else {
			that.google.api.getCalendarByGoogleId(calendarObj.google.id, function(err, result) {
				if (err)
					return callback(err);
				if (result.etag == calendarObj.google.etag) {
					console.log("Not syncing remote, calendar etags equal.");
					mustCheckRemote = false;
				} else {
					console.log("Etags differ - starting sync!");
					mustCheckRemote = true;
				}
			});
		}
		var changedRemote = [];
		var changedLocal = [];
		async.series([ function getChangedRemote(callback) {
			if (mustCheckRemote) {
				loadRemoteEvents(calendarObj.google.id, function(err, events) {
					if (err) {
						return callback(err);
					}
					changedRemote = googleConverter.convertEventList(events, calId);
					callback();
				});
			} else {
				changedRemote = [];
				callback();
			}
		}, function getChangedLocal(callback) {
			if(isFirstSync) {
				return callback();
			}
			request.get(designDocUrl + "_views/events_by_cal?key=" + calId, function(err, res, body) {
				if(err) {
					return callback(err);
				}
				var json = JSON.parse(body);
				changedLocal = json.values;
				callback();
			});
		} ], function(err) {
			if (err) {
				return syncTodoCallback(err);
			}
			syncTodoCallback(null, {
				changedRemote : changedRemote,
				changedLocal : changedLocal
			});
		});

	});
};

exports.sync = function(req, res) {
	var calId = req.query.id;

	this.sync_getTodo(calId, function(err, todo) {
		if (err) {
			res.send({
				err : err
			});
		} else {
			persistEventList(todo.changedRemote, calId, function(err, results) {
				res.send({
					err : err,
					log : results
				});
			});
		}
	});
};

/**
 * events: List Google Events calId: _id of calendar in CouchDB callback:
 * function(err, results)
 */
var persistEventList = function(list, calId, callback) {

	var batchID = UUID.generate();
	// generate UUIDs
	list.forEach(function(entry) {
		entry._id = UUID.generate();
		entry.google.lastSyncedRevision = 1;
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

var that = this;
exports.testAccess = function() {
	return {
		request : request,
	};
};