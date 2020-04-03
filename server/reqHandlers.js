/*
* reqHandlers.js
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
	credentialInfo = require( './lib/credentials' ),
	SOLMAN_URL = settings.SOLMAN_URL,
	REDMINE_URL = settings.REDMINE_URL,
	UPLOAD_FILE_DIR = "./UploadedFiles",
	axios = require('axios'),
	moment = require("moment"),
	{ URLSearchParams } = require( 'url' ),
	queryString = require( 'querystring' ),
	fs = require( 'fs' ),
	mime = require('mime-types'),
	FormData = require( 'form-data' ),
	rmdir = require( 'rmdir' ),
	PROC_LOG_DIR = "./server/log",
	{ performance, PerformanceObserver } = require('perf_hooks'),
	obs = new PerformanceObserver( (items) => {
		const perfResult = items.getEntries();
		console.log( `*** Duration of ${perfResult[0].name} is ${perfResult[0].duration} ***` );
		performance.clearMarks();
	}),
	REDMINE_USER = credentialInfo.redmine.user,
	REDMINE_PASSWORD = credentialInfo.redmine.pass,
	REDMINE_TOKEN = Buffer.from(`${REDMINE_USER}:${REDMINE_PASSWORD}`, 'utf8').toString('base64'),
	REDMINE_HEADER_CONTENT_TYPE = 'application/json',
	REDMINE_HEADER_BASICAUTH = `Basic ${REDMINE_TOKEN}`,
	ISSUE_JSON_FORM_FIELD_NAME = 'issue_info',
	lunr = require('lunr')
	;

var
	createIncident,
	getAuthConfig,
	vcapServices,
	scpParams = {},
	accTokenURL,
	deleteUploadedDirFiles,
	_getFileTokenByUpload,
	_uploadFileToRedmine,
	createLunrIndex,
	searchManual,
	_sendMailViaSolman,
	_postSendMailRequest,
	_logObjectValue,
	_createIncidentBody
	;

//==========================
// Initialization tasks
//==========================
obs.observe({ entryTypes: ['measure'] });


// Module Scope Variant <<< End
//===================================


//===================================
// Utility Method >>> Start

_getFileTokenByUpload = ( convID ) => {
	console.log( "=== Sub procedure '_getFileTokenByUpload' ===" );

	const
		_uploadedDir = UPLOAD_FILE_DIR + "/" + convID,
		REDMINE_UPLOAD_FILE_URL = `${REDMINE_URL}/uploads.json`,
		authConfig = require('./lib/share').authConfig
		;

	let
		_fileNames,
		_fileNameWithPath,
		_fileData,
		uploadedFiles = [],
		axiosOptions = authConfig || { headers: {} }
		;

	axiosOptions.headers['Content-Type'] = 'application/octet-stream';
	axiosOptions.headers.Authorization = REDMINE_HEADER_BASICAUTH;

	return new Promise( async ( resolve, reject ) => {
		try {
			_fileNames = fs.readdirSync( _uploadedDir, 'binary' );
		}
		catch( err ) {
			console.warn(`??? No relevant uploaded files with convID ${convID} ???\ni.e. No files in the directory named ${_uploadedDir} or no directory itself.`);
			err.noAttachFile = true;
			reject( err );
		}

		if ( _fileNames ){
			console.log( `=== Sending uploaded relevant files in ${_uploadedDir} ===` );

			performance.mark('uploadFilesStart');

			for ( let i = 0; i < _fileNames.length; i++ ){
				// オブジェクトを単純に代入すると参照渡しになるので、下記で一時的なオブジェクトをFORループ内で定義している。
				let _uploadFile = {};

				_fileNameWithPath =  _uploadedDir + '/' + _fileNames[i];
				console.log(`>>> Uploading file ${i} >>> ${_fileNameWithPath}` );
				_fileData = fs.readFileSync( _fileNameWithPath );

				// !!! I don't know why but using the "data" option for the body data is failed.
				//axiosOptions.data = _fileData;
				axiosOptions.params = { filename: _fileNames[i] };
				//let uploadUrl = `${REDMINE_UPLOAD_FILE_URL}?filename=${_fileNames[i]}`;

				_uploadFile.token = await _uploadFileToRedmine( REDMINE_UPLOAD_FILE_URL, _fileData, axiosOptions ).catch( ( err ) => { console.error(`!!! Catched Error during uploading files "${_fileNames[i]}" to Redmine ${err} !!!`); reject( err ); });
				_uploadFile.filename = _fileNames[i];
				_uploadFile.content_type = mime.lookup( _fileNames[i] );

				uploadedFiles.push( _uploadFile );
			}

			performance.mark('uploadFilesEnd');
			performance.measure('Uploading File(s)', 'uploadFilesStart', 'uploadFilesEnd' );

			console.dir( `>>> Uploaded file(s) to Redmine Information: ${uploadedFiles} <<<` );

			// Delete uploaded directory & files.
			// It would be OK that the following delete procedure is exeucted asyncronously, because the result of directory/files deletion is not influence with subsequent procedures.
			// However it was changed to await ~, because the same procedure is triggered after creation of incident for just in case.
			// (this is because if the error was happened at creating an incident, attaching/sending/deleting files procedures would be skipped) 
			// In this case, there is the possibility to tyring to delete twice, because the previous deleting process might be still running if it was executed asyncronously.
			await deleteUploadedDirFiles( _uploadedDir ).catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _attachFilesProc) !!!", err ); });
		}

		resolve( uploadedFiles );
	})

};

_uploadFileToRedmine = ( url, bodyData, options ) => {
	return new Promise( ( resolve, reject ) => {
		axios.post( url, bodyData, options )
		.then( function( response ){
			console.log(`=== Upload Success ===`);
			resolve( response.data.upload.token );
		})
		.catch( function( error ){
			console.error( "!!! Uploading file to Redmine in _getFileTokenByUpload is failed (catched error) !!!", error );
			reject( error );
		});
	});
}

_sendMailViaSolman = ( convId, issueContents ) => {
	console.log(`=== Sub Procedure: _sendMailViaSolman ===`);

	const _uploadedDir = UPLOAD_FILE_DIR + "/" + convId;
	let _fileNames;

	// It is necessary to make the keys uppoer case in order to read it in ABAP. 
	let 
		key,
		keys = Object.keys( issueContents ),
		n = keys.length,
		issueKeyUpperCase = {}
		;
	
	while ( n-- ){
		key = keys[n];
		issueKeyUpperCase[key.toUpperCase()] = issueContents[key];
	}

	return new Promise( async function ( resolve, reject ){
		// Check whether relevant uploaded files are existing.
		try {
			_fileNames = fs.readdirSync( _uploadedDir );
		}
		catch( err ) {
			console.warn(`??? No relevant uploaded files with convID ${convId} ???\ni.e. No files in the directory named ${_uploadedDir} or no directory itself.`);
			// Even if there is not file to be attached, the procedure should be continued for this scenario.
			//err.noAttachFile = true;
			//reject( err );
		}

		// If attached file(s) are existing.
		/*
		if ( _fileNames ){
			try {
				await _postSendMailRequest( _uploadedDir, _fileNames, issueKeyUpperCase );
			}
			catch( err ){
				console.error( "!!! Failed to send/append files !!!", _fileNames );
				//await deleteUploadedDirFiles( _uploadedDir ).catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _attachFilesProc) !!!", err ); });;
				reject( err );
			}

			// Delete uploaded directory & files.
			// It would be OK that the following delete procedure is exeucted asyncronously, because the result of directory/files deletion is not influence with subsequent procedures.
			// However it was changed to await ~, because the same procedure is triggered after creation of incident for just in case.
			// (this is because if the error was happened at creating an incident, attaching/sending/deleting files procedures would be skipped) 
			// In this case, there is the possibility to tyring to delete twice, because the previous deleting process might be still running if it was executed asyncronously.
			//await deleteUploadedDirFiles( _uploadedDir ).catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _attachFilesProc) !!!", err ); });
			resolve();
		};
		*/
		try {
			const resData = await _postSendMailRequest( _uploadedDir, _fileNames, issueKeyUpperCase );
			resolve( resData[0].MESSAGE_V3 );
		}
		catch( err ){
			console.error( "!!! Failed to send/append mail in Solman !!!", _fileNames );
			//await deleteUploadedDirFiles( _uploadedDir ).catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _attachFilesProc) !!!", err ); });;
			reject( err );
		}
		
	});
};

