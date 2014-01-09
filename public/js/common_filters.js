var commonFilters = angular.module('commonFilters', []);

commonFilters.filter('date', function() {
	return function(input) {
		if(!input) {
			return;
		}
		if (input.date) {

			// DOES NOT WORK AS IN DOCUMENTATION!?: moment().utc(Number[])
			// var copy = input.dateTime.slice();
			// month must be in between 0..11 not 1..12
			// copy[1]--;
			// var date = moment().utc(copy).local();

			var dateUTC = moment().utc();
			dateUTC.year(input.date[0]);
			// month must be in between 0..11 not 1..12
			dateUTC.month(input.date[1] - 1);
			dateUTC.date(input.date[2]);

			if (input.date.length == 3) {
				// All-Day event
				var dateLocal = dateUTC.local();
				return dateLocal.format("ll");
			} else {
				dateUTC.hours(input.date[3]);
				dateUTC.minutes(input.date[4]);
				dateUTC.seconds(input.date[5]);

				var dateLocal = dateUTC.local();
				return dateLocal.format("llll");
			}
		} else {
			console.error( "input.date was expected, other types not implemented.");
			return "Invalid Date!";
		}
	};
});
