var assert = require('assert');
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

exports.google = google = {
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
	google.api.getAllCalendars(function(err, results) {
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
exports.sync_getTodo = sync_getTodo = function(calId, syncTodoCallback) {
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

		var newRemote = [];
		var changedRemote = [];
		var deletedRemote = [];
		var allLocal = [];
		var localLookupByGoogleId = {};
		var remoteLookupByGoogleId = {};
		async.series([ function checkCalendarEtag(callback) {
			if (isFirstSync) {
				// first sync, no check needed.
				mustCheckRemote = true;
				callback();
			} else {
				that.google.api.getCalendarByGoogleId(calendarObj.google.id, function(err, result) {
					if (err)
						return callback(err);
					if (result.etag == calendarObj.google.etag) {
						console.log("Not syncing remote, calendar etags equal. - TODO: Check if etag always changes!");
						mustCheckRemote = false;
					} else {
						console.log("Etags differ - starting sync!");
						mustCheckRemote = true;
					}
					callback();
				});
			}
		}, function getAllLocalEvents(callback) {
			if (isFirstSync) {
				return callback();
			}
			request.get(designDocUrl + "_view/events_by_cal?key=\"" + calId + "\"", function(err, res, body) {
				if (err) {
					return callback(err);
				}
				var json = JSON.parse(body);
				json.rows.forEach(function(row) {
					allLocal.push(row.value);
				});
				allLocal.forEach(function(event) {
					if (event.google) {
						localLookupByGoogleId[event.google.id] = event;
					}
				});
				callback();
			});
		}, function getChangedRemote(callback) {
			if (mustCheckRemote) {
				loadRemoteEvents(calendarObj.google.id, function(err, events) {
					if (err) {
						return callback(err);
					}
					events.forEach(function(event) {
						var localEvent = localLookupByGoogleId[event.id];
						if (localEvent === undefined) {
							newRemote.push(googleConverter.convertEvent(event, calId));
						} else {
							var etagLocal = localEvent.google.etag;
							var etagRemote = event.etag;
							if (etagLocal != etagRemote) {
								console.log("event did change, local etag: " + etagLocal + ", Remote ETag: " + etagRemote);
								changedRemote.push(googleConverter.convertEvent(event, calId));
							} else {
								// console.log("event did not change on remote:
								// " + event.id);
							}
						}

						// create Lookup
						remoteLookupByGoogleId[event.id] = event;
					});

					callback();
				});
			} else {
				changedRemote = [];
				callback();
			}
		}, ], function(err) {
			if (err) {
				return syncTodoCallback(err);
			}
			var newLocal = [];
			var changedLocal = [];
			var deletedOnRemote = [];
			allLocal.forEach(function(localEvent) {
				if (!localEvent.google) {
					newLocal.push(localEvent);
				} else {
					var localRev = localEvent._rev.split('-')[0];
					// console.log("Local Event: _rev: " + localRev + "
					// lastSync: " + localEvent.google.lastSyncedRevision);
					if (localRev > localEvent.google.lastSyncedRevision) {
						changedLocal.push(localEvent);
					}
					// events can be changed locally AND be deleted on remote!
					if (mustCheckRemote && !remoteLookupByGoogleId[localEvent.google.id]) {
						deletedOnRemote.push(localEvent);
					}
				}
			});
			syncTodoCallback(null, {
				newRemote : newRemote,
				changedRemote : changedRemote,
				deletedOnRemote : deletedOnRemote,
				newLocal : newLocal,
				changedLocal : changedLocal,
			});
		});

	});
};

exports.syncEventByGoogleId = function(req, res) {
	var googleId = req.query.googleId;
	assert(googleId !== undefined, "Must call with googleID!");
	var localEvent;
	var remoteEvent;
	async.parallel([ function loadLocalEvent(callback) {
		var viewUrl = designDocUrl + "_view/event_by_google_id?key=\"" + googleId + '"';
		request.get(viewUrl, function(err, res, body) {
			if (err) {
				return callback(err);
			}
			var obj = JSON.parse(body);
			assert(obj.rows.length === 1, "There should be only one event with the googleID " + googleId);
			localEvent = obj.rows[0].value;
			callback();
		});
	}, function loadRemoteEvent(callback) {
		google.api.getEvent(googleId, function(err, event) {
			if (err) {
				return callback(err);
			}
			remoteEvent = event;
			callback();
		});
	} ], function(err) {
		if (err) {
			res.send({
				err : err
			});
		}
		var status = {};
		var localRev = localEvent._rev.split('-')[0];
		if (localEvent.google === undefined) {
			status.local = "new";
		} else {
			if (localRev > localEvent.google.lastSyncedRevision) {
				status.local = "changed";
			} else {
				status.local = "unchanged";
			}
		}

		if (status.local != "new") {
			if (!remoteEvent) {
				status.remote = "deleted";
			} else {
				var localEtag = localEvent.google.etag;
				if (localEtag != remoteEvent.etag) {
					status.remote = "changed";
				}
			}
		}

		if (status.local == "unchanged" && status.remote == "changed") {
			var remoteEventConverted = google.converter.convertEvent(remoteEvent, localEvent.calendarId);
			remoteEventConverted._id = localEvent._id;
			remoteEventConverted._rev = localEvent._rev;
			remoteEventConverted.google.lastSyncedRevision = parseInt(localRev) + 1;
			request.put({
				url : db + "/" + remoteEventConverted._id,
				json : remoteEventConverted
			}, function(err, response, json) {
				if (err) {
					res.send({
						err : "There was an error updating the local event: " + err
					});
				} else {
					res.send({
						message : "updated local event."
					});
				}
			});
		} else {
			res.send({
				err : "Not implemented. Status: " + JSON.stringify(status)
			});
		}

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
			persistEventList(todo.newRemote, calId, function(err, results) {
				if (err) {
					res.send({
						err : err
					});
				} else {
					var calUrl = db + "/" + calId;
					request.get(calUrl, function(err, resp, body) {

						var calObj = JSON.parse(body);
						// TODO!
						calObj.google.lastSync = "just now";
						request.put({
							url : calUrl,
							json : calObj
						}, function(err) {
							res.send({
								err : err,
								log : results
							});
						});
					});
				}
			});
		}
	});
};