_postSendMailRequest = ( dir, fileNames, issueObjKeyUpper ) => {
	console.log( "=== Sub procedure '_postSendMailRequest' ===" );

	const 
		SOLMAN_SEND_MAIL_URL = SOLMAN_URL + '/iitsm/req_handler?mode=ATTACHFILE&guid=MAIL',
		issueJson = JSON.stringify( issueObjKeyUpper )
		;

	let	_authConfig = require('./lib/share').authConfig || { headers: {} },
		_fileNameWithPath,
		_formData = new FormData(),
		_contentType
		;

	if ( fileNames ){
		console.log( `=== File(s) should be attached exists in ${dir} ===` );
		for ( let i = 0; i < fileNames.length; i++ ){
			_fileNameWithPath =  dir + '/' + fileNames[i];
			console.log(`>>> Uploading file ${i} >>> ${_fileNameWithPath}` );
			_formData.append( 'attachment' + i, fs.createReadStream( _fileNameWithPath ));
		}
	}

	_formData.append( ISSUE_JSON_FORM_FIELD_NAME, issueJson );

	// _formData.getHeaders()メソッドでHTTPヘッダを取得して、axiosに渡す必要がある点に注意が必要。
	// HTTPヘッダの中身は、次のようなContent-Typeヘッダの情報になっている。この boundaryの識別子を、HTTPヘッダに含める必要があるということ。
	// e.g. { content-type: "mulitpart/form-data; boundary=--------------------------140405031523404929223955}
	_contentType = _formData.getHeaders();
	
	for( let id in _contentType ){
		_authConfig.headers[id] = _contentType[id];
	}

	//console.log( ">>> _authConfig before axios.post: sending/attaching file >>>", _authConfig );

	performance.mark('sendMailWithAttachmentStart');

	return new Promise( function ( resolve, reject ){
		// Using axios, because _formData.submit can not get the response.data returned by the server.
		axios.post( SOLMAN_SEND_MAIL_URL, _formData, _authConfig )
		.then( res => {
			//console.log( ">>> Returned response from ABAP about sending/attaching file(s) >>>", res );
			console.log( ">>> Posting the request to send the e-mail with attachments is successfully finished <<<");
			performance.mark('sendMailWithAttachmentEnd');
			performance.measure('Sending the mail', 'sendMailWithAttachmentStart', 'sendMailWithAttachmentEnd' );
			resolve( res.data );
		})
		.catch( err => {
			console.error( "!!! Error during posting the request to send the mail !!!", err );
			reject( err );
		});
	});

};

