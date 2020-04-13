/*
* app.js
*/
/*jslint node : true, continue : true,
devel : true, indent : 2, maxerr : 50,
newcap : true, nomen : true, plusplus : true,
regexp : true, sloppy : true, vars : false,
white : true
*/
/*global */

'use strict';

//===================================
// Module Scope Variant >>> Start

const 
	nodePort = 8080,
	http = require( 'http' ),
	express = require( 'express' ),
	app = express(),
	server = http.createServer( app ),
	bodyParser = require( 'body-parser' ),
	methodOverride = require('method-override'),
	logger = require('morgan'),
	errorHandler = require('errorhandler'),
	i18n = require( 'i18n' ),
	// My libraries
	routes = require( './server/routes' ),
	cors = require('cors')
	;

// Module Scope Variant <<< End
//===================================

//===================================
// Server Configuration >>> Start

console.log(`>>> Node version is ${process.versions.node} <<<`);

// Configuration of Middleware methods.
app.set( 'view engine', 'ejs' );
app.use( bodyParser.json() );
app.use( methodOverride() );
app.use( express.static( __dirname ) );
app.use(cors());
//app.use( express.static( __dirname + '/frontend' ) );

i18n.configure({
	locales: ['en', 'ja'],
	directory: __dirname + '/locales',
	objectNotation: true
});
app.use( i18n.init );

switch ( app.get('env') )
{
	case 'development':
		app.use( logger( 'combined' ) );
		app.use( errorHandler(
		{
			dumpExceptions : true,
			showStack : true
		}) );
		break;
	case 'production':
		app.use( errorHandler() );
		break;
}

routes.configRoutes( app, server );

// Server Configuration <<< End
//===================================

//===================================
// Start Server >>> Start

server.listen( nodePort );

console.log(
	'Express server listening on port %d in %s mode',
	 server.address().port,
	 app.settings.env
);

// Start Server <<< End
//===================================