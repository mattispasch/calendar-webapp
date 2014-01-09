var calendarApp = angular.module('calender-webapp', [ 'ngRoute', 'calendarControllers', 'googleControllers', 'commonFilters' ]);

calendarApp.config([ '$routeProvider', function($routeProvider) {
	$routeProvider.when('/agenda', {
		templateUrl : 'partials/agenda.html',
		controller : 'AgendaCtrl'
	}).when('/list', {
		templateUrl : 'partials/list.html',
		controller : 'ListCtrl'
	}).when('/trash', {
		templateUrl : 'partials/trash.html',
		controller : 'TrashCtrl'
	}).when('/google-register-api-key', {
		templateUrl : 'partials/registerApiKey.html',
		controller : 'RegisterApiKeyCtrl'
	}).when('/google-allow', {
		templateUrl : 'partials/google-connect.html',
		controller : 'GoogleConnectCtrl'
	}).when('/google-test-api', {
		templateUrl : 'partials/google-test.html',
		controller : 'GoogleTestCtrl'
	}).when('/google-synchronize', {
		templateUrl : 'partials/google-synchronize.html',
		controller : 'GoogleSynchronizeCtrl'
	}).otherwise({
		redirectTo : '/list'
	});
} ]).config(function($sceDelegateProvider) {
	$sceDelegateProvider.resourceUrlWhitelist([
	// Allow same origin resource loads.
	'self',
	// does not work...:
	'https://accounts.google.com/o/oauth2/*' ]);
});