/*
_creIncidentLogging = ( logFile, logData, convId ) => {
	console.log(`=== _creIncidentLogging: Process logging for the result of createIncident procedure ===` );
	console.log(`>>> Log file name is ${logFile}, conversation ID is ${convId}, and the log data is >>>`, logData );

	const msgWriteLogError =  `!!! Error while writting the file ${logFile} !!!`,
		  msgWriteLogSuccess = `>>> Writting the file ${logFile} was successfully finished.`,
		  uploadedDir = UPLOAD_FILE_DIR + "/" + convId;
		  ;

	fs.writeFile( logFile, JSON.stringify( logData, null, '\t' ), ( err ) => ( err ) ? console.error( msgWriteLogError ) : console.log( msgWriteLogSuccess ) );

	// It might be arrived here with the error, in this case it is necessary to delete uploaded directory and files in it.
	// This is because if the error was happened at creating an incident, attaching/sending/deleting files procedures would be skipped. 
	// It would be OK that following delete procedures are exeucted asyncronously, because the result of directory/files deletion are not influence with subsequent procedures.
	// It is possible to make it synchronously with adding await, but this is the final calling so it is omitted.
	deleteUploadedDirFiles( uploadedDir )
	.catch( (err) => { console.error( "!!! [Can be ingored?] Error was happened at deleting file(s) (in _creIncidentLogging) !!!", err ); });
};
*/

_logObjectValue = ( obj ) => {
	Object.keys( obj ).forEach( key => {
		console.log(`>>> Object Key: ${key}, Value: ${obj[key]} <<<`);
		if ( typeof obj[key] === 'object' ){ _logObjectValue( obj[key] ); }
	});
};

