var assert = require('assert');

// Specification:
// http://www.rfc-editor.org/rfc/rfc5545.txt 3.3.10
var doLog = true;

function log(s) {
	if (doLog) {
		console.log("[recurrenceConverter] " + s);
	}
}

exports.recurrenceAsJson = function(recurrence) {
	if(!recurrence) {
		return;
	}
	return rruleAsJson(recurrence[0]);
};

exports.rruleAsJson = rruleAsJson = function(recurrenceString) {
	if (!recurrenceString || recurrenceString == "") {
		return;
	}
	log("Begins with: " + recurrenceString.slice(0, 6));
	assert(recurrenceString.slice(0, 6) == 'RRULE:', "Failed to convert reccurence String: Must start with 'RRULE:', String: " + recurrenceString);
	// cut of 'RRULE:'
	recurrenceString = recurrenceString.slice(6);

	var parts = recurrenceString.split(";");
	log(parts);

	var opts = {};
	parts.forEach(function(part) {
		var split = part.split('=');
		var prop = split[0];
		var value = split[1];
		opts[prop] = value;
	});

	var reccurence = {};
	if (opts.FREQ) {
		reccurence.frequency = getFrequency(opts.FREQ);
		delete (opts.FREQ);
		if (opts.INTERVAL) {
			// apply Interval (multiply all frequency values):
			log("applying interval: " + opts.INTERVAL);
			for ( var i = 0; i < reccurence.frequency.length; i++) {
				reccurence.frequency[i] = reccurence.frequency[i] * opts.INTERVAL;
			}
			delete (opts.INTERVAL);
		}
	}
	
	if(opts.BYMONTH) {
		reccurence.by = reccurence.by || {};
		reccurence.by.month = parseInt(opts.BYMONTH);
		delete(opts.BYMONTH);
	}
	
	if(opts.BYMONTHDAY) {
		reccurence.by = reccurence.by || {};
		reccurence.by.monthDay = parseInt(opts.BYMONTHDAY);
		delete(opts.BYMONTHDAY);
	}
	
	
	// Weekstart!?
	if(opts.WKST){
		delete(opts.WKST);
	}

	checkForUnknownProps(opts);

	return reccurence;
};

var getFrequency = function(value) {
	switch (value) {
	case "YEARLY":
		return [ 1 ];
	case "MONTHLY":
		return [ 0, 1 ];
	default:
		assert(false, "Failed to convert reccurence String: Frequency value unknown: " + value);
	}
};

var checkForUnknownProps = function(opts) {
	for ( var prop in opts) {
		switch (prop) {
		default:
			assert(false, "Failed to convert reccurence String: Unknown Property: " + prop + " Value: " + opts[prop]);
			break;
		}
	}
};