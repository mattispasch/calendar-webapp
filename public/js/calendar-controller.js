var calendarControllers = angular.module('calendarControllers', []);

calendarControllers.controller('ListCtrl', [ '$scope', '$http',

function ListCtrl($scope, $http) {

	var view_all = "/couch/_design/calendar/_view/all";
	var deleteEvents = "/admin/deleteEvents?calId=";

	$scope.calendars = [];

	$http.get(view_all).success(function(data) {
		data.rows.forEach(function(row) {
			$scope.calendars.push(row.value);
		});
	});

	$scope.deleteEvents = function(calId) {
		$http.get(deleteEvents + calId).success(function(data) {
			alert("Löschen erfolgreich: " + data);
		}).error(function(err) {
			alert("Error beim löschen: " + err);
		});
	};

} ]);

calendarControllers.controller('AgendaCtrl', [ '$scope', '$http',

function AgendaCtrl($scope, $http) {

	var view = "/couch/_design/calendar/_view/event_by_start_recurrence";

	$scope.events = [];

	var date = moment().utc();
	// month is 0..11, we wan 1..12 like normal humans ;)
	var dateArray = [ date.year(), date.month() + 1, date.date(), date.hour(), date.minute(), date.second() ];
	// var dateArray = [ 2010 ];

	var url = view + "?startkey=" + JSON.stringify(dateArray);
	$http.get(url).success(function(data) {
		data.rows.forEach(function(row) {
			$scope.events.push(row.value);
		});
	});

} ]);

calendarControllers.controller('TrashCtrl', [ '$scope', '$http',

function($scope, $http) {

	var view = "/couch/_design/calendar/_view/event_trash?descending=true&limit=100";
	var emptyEventTrashUrl = "/admin/emptyEventTrash";

	$scope.events = [];
	$scope.totalEvents;

	// var url = view + "?startkey=" + JSON.stringify(dateArray);
	var load = function() {
		$http.get(view).success(function(data) {
			// empty events, important if we are reloading
			$scope.events = [];
			$scope.totalEvents = data.total_rows;
			data.rows.forEach(function(row) {
				$scope.events.push(row.value);
			});
		});
	};
	load();

	$scope.emptyTrash = function() {
		$http.post(emptyEventTrashUrl).success(function(data) {
			load();
		}).error(function(err) {
			alert("Error: " + err);
		});
	};

} ]);