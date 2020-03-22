const supertest = require('supertest'),
      fs = require( 'fs' ),
      settings = require( '../server/lib/settings' ),
      STI_URL = settings.STI_URL,
      STI_BO = settings.STI_BO,
      STI_TOKEN_URL = settings.STI_TOKEN_URL,
      STH_URL = settings.STH_URL
;
let server,
    fileContents,
    stiAccessToken,
    translatedTitle
    ;
      
try {
	// "require" caches the data, so fs.readFileSync is used here.
	fileContents =  fs.readFileSync( '../server/lib/credentials.json', 'utf8' );
}
catch (e){
	console.error("!!! Error was happened while reading credential file. !!!\n", e);
	//return (e);
}

const credentialInfo = JSON.parse( fileContents );

const STH_BODY = {
    "sourceLanguage": "ja",
    "targetLanguages": [ "en" ],
    "units": [{
        "key": "INCIDENT_TITLE",
        "value": "受注伝票の登録ができない"
    }]
};

let STI_BODY = {
    "business_object": STI_BO,
    "messages": [
      {
        "id": 2001,
        "contents": [
          {
            "field": "title",
            "value": "Should be replaced"
          }
        ]
      }
    ]
  }


describe("### Used API Tests ###", () => {
    it(`=== API: SAP Translation Hub ===`, ( done ) => {
        console.log(`\n=== START of Translation Test: ${STH_URL} ===`);

        server = supertest.agent(STH_URL);
        
        server
        .post('')
        .send(STH_BODY)
        .set({ 'Accept': 'application/json;charset=utf8', 'APIKey': credentialInfo.STH.apiKey })
        .expect(200)
        .expect("Content-type",/json/)
        .end( (err, res) => {
            if (err) return done(err);
            const resData = res.body.units[0]
            translatedTitle = resData.translations[0].value;
            console.log(`>>> Translation Result: ${resData.value} => ${translatedTitle} <<<`);
            //res.status.should.equal(200);
            done();
            console.log(`=== END of Translation Test: ${STH_URL} ===`);
        })

    }).timeout(10000);

    it(`=== API: Service Ticket Intelligence (STI) ===`, ( done ) => {
        console.log(`\n=== START of Getting Access Token Test: ${STI_TOKEN_URL} ===`);

        server = supertest.agent(STI_TOKEN_URL);

        server
        .post( '/oauth/token' )
        .auth( credentialInfo.STI.clientId, credentialInfo.STI.clientSecret )
        .send({ "grant_type": "client_credentials" })
        .set({ 'Accept': 'application/json;charset=utf8', 'Content-Type': 'application/x-www-form-urlencoded' })
        .expect(200)
        .expect("Content-type",/json/)
        .end( (err, res) => {
            if (err) return done(err);
            stiAccessToken = res.body.access_token
            //console.log(`>>> Access Token: ${stiAccessToken} <<<`);
            //res.status.should.equal(200);
            done();
            console.log(`=== END of Getting Access Token Test: ${STI_TOKEN_URL} ===`);
        })
    }).timeout(10000);

    it(`=== API: Service Ticket Intelligence (STI) ===`, ( done ) => {
        console.log(`\n=== START of STI Test: ${STI_URL} ===`);

        STI_BODY.messages[0].contents[0].value = translatedTitle;

        server = supertest.agent(STI_URL);

        server
        .post( '' )
        .send( STI_BODY )
        .set({ 'Accept': 'application/json;charset=utf8', 'Authorization': 'Bearer ' + stiAccessToken })
        .expect(200)
        .expect("Content-type",/json/)
        .end( (err, res) => {
            if (err) return done(err);
            const stiResult = res.body.results[0].recommendation[0].solutions[0].value;
            console.log(`>>> STI Result: ${STI_BODY.messages[0].contents[0].value} => ${stiResult} <<<`);
            //res.status.should.equal(200);
            done();
            console.log(`=== END of STI Test: ${STI_URL} ===`);
        })
    }).timeout(15000);

});