/*
* routes.js
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
	settings = require( './lib/settings' ),
	// PROCMODE = "TEST" means that this program DOES NOT set authorization configuration for cloud foundry.
	//PROCMODE = "TEST"
	PROCMODE = ( process.env.VCAP_SERVICES ) ? "PROD" : "TEST",
	UPLOAD_FILE_DIR = "./UploadedFiles",
	reqHandlers = require( './reqHandlers' ),
	fs = require( 'fs' ),
	multer = require( 'multer' ),
	PROC_LOG_DIR = "./server/log",
	PATH_CREATE_INCIDENT = "/create_incident",
	PATH_UPLOAD_FILES = "/upload_files",
	PATH_OPEN_CHAT = "/chat",
	PATH_OPEN_CHAT_UAA = "/chat_uaa",
	os = require('os'),
	HOST_NAME = os.hostname(),
 	passport = require('passport'),
 	passportHttp = require('passport-http'),
 	xsenv = require('@sap/xsenv'),
 	JWTStrategy = require('@sap/xssec').JWTStrategy,
	caiAuth = require('./lib/credentials').CAI_BASIC_AUTH,
	LOCAL_TEST = ( PROCMODE === "TEST" ) ? true : false,
	moment = require("moment")
	;

var
	configRoutes,
	_convertFW2HW,
	_replyToCAI,
	_initItsmVariants,
	_doesFileExists,
	_replyWithMemory,
	_authHandler,
	incidentContents,
	recastMemory,
	recastConvId,
	// "storage" is necessary to avoild to name file randomly.
	storage = multer.diskStorage({
		destination: function( req, file, cb ){
			cb( null, UPLOAD_FILE_DIR )
		},
		filename: function( req, file, cb ){
			cb( null, file.originalname )
		}
	}),
	upload = multer({ storage: storage })
	;

// Module Scope Variant <<< End
//===================================

//===================================
// Initialization >>> Start
console.log( `>>> PROCMODE (wheather "process.env.VCAP_SERVICES" is existing or not, if it exists, PROCMODE is "PROD") = ${PROCMODE}, and LOCAL_TEST = ${LOCAL_TEST} <<<` );
// Initialization <<< End
//===================================

//===================================
// Utility Method >>> Start
_authHandler = ( reqPath ) => {
	console.log(`=== Sub proc _authHandler for the request ${reqPath} ===`);

	switch ( reqPath ){
		case PATH_OPEN_CHAT:
		case PATH_OPEN_CHAT + '/':
			console.log(`>>> Specific procedure for ${reqPath} <<< \n@@@ Nothing is done here`);
			break;
		/*
		case PATH_OPEN_CHAT_UAA:
		case PATH_OPEN_CHAT_UAA + '/':
			console.log(`>>> Specific procedure for ${reqPath} <<<\n@@@ XSUAA setting is done here, if it is not LOCAL_TEST(${LOCAL_TEST}).`);
			( LOCAL_TEST ) ? console.log(`@@@ This is the local test, so it does not execute XSUAA relevant settings.`) : passport.use(new JWTStrategy( xsenv.getServices({ uaa: 'myuaa' }).uaa ));
			break;
		*/
		default:
			console.log(`>>> DEFAULT procedure for ${reqPath} <<<\n@@@ The setting of BASIC authentification is done here.`);
			passport.use(new passportHttp.BasicStrategy( 
				function (username, password, done){
					if ( username === caiAuth.USER && password === caiAuth.PASS ){
					console.log(`>>> Basic Authentication for the path ${reqPath} is OK <<<`);
					return done(null, true);
					}
					else {
					console.error(`!!! Basic Authentication for the path ${reqPath} is failed !!!`);
					return done(null, false);
					}
				}
			));
			break;
	}
};


_initItsmVariants = function() {

	console.log( "=== Variant Initialization _initItsmVariants ===" );
	//Incident contents for Redmine.
	incidentContents = {
		"issue": {
		  "project_id": 1,
		  "tracker_id": 1,
		  "priority_id": 2,
		  "subject": "Test ticket created by Node Application.",
		  "description": "This is created via Node application.",
		  "category_id": 1,
		  "assigned_to_id": 1,
		  "due_date": "2020-03-31",
		  "estimated_hours": 8
		}
	};
};

