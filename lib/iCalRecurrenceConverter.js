var assert = require('assert');
var moment = require('moment');

// Specification:
// http://www.rfc-editor.org/rfc/rfc5545.txt 3.3.10
var doLog = true;

function log(s) {
	if (doLog) {
		console.log("[recurrenceConverter] " + s);
	}
}

exports.recurrenceAsJson = function(recurrence) {
	if (!recurrence) {
		return;
	}
	return rruleAsJson(recurrence[0]);
};

exports.rruleAsJson = rruleAsJson = function(recurrenceString) {
	if (!recurrenceString || recurrenceString == "") {
		return;
	}

	assert(recurrenceString.slice(0, 6) == 'RRULE:', "Failed to convert recurrence String: Must start with 'RRULE:', String: " + recurrenceString);
	// cut of 'RRULE:'
	recurrenceString = recurrenceString.slice(6);

	var parts = recurrenceString.split(";");

	var opts = {};
	parts.forEach(function(part) {
		var split = part.split('=');
		var prop = split[0];
		var value = split[1];
		opts[prop] = value;
	});

	log("Opts: " + JSON.stringify(opts));

	var recurrence = {};
	if (opts.FREQ) {
		recurrence.frequency = getFrequency(opts.FREQ);
		delete (opts.FREQ);
		if (opts.INTERVAL) {
			// apply Interval (multiply all frequency values):
			log("applying interval: " + opts.INTERVAL);
			for ( var i = 0; i < recurrence.frequency.length; i++) {
				recurrence.frequency[i] = recurrence.frequency[i] * opts.INTERVAL;
			}
			delete (opts.INTERVAL);
		}
	}

	if (opts.UNTIL) {
		// this regexp is for iCal DATE-TIME values. See http://www.rfc-editor.org/rfc/rfc5545.txt, page 33
		// this is already UTC Time!
		var regexp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
		
		assert(regexp.test(opts.UNTIL), "Failed to convert recurrence String: UNTIL didn't match REGEXP, only UTC DATE-TIME values are supported: " + opts.UNTIL);
		
		var until = opts.UNTIL.match(regexp);
		
		until.shift();
		for(var i in until) {
			until[i] = parseInt(until[i]);
		}
		
		log("UNTIL: " + until);
		
		recurrence.until = until;		
		delete(opts.UNTIL);
	}

	if(opts.COUNT) {
		recurrence.count = parseInt(opts.COUNT);
		delete(opts.COUNT);
	}
	
	if (opts.BYMONTH) {
		recurrence.by = recurrence.by || {};
		recurrence.by.month = parseInt(opts.BYMONTH);
		delete (opts.BYMONTH);
	}

	if (opts.BYMONTHDAY) {
		recurrence.by = recurrence.by || {};
		recurrence.by.monthDay = parseInt(opts.BYMONTHDAY);
		delete (opts.BYMONTHDAY);
	}
	
	if(opts.BYDAY) {
		//means "weekday"
		recurrence.by = recurrence.by || {};
		recurrence.by.weekDays = opts.BYDAY.split(',');
		delete(opts.BYDAY);
	}

	// Weekstart!?
	if (opts.WKST) {
		delete (opts.WKST);
	}

	checkForUnknownProps(opts);

	return recurrence;
};

var getFrequency = function(value) {
	switch (value) {
	case "YEARLY":
		return [ 1 ];
	case "MONTHLY":
		return [ 0, 1 ];
	case "WEEKLY":
		return [ 0, 0, 7 ];
	default:
		assert(false, "Failed to convert recurrence String: Frequency value unknown: " + value);
	}
};

var checkForUnknownProps = function(opts) {
	for ( var prop in opts) {
		switch (prop) {
		default:
			assert(false, "Failed to convert recurrence String: Unknown Property: " + prop + " Value: " + opts[prop]);
			break;
		}
	}
};