exports.findConflicts = findConflicts = function(todo) {
	var conflicts = [];

	var createLookupByGoogleId = function(array) {
		var lookup = {};
		if (!array) {
			return lookup;
		}
		array.forEach(function(event) {
			assert(event.google !== undefined, "Cannot create lookup by GoogleID - missing google info");
			assert(event.google.id !== undefined, "Cannot create lookup by googleID - missing id!");
			lookup[event.google.id] = event;
		});
		return lookup;
	};
	var changedLocal = createLookupByGoogleId(todo.changedLocal);
	var deletedLocal = createLookupByGoogleId(todo.deletedLocal);
	var changedRemote = createLookupByGoogleId(todo.changedRemote);
	var deletedOnRemote = createLookupByGoogleId(todo.deletedOnRemote);

	if (todo.changedLocal) {
		todo.changedLocal.forEach(function(localEvent) {
			var remoteEvent = changedRemote[localEvent.google.id];
			if (remoteEvent) {
				conflicts.push({
					remoteEvent : remoteEvent,
					localEvent : localEvent,
					localOp : "change",
					remoteOp : "change",
					googleId : localEvent.google.id,
				});
			}
			var deletedOnRemoteEvent = deletedOnRemote[localEvent.google.id];
			if (deletedOnRemoteEvent) {
				assert(deletedOnRemoteEvent === localEvent);
				conflicts.push({
					localEvent : localEvent,
					remoteEvent : null,
					localOp : "change",
					remoteOp : "delete",
					googleId : localEvent.google.id,
				});
			}
		});
	}
	if (todo.deletedLocal) {
		todo.deletedLocal.forEach(function(localEvent) {
			var remoteEvent = changedRemote[localEvent.google.id];
			if (remoteEvent) {
				conflicts.push({
					remoteEvent : remoteEvent,
					localEvent : localEvent,
					localOp : "delete",
					remoteOp : "change",
					googleId : localEvent.google.id,
				});
			}
		});
	}

	return conflicts;
};

exports.showSyncTodo = function(req, res) {
	var calId = req.query.id;
	sync_getTodo(calId, function(err, todo) {
		if (err) {
			res.send({
				err : err
			});
		} else {
			res.send({
				err : err,
				todo : todo,
				conflicts : findConflicts(todo)
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
		entry.calendarId = calId;
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