var googleControllers = angular.module('googleControllers', []);

googleControllers.controller('RegisterApiKeyCtrl', [ '$scope', '$http', '$location',

function RegisterApiKeyCtrl($scope, $http, $location) {

	var url = "couch/google-sync";

	$scope.syncInfo = {};
	$scope.showForm = false;

	$http.get(url).success(function(data) {
		$scope.syncInfo = data;
		$scope.showForm = true;
	}).error(function(err) {
		// sync Info exisitert wahrscheinlich einfach noch nicht
		$scope.syncInfo = {};
		$scope.showForm = true;
	});

	$scope.save = function() {
		$http.put(url, $scope.syncInfo).success(function() {
			$location.path("/google-register-api-key");
		}).error(function(err) {
			alert("ERROR: " + JSON.stringify(err));
		});
	};

} ]);

googleControllers.controller('GoogleConnectCtrl', [ '$scope', '$http', '$location',

function GoogleConnectCtrl($scope, $http, $location) {

	var url = "/google-sync/generateAuthUrl";

	$http.get(url).success(function(data) {
		$scope.authUrl = data.authUrl;
	}).error(function(err) {
		alert("ERROR: " + err);
	});

} ]);

googleControllers.controller('GoogleTestCtrl', [ '$scope', '$http', '$location',

function GoogleTestCtrl($scope, $http, $location) {
	var url = "/google-sync/apitest"
	$http.get(url).success(function(data) {
		$scope.test = data;
		$scope.calendars = data;

	}).error(function(err) {
		alert("ERROR: " + err);
	});

	$scope.save = function() {
		$scope.calendars.forEach(function(cal) {
			if (cal.google.synchronize && !cal.id) {
				cal.id = generateUUID();
			}
			if (cal.id) {
				// calendar will not be synchronized anymore...
				$http.put("/couch/" + cal.id, cal).success(function() {
					// expected...
				}).error(function(err) {
					alert("Error persisting calender: " + cal.name + " (ID: " + cal.id + ")");
				});
			}

		});
	};

} ]);

googleControllers.controller('GoogleSynchronizeCtrl', [ '$scope', '$http', '$location',

function GoogleSynchronizeCtrl($scope, $http, $location) {
	
	var viewUrl = "/couch/_design/calendar/_view/by_google_id";
	
	$http.get(viewUrl).success(function(data) {
		$scope.calendars = [];
		data.rows.forEach(function(row) {
			if(row.value.google.synchronize) {
				$scope.calendars.push(row.value);
			}
		});
	}).error(function(err) {
		alert("ERROR: " + err);
	});
	
	

	$scope.sync = function(calId) {
		var syncUrl = "/google-sync/sync?id=" + calId;
		console.log("Triggered GoogleSync, CalID: " + calId);
		$http.get(syncUrl).success(function(data) {
			$scope.log = data.log;
		}).error(function(err) {
			alert("ERROR: " + err);
		});
	};

	$scope.showSyncTodo = function(calId) {
		var syncUrl = "/google-sync/getSyncTodo?id=" + calId;
		console.log("get SyncTodo, CalID: " + calId);
		$http.get(syncUrl).success(function(data) {
			$scope.todo = data.todo;
			$scope.conflicts = data.conflicts;
		}).error(function(err) {
			alert("ERROR: " + err);
		});
	};

	
} ]);
