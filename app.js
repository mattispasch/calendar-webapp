
/**
 * Module dependencies.
 */

var express = require('express')
  , user = require('./routes/user')
  , google_api = require('./routes/google_api')
  , admin = require('./routes/admin')
  , http = require('http')
  , path = require('path');

var request = require('request');


var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'hjs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/users', user.list);

// ADMIN
app.get('/admin/deleteEvents', admin.deleteEvents);
app.post('/admin/emptyEventTrash', admin.emptyEventTrash);

// Google Sync:
app.get('/google-sync/generateAuthUrl', google_api.generateAuthUrl);
app.get('/google-sync/codecallback', google_api.codecallback);
app.get('/google-sync/apitest', google_api.selectCalendars);
app.get('/google-sync/sync', google_api.sync);

// CouchDB Forwarding:
app.get('/couch/*', function(req, res) {
	console.log("Forwarding to couch...");
	console.log("old request url " + req.url)
    var newurl = 'http://localhost:5984/calendar' + '/' + req.url.split('/').slice(2).join('/'); // remove the '/api' part
    console.log("new request url " + newurl);
	req.pipe(request(newurl)).pipe(res);
});

app.put('/couch/*', function(req, res) {
	console.log("Forwarding to couch...");
	console.log("old request url " + req.url)
    var newurl = 'http://localhost:5984/calendar' + '/' + req.url.split('/').slice(2).join('/'); // remove the '/api' part
    console.log("new request url " + newurl);
	req.pipe(request.put({url: newurl,json:req.body})).pipe(res);
});

app.post('/couch/*', function(req, res) {
	console.log("Forwarding to couch...");
	console.log("old request url " + req.url)
    var newurl = 'http://localhost:5984/calendar' + '/' + req.url.split('/').slice(2).join('/'); // remove the '/api' part
    console.log("new request url " + newurl);
	request.post({url: newurl,json:req.body}).pipe(res);
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
