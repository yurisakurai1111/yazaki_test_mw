const
    axios = require( 'axios' ),
    queryString = require( 'querystring' ),
    settings = require( '../lib/settings' ),
	credentialInfo = require( '../lib/credentials' ),
	googleTransURL = 'https://script.google.com/macros/s/' + credentialInfo.google.translationApiKey + '/exec',
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

const translateText = ( text, sourceLang, targetLang ) => {
	console.log( "=== Sub procedure 'translateText' ===" );
 
	let axiosOptions ={};
	axiosOptions.params = { text: text,
							source: sourceLang,
							target: targetLang };
	
	return new Promise( ( resolve, reject ) => {
		axios.get( googleTransURL, axiosOptions )
		.then( ( res ) => {
			console.log(`>>> Translation result: ${res.data} <<<`);
			resolve( res.data );
		})
		.catch( (err) => {
			console.error(`!!! Error at goolge translation: ${err} !!!`);
			reject( err );
		})
	})
	
};

module.exports = {
	translateText
};