_convertFW2HW = function ( fwString ) {
	var hwString;
	hwString = fwString.replace( /[Ａ-Ｚａ-ｚ０-９]/g, function( s ){ return String.fromCharCode(s.charCodeAt(0) - 65248); });
	return hwString;
};

_replyToCAI = function( response, replyMsg, replyURL, additionalMsg ){
	console.log( "=== Replying message to chat: SubProc(CallBack) _replyIncident ===" );
	console.log(">>> replyMsg in _replyIncident >>>", replyMsg );
	console.log(">>> replyURL in _replyIncident >>>", replyURL );

	// It might be arrived here with the error, in this case it is necessary to delete uploaded directory and files in it.
	// This is because if the error was happened at creating an incident, attaching/sending/deleting files procedures would be skipped. 
	// It would be OK that following delete procedures are exeucted asyncronously, because the result of directory/files deletion are not influence with subsequent procedures.
	// It is possible to make it synchronously with adding await, but this is the final calling so it is omitted.
	// !!! This is deprecated, because message is not replied after the incident creation.!!!
	//reqHandlers.deleteUploadedDirFiles( UPLOAD_FILE_DIR + "/" + recastConvId )
	//.catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _replyIncident) !!!", err ); });;

	if ( replyURL === undefined ){
		response.send({
			replies: [
				{
					type: 'text',
					content: replyMsg,
					markdown: true
				}],
				conversation: {
					memory: {}
				}
			});
	}
	else {
		if ( additionalMsg === undefined ){
			response.send({
				replies: [
					{
						type: 'text',
						content: replyMsg,
						markdown: true
					},
					{
						type: "buttons",
						content: {
							"title": response.__( 'general.btnIncidentTitle' ),
							"buttons": [{
								"title": response.__( 'general.btnIncidentLink' ),
								"type": "web_url",
								"value": replyURL
							}]
						}
					}
				],
				conversation: {
					memory: {}
				}
			});
		}
		else {
			console.log(">>> additionalMsg in _replyIncident", additionalMsg );

			response.send({
				replies: [
					{
						type: 'text',
						content: additionalMsg,
						markdown: true
					},
					{
						type: 'text',
						content: replyMsg,
						markdown: true
					},
					{
						type: "buttons",
						content: {
							"title": response.__( 'general.btnIncidentTitle' ),
							"buttons": [{
								"title": response.__( 'general.btnIncidentLink' ),
								"type": "web_url",
								"value": replyURL
							}]
						}
					}
				],
				conversation: {
					memory: {}
				}
			});
		}
	}
		
};

_replyWithMemory = function( response, replyType, replyMsg, replyMemory ){
	console.log( "=== Replying message to chat with Memory: SubProc _replyWithMemory ===" );
	console.log(">>> replyType in _replyWithMemory >>>", replyType );
	console.log(">>> replyMsg in _replyWithMemory >>>", replyMsg );
	console.log(">>> replyMemory in _replyWithMemory >>>", replyMemory );
	
	response.send({
		replies: [
			{
				type: replyType,
				content: replyMsg
			}],
			conversation: {
				memory: replyMemory
			}
		});
};

_doesFileExists = function( file ){
	try{
		fs.statSync( file );
		return true;
	}
	catch( err ){
		if( err.code === 'ENOENT' ) return false;
	}
};

// Utility Method <<< End
//===================================


//===================================
// Public Method >>> Start

