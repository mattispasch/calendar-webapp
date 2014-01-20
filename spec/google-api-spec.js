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

var googleAPIWrapper = function() {
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

			var gaw = googleAPIWrapper();
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
			googleApi.google.api = googleAPIWrapper();

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
				expect(persistedDocuments.length).toEqual(1);
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

	it("should report a locally changed event", function(done) {
		var request = requestSpy();
		request.returnForGet["http://localhost:5984/calendar/changedEvent"] = locallyChangedEvent;
		request.returnForGet["http://localhost:5984/calendar/syncedCalendar"] = syncedCalendar;
		request.returnForGet["http://localhost:5984/calendar/_design/calendar/_views/events_by_cal?key=syncedCalendar"] = {
			values : [ locallyChangedEvent ]
		};

		googleApi.injectDependencies.request(request);

		var wrapper = googleAPIWrapper();
		wrapper.getCalendarByGoogleId = function(googleId, callback) {
			expect(googleId).toEqual("syncedCalendarAtGoogle");

			callback(null, syncedCalendarAtGoogle);
		};
		googleApi.google.api = wrapper;

		googleApi.sync_getTodo(syncedCalendar._id, function(err, todo) {
			expect(err).toBeNull();
			expect(todo.changedRemote.length).toEqual(0);
			expect(todo.changedLocal.length).toBe(1);

			done();
		});
	});
});