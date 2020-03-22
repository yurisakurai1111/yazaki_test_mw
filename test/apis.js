const supertest = require('supertest'),
      should = require('should'),
      apis = require( '../server/services/apis' ),
      incidentTitleJA = '出向者への手当支給について',
      incidentTitleEN = 'Performance problem in transaction CAT2 in system CHK( system is slow down )'
;
let title4sti;


describe("### Used API Tests ###", () => {
    it(`=== API: SAP Translation Hub (STH) ===`, async () => {
      title4sti = await apis.translateText( incidentTitleJA, "ja", "en" );
      console.log( `>>> STH Result: ${incidentTitleJA} => ${title4sti} <<<` );

    }).timeout(5000);

    it(`=== API: Service Ticket Intelligence (STI) ===`, async () => {
        
        const category = await apis.getDataFromSti( title4sti || incidentTitleEN );
        console.log( `>>> STI Result: ${title4sti} => ${category} <<<` );

    }).timeout(10000);

});