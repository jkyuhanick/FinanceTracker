// Chris Soplata
// Main

var express = require("express");
var http = require("http");
var path = require("path");
var exphbs = require('express-handlebars');
var mysql = require('mysql2');

// Connect to MySQL database
//var con = mysql.createConnection({
//    host: "",
//    port: "",
//    user: "",
//    password: "",
//    database: ""
//});

// Construct express object
var app = express();

// Set up handlebars
var handlebars = exphbs.create({ defaultLayout: 'main' });
app.engine('.handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
app.use(express.static('views'));

// Get model functions
var support = require("./model/model.js");


// When "/" is submitted as URL, taken to home page
app.get("/", function (request, response) {
    response.render("home");
});

// "/home" taken to homepage
app.get("/home", function (request, response) {
    response.render("home");
});

// taken to placeholder summary page
app.get("/summary", function (request, response) {
    response.render("summary");
});

// Taken to report form
app.get("/reportform", function(request, response) { 
    response.render("reportecho", {previous: support.getPrevious(null)});
});

// Parse report info and create an entity object
app.get("/report", function(request, response, next) {
    request.report = support.createReport(request.query.amount, request.query.info);
    next();
});

// Form element validation
app.get("/report", function(request, response, next) {
    var errors = support.validateReport(request.report);
    
    // if no errors, continues to normal route
    if (Object.keys(errors).length === 0) {
        next();
    }
    else {
        // Atleast one error, add object to request and follow err route
        request.errorlist = errors;   
        next(new Error("report"));
    }
});

// If a validation error occurs, error page displayed
app.use("/report", function(err, request, response, next) {
    if (err.message.includes("report")) {
        response.render("reportecho", {previous: support.getPrevious(request.report),
                                             errors: request.errorlist}); 
    }
    else {
        next(err); // If not an "report" error continue error routing
    }
 });
	
// If reach here, request not handled by any previous gets, so send error page
app.use(function(request, response) {
    response.render("404");
});

app.use(function(err, request, response, next) {
    console.log(err);
    response.writeHead(500, {'Content-Type': 'text/html'});
    response.end('<html><body><h2>Server error!</h2></body></html>');
});

// Listen at port 3000
http.createServer(app).listen(3000);