_createIncidentBody = ( res, recastMemory, incidentContents ) => {
	const
		errorFunc = recastMemory.bizErrFunc || res.__( 'general.msgNoInfoFromCAI' ),
		execUserEtcInfo = recastMemory.bizErrUserInfoEtc || res.__( 'general.msgNoInfoFromCAI' ),
		errorBackground = recastMemory.bizErrBackground ||  res.__( 'general.msgNoInfoFromCAI' )
		;

	// This value is not relevant for Redmine, and only necessary for mail creation in Solman.
	// Even though irrelevant key is defined for redmine, it is OK to create the redmine ticket.
	incidentContents.issue.reporter = recastMemory.user_name.raw.toUpperCase();

	incidentContents.issue.subject = recastMemory.issueTitle || res.__( 'general.msgNoInfoFromCAI' );
	incidentContents.issue.tracker_id = recastMemory.redmineTrackerId || 1;
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// !!! Should be changed to determine the due date without calculating holidays !!!
	incidentContents.issue.due_date = ( recastMemory.arbitraryDueDate) ? recastMemory.arbitraryDueDate.raw : moment().add( recastMemory.defaultDueDate, 'days').format('YYYY-MM-DD');
	
	switch ( recastMemory.ticket_priority.value ){
		case 'high':
			incidentContents.issue.priority_id = 3;
			break;
		case 'medium':
			incidentContents.issue.priority_id = 2;
			break;
		case 'low':
			incidentContents.issue.priority_id = 1;
			break;
	}

	incidentContents.issue.description = res.__( 'createIncident.incidentBody', { inquiryType: recastMemory.inquiry_type.raw,
												  								  priority: recastMemory.ticket_priority.raw,
																				  dueDate: incidentContents.issue.due_date,
																				  issueDetail: recastMemory.issueDetail,
																				  targetFunc: errorFunc,
																				  execUserEtc: execUserEtcInfo,
																				  background: errorBackground,
																				  reasonForHigh: recastMemory.reasonForHigh });
	return ( incidentContents );
};

// Utility Method <<< End
//===================================


//===================================
// Public Methods >>> Start

getAuthConfig = function ( callback ){
	console.log( "=== Procedure 'getAuthConfig' ===" );

	if ( process.env.VCAP_SERVICES ){
		vcapServices = JSON.parse( process.env.VCAP_SERVICES )
	}
	else {
		console.error("Cannot get the environment variable 'process.env.VCAP_SERVICES'.");
		return( "Cannot get environment variable 'process.env.VCAP_SERVICES'.\nIs this really running SCP environment?\nIt must be runnning on the local environment." );
	}

	const
		vcapClientID = vcapServices.connectivity[0].credentials.clientid,
		vcapClientSecret = vcapServices.connectivity[0].credentials.clientsecret,
		vcapProxyHost = vcapServices.connectivity[0].credentials.onpremise_proxy_host,
		vcapProxyPort = vcapServices.connectivity[0].credentials.onpremise_proxy_port,
		vcapXsuaaURL = vcapServices.connectivity[0].credentials.url;
		scpParams = {
			username: credentialInfo.SCP.mailAddr,
			password: credentialInfo.SCP.password,
			grant_type: 'password',
			response_type: 'token',
			client_id: vcapClientID,
			client_secret: vcapClientSecret
		},
		accTokenURL = vcapXsuaaURL + '/oauth/token'
		;

	axios.post( accTokenURL, queryString.stringify( scpParams ), { headers: { 'Accept': 'application/json;charset=utf8', 'Content-Type': 'application/x-www-form-urlencoded' } } )
	.then( function ( response ){
		var 
			proxAuthRaw = response.data.access_token,
			proxAuth = "Bearer " + proxAuthRaw,
			config = {
				proxy: { 
					host: vcapProxyHost,
					port: vcapProxyPort
				},
				headers: {
					"Proxy-Authorization": proxAuth
				}
			}
			;
		
		require('./lib/share').authConfig = config;
		callback();

	})
	.catch( function ( error ){
		console.error( "!!! Error was happened while getting access token for Cloud Connector !!!" );
		if (error.response) {
			// The request was made and the server responded with a status code
			// that falls out of the range of 2xx
			console.log('Error_response_data:', error.response.data);
			console.log('Error_response_status:', error.response.status);      // 例：400
			console.log('Error_response_statusText:', error.response.statusText);  // Bad Request
			console.log('Error_response_headers:', error.response.headers);
		}
		return( "Error was happened while getting access token for Cloud Connector!\n" + error.message );
	});
};

