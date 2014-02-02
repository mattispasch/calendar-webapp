var googleApi = require("../routes/google_api");

var requestSpy = function() {
	return {
		returnForGet : {
			"http://localhost:5984/calendar/calendar1" : {
				_id : "calendar1",
				google : {

				}
			}
		},

		get : function(url, callback) {
			console.log("request.get, url: " + url);

			if (this.returnForGet[url]) {
				callback(null, null, JSON.stringify(this.returnForGet[url]));
			} else {
				callback("request.get: Response not configured, url: " + url);
			}
		},
		put : function(opts, callback) {
			console.log("request.put, opts: " + JSON.stringify(opts));

			var json = {
				status : "ok"
			};
			callback(null, null, json);
		}
	};
};

var event1 = {
	kind : "calendar#event",
	etag : "event1_version1",
	id : "event1",
	summary : "this is event1",
	start : {
		dateTime : "2013-11-26T08:00:00+01:00"
	},
	end : {
		dateTime : "2013-11-26T10:00:00+01:00"
	},
};

var fakeGoogleAPIWrapper = function() {
	return {
		getEventPage : function(googleId, pageToken, callback) {
			callback(null, {
				items : [ event1 ]
			});
		},
		getCalendarByGoogleId : function(googleId, callback) {
			callback("NOT FOUND!");
		}
	};
};

var res = {
	send : function(value) {
		console.log("SEND called: " + value);
	}
};

describe("The Google Sync", function() {
	describe("- Google API Errors - ", function() {
		var couchCalendarID = "calendar1";
		var req = {
			query : {
				id : couchCalendarID,
			},
		};
		it("no Google API code", function() {
			spyOn(res, 'send').andCallThrough();
			googleApi.injectDependencies.request(requestSpy());

			var gaw = fakeGoogleAPIWrapper();
			var error = {
				errorCode : 1,
				errorText : "API code missing"
			};
			gaw.getEventPage = function(googleId, pageToken, callback) {
				callback(error);
			};
			googleApi.google.api = gaw;

			runs(function() {
				googleApi.sync(req, res);
			});
			waitsFor(function() {
				return res.send.wasCalled;
			});
			runs(function() {
				console.log("Test completed, checking results....");
				expect(res.send).toHaveBeenCalledWith({
					err : error
				});
			});
		});
	});
	describe("- called with a never synced calendar -", function() {
		var couchCalendarID = "calendar1";
		var req = {
			query : {
				id : couchCalendarID,
			},
		};

		it("should persist 'event1' into couchDB", function() {
			spyOn(res, 'send').andCallThrough();
			var request = requestSpy();
			spyOn(request, 'put').andCallThrough();

			googleApi.injectDependencies.request(request);
			googleApi.google.api = fakeGoogleAPIWrapper();

			runs(function() {
				googleApi.sync(req, res);
			});
			waitsFor(function() {
				return res.send.wasCalled;
			});

			runs(function() {
				console.log("Test completed, checking results....");
				expect(res.send).toHaveBeenCalledWith({
					err : null,
					log : [ {
						status : 'ok'
					} ]
				});
				var persistedDocuments = [];
				request.put.calls.forEach(function(call) {
					persistedDocuments.push(call.args[0].json);
				});
				expect(persistedDocuments.length).toEqual(2);
				var event1Doc = persistedDocuments[0];
				expect(event1Doc.google.id).toEqual("event1");
				expect(event1Doc.type).toEqual("event");
				expect(event1Doc.start).toEqual({
					date : [ 2013, 11, 26, 7, 0, 0 ]
				});
				expect(event1Doc.end).toEqual({
					date : [ 2013, 11, 26, 9, 0, 0 ]
				});
				expect(event1Doc.google.lastSyncedRevision).toEqual(1);

				var calendarDoc = persistedDocuments[1];

				expect(calendarDoc.google.lastSync).not.toBeNull();
			});
		});
	});
	describe("- called with an already synced calendar -", function() {

		it("should not do anything if nothing changed both locally and remote", function() {

		});
		it("should update an event which changed in google", function() {

		});

		it("should upload an changed event to google", function() {

		});
	});
});

