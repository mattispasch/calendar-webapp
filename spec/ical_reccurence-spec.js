var converter = require("../lib/iCalRecurrenceConverter");

//Specification:
//http://www.rfc-editor.org/rfc/rfc5545.txt 3.3.10

describe("The iCal-Recurrence converter", function() {
	describe("should convert iCal Recurrence Strings to JSON:", function() {
		it("yearly events", function() {
			var res = converter.rruleAsJson("RRULE:FREQ=YEARLY");
			expect(res).toEqual({
				frequency: [1]
			});
		});
		it("yearly events", function() {
			var res = converter.rruleAsJson("RRULE:FREQ=MONTHLY");
			expect(res).toEqual({
				frequency: [0, 1]
			});
		});
		it("an event reuccuring every 6 months", function() {
			var res = converter.rruleAsJson("RRULE:FREQ=MONTHLY;INTERVAL=6");
			expect(res).toEqual({
				frequency: [0, 6]
			});
		});
		it("should ignore weekstart on yearly events", function() {
			var res = converter.rruleAsJson("RRULE:FREQ=YEARLY;WKST=MO");
			expect(res).toEqual({
				frequency: [1]
			});
		});
		it("should convert BYMONTH and BYMONTHDAY correctly", function() {
			var res = converter.rruleAsJson("RRULE:FREQ=YEARLY;WKST=MO;BYMONTH=2;BYMONTHDAY=13");
			expect(res).toEqual({
				frequency: [1],
				by: {
					month: 2,
					monthDay: 13
				}
			});
		});
	});
});