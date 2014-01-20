/**
 * This File wraps the (really weird) google-api js-Client..
 * 
 * For now, it includes calls to the syncInfo object in CouchDB, which contains
 * SyncTokens etc.
 */

var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;

var oauth2Client = null;

var request = require('request');
var db = "http://localhost:5984/calendar";
var syncInfoUrl = db + "/google-sync";

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

var loadClientAndAuthClient = function(req, callback) {
	getAuthClient(req, function(authClient) {
		googleapis.discover('calendar', 'v3').execute(function(err, client) {
			callback(err, client, authClient);
		});
	});
};

exports.getAuthUrl = function(callback) {
	getOAuthClient(req, function(oauth2Client) {
		var url = oauth2Client.generateAuthUrl({
			access_type : 'offline',
			scope : 'https://www.googleapis.com/auth/calendar'
		});
		callback(null, url);
	});
};

exports.saveCode = function(code, callback) {
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
				callback(err);
			});
		}
	});
};

/**
 * @param callback:
 *            function(err, result)
 */
exports.getAllCalendars = function(callback) {
	getAuthClient(req, function(authClient) {
		googleapis.discover('calendar', 'v3').execute(function(err, client) {
			if (err) {
				return callback(err);
			}
			client.calendar.calendarList.list().withAuthClient(authClient).execute(function(err, results) {
				callback(err, result);
			});
		});
	});
};

exports.getCalendarByGoogleId = function(googleId, callback) {
	loadClientAndAuthClient(null, function(err, client, authClient) {
		if (err) {
			return callback(err);
		}
		client.calendar.calendar.get(googleId).withAuthClient(authClient).execute(function(err, result) {
			callback(err, result);
		});
	});
};

/**
 * @param calendarId: Google Calendar ID
 * @param pageToken: null: first page, else token of the page to fetch
 * @param callback: function(err, result)
 */
exports.getEventPage = function(calendarId, pageToken, callback) {
	var options = pageToken ? {
		calendarId : calendarId,
		pageToken : pageToken
	} : {
		// first page
		calendarId : calendarId,
	};
	loadClientAndAuthClient(null, function(err, client, authClient) {
		if (err) {
			return callback(err);
		}
		client.calendar.events.list(options).withAuthClient(authClient).execute(function(err, results) {
			callback(err, results);
		});
	});
};

exports.cache = {
	syncInfo: null,
	authClient: null,
	client: null,
};