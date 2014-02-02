var moment = require("moment");
var recurrenceConverter = require("./iCalRecurrenceConverter");

exports.convertDateAndTime = convertDateAndTime = function(dateString) {
	var date = moment(dateString);
	date.utc();
	// date.day(): Day of the Week
	// date.month(): 0-11 -> we want 1..12
	return [ date.year(), date.month() + 1, date.date(), date.hour(), date.minute(), date.second() ];
};

exports.convertDateWithoutTime = convertDateWithoutTime = function(dateString) {
	var date = moment(dateString, "YYYY-MM-DD");
	// date.day(): Day of the Week
	// date.month(): 0-11 -> we want 1..12
	return [date.year(), date.month() + 1, date.date()];
};


exports.convertDate = convertDate = function convertDate(eventDate) {
	if(!eventDate) {
		return null;
	}
	var result = {};
	if (eventDate.date && !eventDate.dateTime) {
		result.date = convertDateWithoutTime(eventDate.date);
	} else if (!eventDate.date && eventDate.dateTime) {
		result.date = convertDateAndTime(eventDate.dateTime);
	} else {
		console.error("ERROR Converting date: " + JSON.stringify(eventDate) + " continouing with empty date!");
	}
	if(eventDate.timeZone) {
		result.timeZone = eventDate.timeZone;
	}
	return result;
};

exports.convertCalendarList = function(googleCalendarList) {
	var list = [];
	googleCalendarList.items.forEach(function(calendarEntry) {
		list.push({
			type : 'calendar',
			name : calendarEntry.summary,
			description : calendarEntry.description,
			location : calendarEntry.location,
			timezone : calendarEntry.timeZone,
			style : {
				foregroundColor : calendarEntry.foregroundColor,
				backgroundColor : calendarEntry.backgroundColor
			},
			google : {
				etag : calendarEntry.etag,
				id : calendarEntry.id,
				colorId : calendarEntry.colorId,
				accessRole : calendarEntry.accessRole,
				selected : calendarEntry.selected,
				kind : calendarEntry.kind
			}
		});

	});
	return list;
};

// https://developers.google.com/google-apps/calendar/v3/reference/events#resource
exports.convertEvent = function(event, calendarId) {
	return {
		type : 'event',
		calendarId : calendarId,
		name : event.summary,
		description : event.description,
		status : event.status,
		/* "start": { "date": date, "dateTime": datetime, "timeZone": string }, */
		start : convertDate(event.start),
		end : convertDate(event.end),
		/* see iCal - Standard */
		recurrence : recurrenceConverter.recurrenceAsJson(event.recurrence),
		/* TODO: specify behaviour, attendees is a list */
		attendees : event.attendees,
		google : {
			etag : event.etag,
			id : event.id,
			// and a lot more....
			originalObject : event
		}
	};
};

exports.convertEventList = function(googleEventList, calendarId) {
	var list = [];
	var that = this;
	googleEventList.forEach(function(event) {
		list.push(that.convertEvent(event, calendarId));
	});
	return list;
};
