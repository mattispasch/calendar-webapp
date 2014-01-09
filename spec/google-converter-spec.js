var converter = require("../lib/googleConverter");

describe("The Date and Time converter", function() {
	it("should convert a google date string to an array", function() {
		var res = converter.convertDateAndTime("2010-03-29T10:00:00+00:00");
		expect(res).toEqual([2010, 03, 29, 10, 00, 00]);
	});
	it("should convert to a UTC Time", function() {
		var res = converter.convertDateAndTime("2010-03-29T10:00:00+02:00");
		expect(res).toEqual([2010, 03, 29, 8, 00, 00]);
	});
	it("should convert an allday-event", function() {
		var eventDate = {
				date: "2010-01-15"
		};
		var res = converter.convertDate(eventDate);
		expect(res).toEqual({ date : [2010, 1, 15]});
	});
});