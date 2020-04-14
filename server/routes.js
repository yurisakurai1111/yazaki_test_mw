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
	apis = require( './services/apis' ),
	// PROCMODE = "TEST" means that this program DOES NOT set authorization configuration for cloud foundry.
	//PROCMODE = "TEST"
	PROCMODE = ( process.env.VCAP_SERVICES ) ? "PROD" : "TEST",
	UPLOAD_FILE_DIR = "./UploadedFiles",
	reqHandlers = require( './reqHandlers' ),
	fs = require( 'fs' ),
	multer = require( 'multer' ),
	PROC_LOG_DIR = "./server/log",
	PATH_CREATE_INCIDENT = "/create_incident",
	PATH_SEARCH_MANUAL = "/search_manual",
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
	LOCAL_TEST = ( PROCMODE === "TEST" ) ? true : false
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
	// * "assigned_to_id": 1 is omitted, because if non-existing id is specified the system returns HTTP 422 Unprocessable Entity during creation of Redmine ticket.
	incidentContents = {
		"issue": {
		  "project_id": 1,
		  "tracker_id": 1,
		  "priority_id": 2,
		  "subject": "Test ticket created by Node Application.",
		  "description": "This is created via Node application."
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

		reqHandlers.createIncident( response, recastMemory, incidentContents, recastConvId, _replyToCAI );

	});

	app.post( PATH_SEARCH_MANUAL, passport.authenticate('basic', { session: false }), async (request, response) => {
		console.log( `=== Route: ${request.path} ===` );

		const 
			lang = recastMemory.docSearchLangKey || request.body.conversation.language,
			manId = recastMemory.searchManId || "all",
			generalManDir = `./server/lib/manuals`,
			lunrIndexFileName = `${generalManDir}/index/${lang}/lunr_${manId}_index_${lang}.json`,
			requiredManualFile = `./lib/manuals/${lang}/${manId}_manuals_${lang}`,
			manualsFile = `${generalManDir}/${lang}/${manId}_manuals_${lang}.js`
			;

		let searchTerms = recastMemory.manualSearchPhrase;

		console.log(`>>> Document search language is ${lang}, and Manual ID is ${manId} <<<`);

		//Translate Japanese search terms into English.
		if ( lang === 'ja' ){
			searchTerms = await apis.translateText( searchTerms, 'ja', 'en' );
		}

		// This part is for avoiding the crash of application.
		// Normally ":" is used for specifying the field to be searched in Lunr (https://lunrjs.com/guides/searching.html).
		searchTerms = searchTerms.replace( ':', '' );

		console.log( `>>> Search Terms just before seraching: ${searchTerms} <<<` );

		reqHandlers.searchManual( lunrIndexFileName, searchTerms, ( manuals ) => {
			let replyElements = [];

			if ( manuals.length === 0 ){
				recastMemory.noManualFound = true;
				_replyWithMemory( response, 'text', response.__( 'manual.msgNoManualFound' ), recastMemory );
			}
			else {
				let manualCatlog;
				recastMemory.noManualFound = false;

				if ( manId === "all" ){
					manualCatlog = JSON.parse( fs.readFileSync( manualsFile, 'utf8' ) );
				}
				else{
					manualCatlog = require( requiredManualFile ).manuals;
				}
				

				for ( let i = 0; i < manuals.length; i++ ){
					if ( i === 5 ) break;

					const manualDetail = manualCatlog.find( item => item.title === manuals[i].ref );
					const linkToManual = ( manualDetail ) ? manualDetail.link : `Link to Not Found page should be here!`;
					
					const replyElemObj = {
						title: `Manual: ${i + 1}`,
						subtitle: manuals[i].ref,
						buttons:[
							{
								title: response.__( 'manual.linkToManual' ),
								type: "web_url",
								value: linkToManual
							}
						]
					}
	
					replyElements.push( replyElemObj );
				}
	
				_replyWithMemory( response, 'list', {elements: replyElements}, recastMemory );
				/*
				response.send({
					replies: [
					{
						type: 'list',
						content: {
							elements: replyElements
						},
						markdown: true
					}]
				});
				*/
			}
			
		});

	})

	app.post( '/create_lunr_index', async ( request, response ) => {
		console.log( `=== Route: ${request.path} ===` );

		const _deleteFileIfExist = ( fileName ) =>{
			if ( fs.existsSync( fileName ) ){
				try {
					fs.unlinkSync( fileName );
					console.log(`>>> ${fileName} was already existing and deleted before newly created <<<`);
				}
				catch( err ){
					console.error( `!!! Error: Cannot delete the file ${fileName}.!!!` );
					response.status(500).send(`!!! Error when deleting the file ${fileName} !!!`);
				}
			}
		};

		if ( !request.body.language ){ 
			response.status(400).send('!!! No language information, specify the language id (e.g. "language": "ja" ) in the body !!!'); 
		}
		else if ( !request.body.manId ) {
			response.status(400).send('!!! No ID for manuals, specify the manual id (i.e. "manId": "biz" or "ope" ) in the body !!!'); 
		}
		else {
			const 
				lang = request.body.language,
				manId = request.body.manId,
				generateKeywords = request.body.generateKeywords || false,
				generalManDir = `./server/lib/manuals`,
				manualFileLangDir = `${generalManDir}/${lang}`,
				lunrIndexFileName = `${generalManDir}/index/${lang}/lunr_${manId}_index_${lang}.json`,
				requiredManualFile = `./lib/manuals/${lang}/${manId}_manuals_${lang}`,
				manualsFile = `${generalManDir}/${lang}/${manId}_manuals_${lang}.js`
				;

			if ( manId === "all" ){
				if ( !fs.existsSync( `${manualFileLangDir}` ) ){
					response.status(500).send(`!!! Cannot find the directory ${manualFileLangDir} !!!`);
					console.error( `!!! Cannot find the directory ${manualFileLangDir} !!!` );
				}
				else {
					_deleteFileIfExist( manualsFile );

					const allManuals = fs.readdirSync( manualFileLangDir );
					let allManCatalogue = [];

					allManuals.forEach( (fn) =>{
						let manCatalogue = `${manualFileLangDir}/${fn}`;
						manCatalogue = manCatalogue.replace('/server', '');

						allManCatalogue = allManCatalogue.concat( require( manCatalogue ).manuals );
					})

					fs.writeFile( manualsFile, JSON.stringify( allManCatalogue ), ( err ) =>{
						if ( err ) throw err;
						console.log(`>>> ${manualsFile} is written <<<`);
						//let reqMan = JSON.parse( fs.readFileSync( manualsFile, 'utf8' ) );
						//console.dir( reqMan );
					} );

					_deleteFileIfExist( lunrIndexFileName );

					reqHandlers.createLunrIndex( allManCatalogue, lunrIndexFileName );
					response.send(`${lunrIndexFileName} is created.`);
				}
			}
			else {
				if ( !fs.existsSync( `${manualsFile}` ) ){
					response.status(500).send(`!!! Cannot find the file ${manualsFile} !!!`);
					console.error( `!!! Cannot find the file ${manualsFile} !!!` );
				}
				else {

					let manuals = require( requiredManualFile ).manuals;

					if ( generateKeywords && lang === 'ja' ){
						for ( let manual of manuals ){
							// This updates the file (object) contents, even though the contents of file is not really updated.
							manual['keywords'] = await apis.translateText( manual['title'], 'ja', 'en' );
						}
					}

					_deleteFileIfExist( lunrIndexFileName );

					reqHandlers.createLunrIndex( manuals, lunrIndexFileName );
					response.send(`${lunrIndexFileName} is created.`);
				}
			}
		}
		
	})

	app.post( '/search_test', ( request, response ) => {
		console.log( `=== Route: ${request.path} ===` );

		const 
			lunr = require('lunr'),
			lang = request.body.conversation.language
			;
		let manuals;

		// lunr-languagesは分かち書き時に使われる。検索のみ行うときはこれらの require は必要ない。
		require('lunr-languages/lunr.stemmer.support.js')(lunr);
		require('lunr-languages/tinyseg.js')(lunr);
		require('lunr-languages/lunr.ja.js')(lunr);	

		let 
			k1Value = ( request.body.conversation.k1_value ) || 1.2,
			bValue = ( request.body.conversation.b_value ) || 0.75
			;

		console.log(`>>> k1 vlue: ${k1Value} <<<`);
		console.log(`>>> b value: ${bValue} <<<`);

		const idx = lunr( function () {
			this.ref( 'title' );
			this.field( 'keywords' );
			/* -- Customisation ---
			k1: This controls how quickly the boost given by a common word reaches saturation. 
				Increasing it will slow down the rate of saturation and lower values result in quicker saturation. 
				The default value is 1.2. If the collection of documents being indexed have high occurrences of words that are not covered by a stop word filter, 
				these words can quickly dominate any similarity calculation. 
				In these cases, this value can be reduced to get more balanced results.
			b: 	This parameter controls the importance given to the length of a document and its fields. 
				This value must be between 0 and 1, and by default it has a value of 0.75. 
				Reducing this value reduces the effect of different length documents on a term’s importance to that document.
			*/
			this.k1( k1Value );
			this.b( bValue );

			switch( lang ){
				case 'ja':
					manuals = require('./lib/manuals/test/test_manuals_ja').manuals;
					this.use( lunr.ja );
					break;
				default:
					manuals = require('./lib/manuals/test/test_manuals_en').manuals;
					break;
			}

			// オブジェクトの配列の各オブジェクトに新たな要素を付け加える。
			// ここでは、新たに “words” というキーを設定して、最初のキーに設定されているテキストのアンダースコア（ ‗ ）をスペース（ ）に変換している。
			// ※ ただし、今回は、利用可能なキーが一つだけだからいいが、いくつもあると最後のキーの値に対して変換したものが word に入る。
			/*
			manuals.forEach( elm => {
				Object.keys( elm ).forEach( key => {
					elm.words = elm[key].replace( /_/g, ' ' );
				})
			});
			*/

			manuals.forEach( function ( doc ) {
				this.add( doc );
			}, this )
		});

		console.log(`>>> Search term: ${recastMemory.manualSearchPhrase} <<<`)
		const searchResult = idx.search( recastMemory.manualSearchPhrase );
		console.log(`>>> Found result: ${searchResult.length} <<<`);
		response.send( searchResult );
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