describe("The method sync_getTodo", function() {
	describe("- local events - ", function() {

		var locallyChangedEvent = {
			_id : "changedEvent",
			_rev : "2-134dfajkdsfjk3rjsdkfasd",
			type : "event",
			summary : "event1 - changed",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		var localUnChangedEvent = {
			_id : "unchangedEvent",
			_rev : "1-134dfajkdsfjk3rjsdkfasd",
			type : "event",
			summary : "event1 - unchanged",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		var newLocalEvent = {
			_id : "newEvent",
			_rev : "1-asdfasdfasdfasdfasdf",
			type : "event",
			summary : " new local event",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
		};
		var syncedCalendar = {
			_id : "syncedCalendar",
			type : "calendar",
			google : {
				id : "syncedCalendarAtGoogle",
				lastSync : [ 2013, 11, 27, 8, 0, 0 ],
				etag : "etag-of-version-1",
			}
		};
		var syncedCalendarAtGoogle = {
			etag : "etag-of-version-1",
		};

		// Fake CouchDB
		var request = requestSpy();
		request.returnForGet["http://localhost:5984/calendar/changedEvent"] = locallyChangedEvent;
		request.returnForGet["http://localhost:5984/calendar/unchangedEvent"] = localUnChangedEvent;
		request.returnForGet["http://localhost:5984/calendar/newEvent"] = newLocalEvent;
		request.returnForGet["http://localhost:5984/calendar/syncedCalendar"] = syncedCalendar;
		request.returnForGet["http://localhost:5984/calendar/_design/calendar/_view/events_by_cal?key=\"syncedCalendar\""] = {
			rows : [ {
				id : locallyChangedEvent._id,
				key : syncedCalendar._id,
				value : locallyChangedEvent
			}, {
				id : localUnChangedEvent._id,
				key : syncedCalendar._id,
				value : localUnChangedEvent
			}, {
				id : newLocalEvent._id,
				key : syncedCalendar._id,
				value : newLocalEvent
			}, ],
		};
		googleApi.injectDependencies.request(request);

		// Fake GoogleAPI
		var wrapper = fakeGoogleAPIWrapper();
		wrapper.getCalendarByGoogleId = function(googleId, callback) {
			expect(googleId).toEqual("syncedCalendarAtGoogle");

			callback(null, syncedCalendarAtGoogle);
		};
		googleApi.google.api = wrapper;

		it("should report a changed event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();
				expect(todo.newRemote.length).toBe(0);
				expect(todo.changedRemote.length).toEqual(0);
				expect(todo.changedLocal.length).toBe(1);
				var found = false;
				todo.changedLocal.forEach(function(event) {
					if (event._id == "changedEvent") {
						found = true;
					}
				});
				expect(found).toBe(true);
				todo.newLocal.forEach(function(newEvent) {
					expect(newEvent._id).not.toEqual("changedEvent");
				});
				done();
			});
		});
		it("should not report an unchanged event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();
				expect(todo.newRemote.length).toBe(0);
				expect(todo.changedRemote.length).toBe(0);

				todo.changedLocal.forEach(function(changedEvent) {
					expect(changedEvent._id).not.toEqual("unchangedEvent");
				});
				done();
			});
		});
		it("should report a new event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();
				expect(todo.newRemote.length).toBe(0);
				expect(todo.changedRemote.length).toBe(0);
				var found = false;
				todo.newLocal.forEach(function(event) {
					if (event._id == "newEvent") {
						found = true;
					}
				});
				expect(found).toBe(true);
				todo.changedLocal.forEach(function(changedEvent) {
					expect(changedEvent._id).not.toEqual("newEvent");
				});
				done();
			});
		});
	});

	describe("- remote events - ", function() {

		var remoteChangedEventLocal = {
			_id : "remoteChangedEventLocal",
			_rev : "1-134dfajkdsfjk3rjsdkfasd",
			type : "event",
			summary : "event1 - first revision",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				id : "remoteChangedEventGoogle",
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		var remoteChangedEventGoogle = {
			id : "remoteChangedEventGoogle",
			etag : "etag-of-version-2",
			summary : "event1 - changed on remote",
			start : {
				dateTime : "2013-11-26T08:00:00+01:00"
			},
			end : {
				dateTime : "2013-11-26T10:00:00+01:00"
			},
		};
		var remoteNewEventGoogle = {
			id : "newEventGoogle",
			etag : "etag-of-version-1",
			summary : "event2 - new in google",
			start : {
				dateTime : "2013-11-26T08:00:00+01:00"
			},
			end : {
				dateTime : "2013-11-26T10:00:00+01:00"
			},
		};
		var unchangedEventGoogle = {
			_id : "unchangedEventLocal",
			_rev : "1-134dfajkdsfjk3rjsdkfasd",
			type : "event",
			summary : "event1 - unchanged local&remote",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				id : "unchangedEventGoogle",
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		var newLocalEvent = {
			_id : "newEvent",
			_rev : "1-asdfasdfasdfasdfasdf",
			type : "event",
			summary : " new local event",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
		};
		var localEventDeletedOnRemote = {
			_id : "localEventDeletedOnRemote",
			_rev : "1-134dfajkdsfjk3rjsdkfasd",
			type : "event",
			summary : "event3 - unchanged local",
			calendarId : "syncedCalendar",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				id : "localEventDeletedOnRemoteGoogleId",
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		var syncedCalendar = {
			_id : "syncedCalendar",
			type : "calendar",
			google : {
				id : "syncedCalendarAtGoogle",
				lastSync : [ 2013, 11, 27, 8, 0, 0 ],
				etag : "etag-of-version-1",
			}
		};
		var syncedCalendarAtGoogle = {
			id : "syncedCalendarAtGoogle",
			etag : "etag-of-version-2",
		};

		// Fake CouchDB
		var request = requestSpy();
		request.returnForGet["http://localhost:5984/calendar/remoteChangedEventLocal"] = remoteChangedEventLocal;
		request.returnForGet["http://localhost:5984/calendar/localEventDeletedOnRemote"] = localEventDeletedOnRemote;
		// request.returnForGet["http://localhost:5984/calendar/newEvent"] =
		// newLocalEvent;
		request.returnForGet["http://localhost:5984/calendar/syncedCalendar"] = syncedCalendar;
		request.returnForGet["http://localhost:5984/calendar/_design/calendar/_view/events_by_cal?key=\"syncedCalendar\""] = {
			rows : [ {
				id : remoteChangedEventLocal._id,
				key : syncedCalendar._id,
				value : remoteChangedEventLocal
			}, {
				id : localEventDeletedOnRemote._id,
				key : syncedCalendar._id,
				value : localEventDeletedOnRemote
			} ]
		};
		googleApi.injectDependencies.request(request);

		// Fake GoogleAPI
		var wrapper = fakeGoogleAPIWrapper();
		wrapper.getCalendarByGoogleId = function(googleId, callback) {
			expect(googleId).toEqual(syncedCalendarAtGoogle.id);
			callback(null, syncedCalendarAtGoogle);
		};
		wrapper.getEventPage = function(googleId, pageToken, callback) {
			if (googleId == syncedCalendarAtGoogle.id) {
				callback(null, {
					items : [ remoteChangedEventGoogle, remoteNewEventGoogle ]
				});
			} else {
				callback("NOT FOUND");
			}
		};
		googleApi.google.api = wrapper;

		it("should report a changed event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();
				expect(todo.newLocal.length).toBe(0);
				expect(todo.changedLocal.length).toEqual(0);

				expect(todo.changedRemote.length).toBe(1);
				var found = false;
				todo.changedRemote.forEach(function(event) {
					if (event.google.id == "remoteChangedEventGoogle") {
						found = true;
					}
				});
				expect(found).toBe(true);
				todo.newLocal.forEach(function(newEvent) {
					expect(newEvent._id).not.toEqual("changedEvent");
				});
				done();
			});
		});
		it("should not report an unchanged event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();

				todo.newRemote.forEach(function(event) {
					expect(event.google.id).not.toEqual("unchangedEventGoogle");
				});
				todo.changedRemote.forEach(function(event) {
					expect(event.google.id).not.toEqual("unchangedEventGoogle");
				});
				done();
			});
		});
		it("should report a new event", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();
				expect(todo.newRemote.length).toBe(1);

				var found = false;
				todo.newRemote.forEach(function(event) {
					if (event.google.id == "newEventGoogle") {
						found = true;
					}
				});
				expect(found).toBe(true);
				todo.changedRemote.forEach(function(event) {
					expect(event.google.id).not.toEqual("newEventGoogle");
				});
				done();
			});
		});
		it("should report an event deleted on remote", function(done) {
			googleApi.injectDependencies.request(request);
			googleApi.google.api = wrapper;
			googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
				expect(err).toBeNull();

				var found = false;
				todo.deletedOnRemote.forEach(function(event) {
					if (event.google.id == "localEventDeletedOnRemoteGoogleId") {
						found = true;
					}
				});
				expect(found).toBe(true);

				done();
			});
		});
	});
});