configRoutes = function( app, server )
{
	app.all( '/*', function ( request, response, next ){
		var _errMsg;

		console.log( "=== Route: app.all ===" );
		console.log( `>>> Request method is ${request.method}, path is ${request.path}, original url is ${request.originalUrl} <<<`);

		// Authentification specific procedure
		app.use( passport.initialize() );
		_authHandler( request.path );

		// In the case that there is no conversation property, it is not necessary to execute following RECAST specific procedures, and should be go to the next route.
		if ( request.body.conversation ){
			//_loggingBody( request.body );
			recastMemory = request.body.conversation.memory;
			recastConvId = request.body.conversation.id;
			response.setLocale(request.body.conversation.language);
			_initItsmVariants();
			
			//Get authorization configuration
			if ( PROCMODE === "TEST" ){
				console.log("<<< This is the TEST Mode, no authorization is used for Cloud Foundry >>>");
				next();
			}
			else {
				console.log("<<< This is the PROD Mode (i.e. Other than TEST) >>>");
				_errMsg = reqHandlers.getAuthConfig( function(){ 
					//console.log( "Share's authconfig in callback>>> ", require('./lib/share').authConfig );
					next();
				});
				if ( _errMsg ){
					console.error("!!! Error has been happened while getting the authorization token !!!");
					response.send({
						replies: [
							{
								type: 'text',
								content: _errMsg
							}],
							conversation: {
								memory: {}
							}
					});
				}
			}
		}
		else{
			next();
		}
	});
	/*
	app.get( '/', function ( request, response )
	{
		response.redirect( '/index.html' );
	});
	*/
	app.get( PATH_OPEN_CHAT, ( request, response ) => {
		console.log( `=== Route: ${PATH_OPEN_CHAT} ===` );
		console.log(`>>> The contents of request >>> ${request}`);

		const userId = ( request.user ) ? request.user.id : "Unknown"; 
		( LOCAL_TEST ) ? response.render( 'index', { userId: userId }) : response.redirect( PATH_OPEN_CHAT_UAA );
	});
	
	app.get( PATH_OPEN_CHAT_UAA, passport.authenticate('JWT', { session: false }), ( request, response ) => {
		console.log( `=== Route: ${PATH_OPEN_CHAT_UAA} ===` );
		console.log(`>>> The contents of request >>> ${request}`);
		//response.send('Application user: ' + request.user.id);
		//response.sendFile('public/index.html');
		const userId = ( request.user ) ? request.user.id : "Unknown";

		response.render( 'index', { userId: userId });
	});

	// "upload_files" is called from only Webchat.
	app.post( PATH_UPLOAD_FILES, upload.array('uploadFiles', 10), function( request, response ){

		console.log( `=== Route: app.post: ${PATH_UPLOAD_FILES} ===` );
		console.log('>>> request.body.convId >>>', request.body.convId );
		console.log('>>> request.files >>>', request.files );

		var _childUploadFilesDir = UPLOAD_FILE_DIR + "/" + request.body.convId;

		// Create the child folder (named conversation ID) in the directory UPLOAD_FILE_DIR.
		if ( !fs.existsSync( _childUploadFilesDir ) ) fs.mkdirSync( _childUploadFilesDir );

		// Move uploaded files to the child directory.
		for ( const file of request.files ){
			let _oldPath = file.destination + "/" + file.filename,
				_newPath = _childUploadFilesDir + "/" + file.filename;

			if ( !fs.existsSync( _newPath ) ){
				fs.renameSync( _oldPath, _newPath );
				console.log( ">>> Uploaded file is stored as >>>", _newPath );
			}
			else{
				// This is the case that resume the coversation with Reset button.
				console.log( "*** Uploaded file is already existing in ***", _newPath );
				console.log( ">>> Therefore temporary stored file (before moving) will be deleted >>>", _oldPath );
				if ( fs.existsSync( _oldPath ) ){
					// File will be deleted asynchronously.
					fs.unlink( _oldPath , (err) => {
						if ( err ){
							console.error( `!!! Error: Cannot delete the file ${_oldPath}.` );
						}
						else{
							console.log( ">>> File was deleted >>>", _oldPath );
						}
					});
				}
			}
		}	

		response.send({ results: request.files });
		
	});

	app.post( PATH_CREATE_INCIDENT, passport.authenticate('basic', { session: false }), function( request, response ){

		console.log( `=== Route: app.post: ${PATH_CREATE_INCIDENT} ===` );

		incidentContents.issue.subject = recastMemory.issueTitle || 'No title from CAI';

		reqHandlers.createIncident( response, incidentContents, recastConvId, _replyToCAI );

	});

	app.post('/errors', function( request, response ){
		console.log( "=== Route: app.post: /errors ===" );
		console.log( request.body );
		response.send();
	});

};


// Public Method <<< End
//===================================


//===================================
// Module Initialization >>> Start

module.exports = { configRoutes : configRoutes };

// Module Initialization <<< End
//===================================