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
	BASE_URL_INT = settings.BASE_URL_INT,
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
	REDMINE_HEADER_OBJECT = { 'Content-Type': REDMINE_HEADER_CONTENT_TYPE, 'Authorization': REDMINE_HEADER_BASICAUTH },
	sendmail = require('sendmail')(),
	SapCfMailer = require('sap-cf-mailer').default,
	SMTP_SERVER = 'mailsin.sap.corp',
	//SMTP_SERVER = '10.33.52.41',
	SMTP_SERVER_PORT = 25,
	MAIL_FROM_ADDRESS = credentialInfo.MAIL_INFO.FROM_ADDRESS,
	MAIL_FROM_ADDRESS_PASS = credentialInfo.MAIL_INFO.FROM_ADDRESS_PASS,
	MAIL_TO_ADDRESS = credentialInfo.MAIL_INFO.FROM_ADDRESS,
	MAIL_CC_ADDRESS = credentialInfo.MAIL_INFO.TO_ADDRESS,
	nodemailer = require('nodemailer')
	/*
	smtp = nodemailer.createTransport({
		host: SMTP_SERVER, 
		port: SMTP_SERVER_PORT,
		secure: false,
    	tls: {rejectUnauthorized: false}
		/*
		auth: {
			user: MAIL_FROM_ADDRESS,
			pass: MAIL_FROM_ADDRESS_PASS
		}
		
	})
	*/
	;

var
	baseUrl,
	generalGetMethod,
	createIncident,
	incidentTemplateURL,
	sysMonAlertURL,
	getAuthConfig,
	vcapServices,
	scpParams = {},
	accTokenURL,
	// Following vcap* variables can be taken from the SCP variable dynamically, when this program is running on SCP.
	// So following codes are not really necessary, if this program is running on SCP.
	vcapClientID = credentialInfo.thisApp.clientId,
	vcapClientSecret = credentialInfo.thisApp.clientSecret,
	vcapProxyHost = "10.0.85.1",
	vcapProxyPort = 20003,
	vcapXsuaaURL = "https://p2000594029trial.authentication.eu10.hana.ondemand.com",
	fileContents,
	deleteUploadedDirFiles,
	readPrevProcLog,
	_getTextForPriority,
	_adjustTranslatedTexts,
	_attachFilesProc,
	_sendUploadedFiles,
	_creIncidentLogging,
	ocrRequest,
	chatHistoryHandler,
	smtp,
	_sendMail,
	_getFileTokenByUpload,
	_uploadFileToRedmine
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
		REDMINE_UPLOAD_FILE_URL = `${REDMINE_URL}/uploads.json`
		;

	let
		_fileNames,
		_fileNameWithPath,
		_fileData,
		uploadedFiles = [],
		uploadedFilesInfo,
		axiosOptions = require('./lib/share').authConfig || { headers: {} }
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

_sendMail = ( mailContents ) => {
	console.log(`=== Sub procedure: _sendMail ===`);
	console.dir(mailContents);
	/*
	try {
		smtp.sendMail( mailContents, (error, info) => {
			// Error
			if ( error ){
				console.error(`!!! Sending e-mail was failed by ${error} !!!`);
				return;
			}
			// Success
			console.log(`=== Sending email was successfully finsihed ===`);
		});
	}
	catch( e ){
		console.error(`!!! Error was catched during sending the e-mail by ${e} !!!`);
	}
	*/
	/*
	sendmail( mailContents, ( err, reply ) => {
		console.log( err && err.stack );
		console.dir( reply );
	} );
	*/
	const transporter = new SapCfMailer('MAILTRAP');
	transporter.sendMail( mailContents );
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
	vcapClientID = vcapServices.connectivity[0].credentials.clientid;
	vcapClientSecret = vcapServices.connectivity[0].credentials.clientsecret;
	vcapProxyHost = vcapServices.connectivity[0].credentials.onpremise_proxy_host;
	vcapProxyPort = vcapServices.connectivity[0].credentials.onpremise_proxy_port;
	vcapXsuaaURL = vcapServices.connectivity[0].credentials.url;
	scpParams = {
		username: credentialInfo.SCP.mailAddr,
		password: credentialInfo.SCP.password,
		grant_type: 'password',
		response_type: 'token',
		client_id: vcapClientID,
		client_secret: vcapClientSecret
	};
	accTokenURL = vcapXsuaaURL + '/oauth/token';

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

createIncident = async ( res, incidentContents, convID, callback ) => {
	const 
		CREATE_INCIDENT_URL = REDMINE_URL + '/issues.json'
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
		axiosOptions = require('./lib/share').authConfig || { headers: {} },
		uploadedFilesInfo
		;

	console.log( "=== Procedure: 'createIncident' ===" );
	
	axiosOptions.headers['Content-Type'] = REDMINE_HEADER_CONTENT_TYPE;
	axiosOptions.headers.Authorization = REDMINE_HEADER_BASICAUTH;

	/*
	if ( authConfig ){
		let proxyHostPort = `https://${authConfig.proxy.host}:${authConfig.proxy.port}`;
		console.log(`>>> Proxy Host:Port >>> ${proxyHostPort}`);

		smtp = nodemailer.createTransport({
			host: SMTP_SERVER, 
			port: SMTP_SERVER_PORT,
			secure: false,
			tls: {rejectUnauthorized: false}
			//proxy: proxyHostPort
		});
	}
	else {
		smtp = nodemailer.createTransport({
			host: SMTP_SERVER, 
			port: SMTP_SERVER_PORT,
			secure: false,
			tls: {rejectUnauthorized: false}
		});
	}
	*/
	/*
	replyMsg = 'Sending the mail only.';
	mailContents.subject = ( authConfig ) ? 'Test Mail from SCP' : 'Test Mail from Local';
	mailContents.text = ( authConfig ) ? 'This mail was sent from Node App on SCP' : 'This mail was sent from Node App on Local PC';
	callback( res, replyMsg );
	_sendMail( mailContents );
	*/

	// File Attachment processing block
	uploadedFilesInfo = await _getFileTokenByUpload( convID ).catch( ( err ) => { console.error(`!!! Catched Error when getting uploaded file(s) information !!!`); });
	
	if ( uploadedFilesInfo ) incidentContents.issue.uploads = uploadedFilesInfo;

	// Incident creation.
	performance.mark('createIncidentStart');
	axios.post( CREATE_INCIDENT_URL, incidentContents, axiosOptions )
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
		//_sendMail( mailContents );
		
	})
	.catch( function ( error ){
		console.error( "!!! axios.post in createIncident is failed (catched error) !!!", error );
			replyMsg = res.__('createIncident.msgFailed');
	});
	
};

module.exports = {
	createIncident: createIncident,
	getAuthConfig: getAuthConfig,
	deleteUploadedDirFiles: deleteUploadedDirFiles
};

// Public Methods <<< End
//===================================