describe("The method findConflicts", function() {
	var locallyDeletedEvent = {
		_id : "locallyDeletedEvent",
		_rev : "1-134dfajkdsfjk3rjsdkfasd",
		type : "deletedEvent",
		summary : "event1 - deleted",
		calendarId : "syncedCalendar",
		start : {
			date : [ 2013, 11, 26, 7, 0, 0 ]
		},
		end : {
			date : [ 2013, 11, 26, 9, 0, 0 ]
		},
		google : {
			id : "changeEventGoogleId",
			lastSyncedRevision : 1,
			etag : "etag-of-version-1",
		}
	};
	var locallyChangedEvent = {
		_id : "changedEvent",
		_rev : "2-134dfajkdsfjk3rjsdkfasd",
		type : "event",
		summary : "event1 - changed local",
		calendarId : "syncedCalendar",
		start : {
			date : [ 2013, 11, 26, 7, 0, 0 ]
		},
		end : {
			date : [ 2013, 11, 26, 9, 0, 0 ]
		},
		google : {
			id : "changeEventGoogleId",
			lastSyncedRevision : 1,
			etag : "etag-of-version-1",
		}
	};
	var remoteChangedEvent = {
		summary : "event1 - changed remote",
		start : {
			date : [ 2013, 11, 26, 7, 0, 0 ]
		},
		end : {
			date : [ 2013, 11, 26, 9, 0, 0 ]
		},
		google : {
			id : "changeEventGoogleId",
			etag : "etag-of-version-2",
		}
	};
	it("should report an event which changed local & remote", function() {
		var todo = {
			changedRemote : [ remoteChangedEvent ],
			changedLocal : [ locallyChangedEvent ],
		};
		var conflicts = googleApi.findConflicts(todo);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].localEvent).toBe(locallyChangedEvent);
		expect(conflicts[0].remoteEvent).toBe(remoteChangedEvent);
		expect(conflicts[0].localOp).toEqual("change");
		expect(conflicts[0].remoteOp).toEqual("change");
		expect(conflicts[0].googleId).toEqual("changeEventGoogleId");
	});
	it("should report an event which changed locally and was deleted on remote", function() {
		var todo = {
			deletedOnRemote : [ locallyChangedEvent ],
			changedLocal : [ locallyChangedEvent ],
		};
		var conflicts = googleApi.findConflicts(todo);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].localEvent).toBe(locallyChangedEvent);
		expect(conflicts[0].remoteEvent).toBe(null);
		expect(conflicts[0].localOp).toEqual("change");
		expect(conflicts[0].remoteOp).toEqual("delete");
		expect(conflicts[0].googleId).toEqual("changeEventGoogleId");
	});
	it("should report an event which was changed on remote and deleted locally", function() {
		var todo = {
			changedRemote : [ remoteChangedEvent ],
			deletedLocal : [ locallyDeletedEvent ],
		};
		var conflicts = googleApi.findConflicts(todo);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].localEvent).toBe(locallyDeletedEvent);
		expect(conflicts[0].remoteEvent).toBe(remoteChangedEvent);
		expect(conflicts[0].localOp).toEqual("delete");
		expect(conflicts[0].remoteOp).toEqual("change");
		expect(conflicts[0].googleId).toEqual("changeEventGoogleId");
	});
});