deleteUploadedDirFiles = function( dirPath ){
	// This procedure is described here, because it has the possibility to be called by other modules.
	console.log( "=== (Sub) Procedure: 'deleteUploadedDirFiles' ===" );

	return new Promise( function ( resolve, reject ){
		if ( fs.existsSync( dirPath ) ){
			// The following procedure can be asyncronously executed, because the result of deleting directory and files does not affect subsequent procedures.
			// However this procedure is also called after the creation of incident (this is because if the error was happened at creating an incident, attaching/sending/deleting files procedures would be skipped), 
			// in this case, there is the possibility to tyring to delete twice, because the previous deleting process might be still running if it was executed asyncronously.
			rmdir( dirPath, function( err, dirs, files ){
				if ( err ){
					console.error("!!! Error was happend when trying to delete folder/files !!!", err );
					reject( err );
				}
				else {
					console.log( ">>> Following directory & files are deleted >>>" );
					console.log( dirs );
					console.log( files );
					resolve();
				}
			});
		}
		else {
			console.log(`<<< No directory named ${dirPath} is existing. >>>`);
			resolve();
		}
	});
};

createIncident = async ( res, recastMemory, incidentContents, convID, callback ) => {
	const 
		REDMINE_CREATE_TICKET_URL = REDMINE_URL + '/issues.json',
		authConfig = require('./lib/share').authConfig
		;

	let 
		replyMsg,
		replyUrl,
		mailContents = {
			from: MAIL_FROM_ADDRESS,
			to: MAIL_TO_ADDRESS,
			//cc: MAIL_CC_ADDRESS,
			subject: '',
			text: ''
		},
		axiosOptions = authConfig || { headers: {} },
		uploadedFilesInfo,
		reporterDepartment,
		vcapProxyPortSocks5
		;

	console.log( "=== Procedure: 'createIncident' ===" );

	_createIncidentBody( res, recastMemory, incidentContents );

	// Sending the e-mail via Solution Manager with attachment(s) if it exists,
	// and get the department name of user.
	reporterDepartment = await _sendMailViaSolman( convID, incidentContents.issue ).catch( ( err ) => { console.error(`!!! Catched Error when sending e-mail with attachments > "${err.message}" !!!`) });

	// Now I got the department information of user, so I can input it now.
	const userDepartment = reporterDepartment || res.__( 'general.msgNoInforFromSolman' );
	incidentContents.issue.description = res.__( 'createIncident.incidentBodyPrologue', { userName: incidentContents.issue.reporter, userDepartment: userDepartment } )
	                                     + incidentContents.issue.description;

	//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
	// START: Redmine ticket creation
	//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
	
	// Because sending mail with attachment uses 'content-type: multipart/form-data ~', it is necessary to delete it. 
	// This value is case sensitive so it is not valid by just replacing the value 'Content-Type' below.
	if ( axiosOptions.headers['content-type'] ){ delete axiosOptions.headers['content-type'] };
	
	axiosOptions.headers.Authorization = REDMINE_HEADER_BASICAUTH;

	// File Attachment processing block
	uploadedFilesInfo = await _getFileTokenByUpload( convID )
						.catch( ( err ) => { console.error(`!!! Catched Error when getting uploaded file(s) information with the message "${err.message}" !!!`); });
	
	if ( uploadedFilesInfo ) incidentContents.issue.uploads = uploadedFilesInfo;

	// Because the following value was changed in the sub procedure, it is necessary to set it here, just before axios.post.
	axiosOptions.headers['Content-Type'] = REDMINE_HEADER_CONTENT_TYPE;

	console.log(`>>> axios options length: ${Object.keys(axiosOptions).length} <<<`);
	_logObjectValue( axiosOptions );

	// Incident creation.
	performance.mark('createIncidentStart');
	axios.post( REDMINE_CREATE_TICKET_URL, incidentContents, axiosOptions )
	.then( function( response ){
		performance.mark('createIncidentEnd');
		performance.measure( 'Incident Creation', 'createIncidentStart', 'createIncidentEnd' );

		if ( response.status === 201 ){
			console.log("=== Creation of ticket in Redmine is successfully finished. ===");
			replyMsg = res.__('createIncident.msgSuccess', { subject: response.data.issue.subject });
			replyUrl = REDMINE_URL + `/issues/${response.data.issue.id}`;
			mailContents.subject = res.__('createIncident.mailSubject', { issueID: response.data.issue.id });
			// I don't know why but the if the URL passed to the i18n locale text, the slash(/) changed to '&#x2F;', so added the URL here.
			mailContents.text = res.__('createIncident.mailText', { title: response.data.issue.subject }) + replyUrl;
		}
		else {
			console.error ("!!! Unexpected status in chatHistoryHandler, Status: " + response.status );
			replyMsg = `Redmine Ticket creation is finished with the status "${response.status}".`;
		}

		callback( res, replyMsg, replyUrl );

	})
	.catch( function ( error ){
		console.error( "!!! axios.post in createIncident is failed (catched error) !!!", error.message );
		console.error( `!!! All error objects: ${error} !!!`);
		replyMsg = res.__('createIncident.msgFailed');

		callback( res, replyMsg, replyUrl );
	});
	//<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
	// END: Redmine ticket creation
	//<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
};

