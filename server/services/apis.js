const
    axios = require( 'axios' ),
    queryString = require( 'querystring' ),
    settings = require( '../lib/settings' ),
    credentialInfo = require( '../lib/credentials' ),
    tokenURL = settings.STI_TOKEN_URL + "/oauth/token",
    stiParams = {
		grant_type: 'client_credentials',
		response_type: 'token',
		client_id: credentialInfo.STI.clientId,
		client_secret: credentialInfo.STI.clientSecret
    },
	{ performance, PerformanceObserver } = require('perf_hooks'),
	obs = new PerformanceObserver( (items) => {
		const perfResult = items.getEntries();
		console.log( `*** Duration of ${perfResult[0].name} is ${perfResult[0].duration} ***` );
		performance.clearMarks();
	})
    ;

// If the following line is active, the console.log shows double performance logs (callback of obs is called double).
// This is because the parent module is also observing the entry "measure".
// Therefore it is necessary to make the following line invalid in order to avoid duplicate logging.
// Hence it is not showing the duration time of each api calling, when you are doing the unit test (the parent module is not called during the unit test), 
// but mocha (used in the unit test) shows the duration time instead, so it is not really necessary.
//obs.observe({ entryTypes: ['measure'] });

function translateText ( text, sourceLang, targetLang ){
	console.log( "=== Sub procedure 'translateText' ===" );

	const body = {
		"sourceLanguage": sourceLang,
		"targetLanguages": [ targetLang ],
		"units": [{
			"key": "INCIDENT_TITLE",
			"value": text
		}]
	};

	console.log( `>>> Used Translation API URL is ${settings.STH_URL} <<<`)
	console.log( ">>> Text should be translated >>>", text );

	performance.mark('translationStart');

	// For simulation of STH access error.
	//return new Promise( (resolve, reject) => { reject( 'Mock Rejection for the test' ) } );
	
	return new Promise( function ( resolve, reject ){
		axios.post( settings.STH_URL, body, { headers: { "APIKey": credentialInfo.STH.apiKey, "Accept": "application/json;charset=UTF-8" } })
		.then( function( response ){
			performance.mark( 'translationEnd' );
			performance.measure( 'Translation Performance', 'translationStart', 'translationEnd' );
			var translatedText = ( response.data.units[0].translations[0].value ) ? response.data.units[0].translations[0].value : "<No Data>";
			console.log( ">>> Translated data (response.data.units) >>>", response.data.units )
			resolve( translatedText );
		})
		.catch( function( error ){
			console.error("!!! Error was happened while getting data from Translation Hub !!!");
			if (error.response) {
				// The request was made and the server responded with a status code
				// that falls out of the range of 2xx
				console.error('Error_response_data:', error.response.data);
				console.error('Error_response_status:', error.response.status);      // e.g. 400
				console.error('Error_response_statusText:', error.response.statusText);  // Bad Request
				console.error('Error_response_headers:', error.response.headers);
			}
			reject( error );
		});
	});
	
};


function getDataFromSti( title ){

	console.log( "=== Sub procedure 'getDataFromSti' ===" );
	console.log( ">>> Used business object for STI >>>", settings.STI_BO );
	console.log( ">>> title handled over to STI >>>", title );

	performance.mark('startSTI');

	return new Promise( function ( resolve, reject ){
		axios.post( tokenURL, queryString.stringify( stiParams ), { headers: { 'Accept': 'application/json;charset=utf8', 'Content-Type': 'application/x-www-form-urlencoded' } } )
		.then( function ( response ){
			var 
				accessToken = response.data.access_token,
				headerAuth = "Bearer " + accessToken,
				bodyData ={
                    "business_object": settings.STI_BO,
                    "language": settings.STI_LANG,
					"messages": [
						{
						"id": 2001,
						"contents": [
							{
							"field": "title",
							"value": title
							}
						]
						}
					]
				}
				;
			
			axios.post( settings.STI_URL, bodyData, { headers: { 'Authorization': headerAuth } })
			.then( function( response ){
				performance.mark('endSTI');
				performance.measure( 'STI Performance', 'startSTI', 'endSTI' );
				console.log("Success to get the data from STI, Here is the result.", response.data.results );
				resolve( response.data.results[0].recommendation[0].solutions[0].value );
			})
			.catch( function (error){
				console.error("!!! Error was happened while getting data from STI !!!");
				if (error.response) {
					// The request was made and the server responded with a status code
					// that falls out of the range of 2xx
					console.error('Error_response_data:', error.response.data);
					console.error('Error_response_status:', error.response.status);      // e.g. 400
					console.error('Error_response_statusText:', error.response.statusText);  // Bad Request
					console.error('Error_response_headers:', error.response.headers);
				}
				reject( error );
			});

		})
		.catch( function ( error ){
			console.error( "!!! Error was happened while getting access token for STI !!!" );
			if (error.response) {
				// The request was made and the server responded with a status code
				// that falls out of the range of 2xx
				console.error('Error_response_data:', error.response.data);
				console.error('Error_response_status:', error.response.status);      // e.g. 400
				console.error('Error_response_statusText:', error.response.statusText);  // Bad Request
				console.error('Error_response_headers:', error.response.headers);
			}
			reject( error );
		});
	});
};

module.exports = {
	translateText,
    getDataFromSti
};