describe("The method syncEventByGoogleId", function() {
	describe("when nothing changed locally", function() {
		var remoteChangedEvent = {
			id : "googleEventId",
			etag : "etag-of-version-2",
			summary : "event1 - changed remote",
			start : {
				dateTime : "2013-11-26T08:00:00+01:00"
			},
			end : {
				dateTime : "2013-11-26T10:00:00+01:00"
			},
		};
		var localUnchangedEvent = {
			_id : "localEventId",
			_rev : "1-asdfasjdkfalsjf",
			name : "event1 - unchanged",
			start : {
				date : [ 2013, 11, 26, 7, 0, 0 ]
			},
			end : {
				date : [ 2013, 11, 26, 9, 0, 0 ]
			},
			google : {
				id : "googleEventId",
				lastSyncedRevision : 1,
				etag : "etag-of-version-1",
			}
		};
		
		var request = requestSpy();
		request.returnForGet["http://localhost:5984/calendar/_design/calendar/_view/event_by_google_id?key=\"" + localUnchangedEvent.google.id + "\""] = {
			rows : [ {
				id : localUnchangedEvent._id,
				key : localUnchangedEvent._id,
				value : localUnchangedEvent
			}, ]
		};
		it("should update an event which changed in Google", function(done) {
			var req = {
				query : {
					googleId : "googleEventId"
				}
			};
			googleApi.google.api = {
				getEvent : function(googleId, callback) {
					expect(googleId).toEqual(remoteChangedEvent.id);
					callback(null, remoteChangedEvent);
				},
			};
			spyOn(request, 'put').andCallFake(function(opts, callback) {
				callback();
			});
			googleApi.injectDependencies.request(request);
			// req, res
			googleApi.syncEventByGoogleId(req, {
				send : function(obj) {
					expect(obj.err).not.toBeDefined();

					expect(request.put.calls.length).toBe(1);
					var persistedDoc = request.put.calls[0].args[0].json;
					var whatShouldBePersistedToCouch = {
							_id: "localEventId",
							_rev :"1-asdfasjdkfalsjf",
							type: "event",
							name: "event1 - changed remote",
							start : {
								date : [ 2013, 11, 26, 7, 0, 0 ]
							},
							end : {
								date : [ 2013, 11, 26, 9, 0, 0 ]
							},
							google : {
								id : "googleEventId",
								lastSyncedRevision : 2,
								etag : "etag-of-version-2",
							}
						};
					expect(persistedDoc._id).toEqual("localEventId");
					// rev will be increased in couch! 
					expect(persistedDoc._rev).toEqual("1-asdfasjdkfalsjf");
					expect(persistedDoc.name).toEqual("event1 - changed remote");
					expect(persistedDoc.google.id).toEqual("googleEventId");
					expect(persistedDoc.google.lastSyncedRevision).toEqual(2);
					expect(persistedDoc.google.etag).toEqual("etag-of-version-2");
					done();
				}
			});
		});
	});
});