createLunrIndex = ( lang, lunrIndexFileName ) => {
	console.log(`=== createLunrIndex ===`);

	let manuals;

	// lunr-languagesは分かち書き時に使われる。検索のみ行うときはこれらの require は必要ない。
	require('lunr-languages/lunr.stemmer.support.js')(lunr);
	require('lunr-languages/tinyseg.js')(lunr);
	require('lunr-languages/lunr.ja.js')(lunr);	

	const idx = lunr( async function(){

		const 
			refKeyName = 'title',
			searchKeyName = 'keywords'
			;

		this.ref( refKeyName );
		this.field( refKeyName );
		this.field( searchKeyName );
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
		//this.k1( 1.2 );
		//this.b( 0.75 );

		
		switch( lang ){
			case 'ja':
				manuals = require('./lib/manuals/manuals_ja').manuals;
				this.use( lunr.ja );
				break;
			default:
				manuals = require('./lib/manuals/manuals_en').manuals;
				break;
		}

		manuals.forEach( function ( doc ) {
			this.add( doc );
		}, this )
	});


	try {
		fs.writeFileSync( lunrIndexFileName, JSON.stringify( idx ) );
		console.log(`>>> ${lunrIndexFileName} is written <<<`);
	}
	catch( err ){ return err; }
};

searchManual = ( lang, searchTerms, cb ) => {
	console.log(`=== searchManual ===`);

	const lunrIndexFileName = `./server/lib/manuals/index/lunr_index_${lang}.json`;

	// Check whether the index file is alredy existing or not, if yes, return, if no create the index.
	if ( fs.existsSync( lunrIndexFileName ) ) { 
		console.log(`--- ${lunrIndexFileName} is already existing ---`)
	}
	else {
		const err = createLunrIndex( lang, lunrIndexFileName );
		if ( err ) { console.error(`!!! Error at createLunrIndex procedure -> ${err} !!!`); return err }
	}

	fs.readFile( lunrIndexFileName, 'utf-8', (err, indexData ) => {
		if ( err ){
			console.error(`!!! Reading the file ${lunrIndexFileName} is failed !!!`);
			throw err;
		}
		const idx = lunr.Index.load( JSON.parse( indexData ) );
		
		console.log(`>>> Search term is ${searchTerms} <<<`);

		const searchResult = idx.search( searchTerms );
		console.log(`>>> Search result: ${searchResult} <<<`);

		cb( searchResult );
	})
	
};

module.exports = {
	createIncident: createIncident,
	getAuthConfig: getAuthConfig,
	deleteUploadedDirFiles: deleteUploadedDirFiles,
	searchManual: searchManual,
	createLunrIndex: createLunrIndex
};

// Public Methods <<< End
//===================================

