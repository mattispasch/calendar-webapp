// Node Dependencies
var request = require('request');
var async = require('async');

// local
var UUID = require('../lib/uuid');

// config
var db = "http://localhost:5984/calendar";

exports.deleteEvents = function(req, res) {
	var view_eventsByCal = db + "/_design/calendar/_view/events_by_cal?key=";
	var calId = req.query.calId;

	var url = view_eventsByCal + '"' + calId + '"';

	console.log("DELETING ALL EVENTS FOR CALENDAR " + calId);

	var events = [];
	async.series([ function retrieveEventIds(callback) {
		request.get(url, function(err, res, body) {
			if (err) {
				return callback(err);
			}
			var json = JSON.parse(body);
			json.rows.forEach(function(row) {
				events.push(row.id);
			});
			callback();
		});
	}, function deleteEvents(callback) {
		var batchId = UUID.generate();
		async.mapSeries(events, function(event, callback) {
			var url = db + "/" + event;
			request.get(url, function(err, res, body) {
				if (err) {
					return callback(err);
				}
				var json = JSON.parse(body);
				json.type = 'deletedEvent';
				json.dateDeleted = Date.now();
				if (!json.batch || !json.batch.push) {
					json.batch = [];
				}
				json.batch.push(batchId);
				request.put({
					url : url,
					json : json
				}, function(err, res, body) {
					if (err) {
						return callback(err);
					}
					callback(null, body);
				});
			});
		}, function(err, results) {
			callback(err);
		});
	} ], function(err) {
		if (err) {
			res.send("ERROR: " + err);
		} else {
			res.send("Successful =)");
		}
	});
};

exports.emptyEventTrash = function(req, res) {
	var view = db + "/_design/calendar/_view/event_trash";

	console.log("DELETING EVENT-TRASH!");

	var events = [];
	async.series([ function retrieveEventIds(callback) {
		request.get(view, function(err, res, body) {
			if (err) {
				return callback(err);
			}
			var json = JSON.parse(body);
			json.rows.forEach(function(row) {
				events.push({id : row.id, rev : row.value._rev});
			});
			callback();
		});
	}, function deleteEvents(callback) {

		async.mapSeries(events, function(event, callback) {
			var url = db + "/" + event.id + "?rev=" + event.rev;
			request({
				url : url,
				method : 'delete',
			}, function(err, res, body) {
				if (err) {
					return callback(err);
				}
				callback(null, body);
			});
		}, function(err, results) {
			results.forEach(function(r) {
				console.log(r);
			});
			callback(err);
		});
	} ], function(err) {
		if (err) {
			console.error("ERROR: " + err);
			res.send("ERROR: " + err, 500);
		} else {
			res.send("Successful =)");
		}
	});
};