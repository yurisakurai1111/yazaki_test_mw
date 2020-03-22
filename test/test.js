/*

=== 指定した説明にマッチするテストのみ実行する方法 ===
テストファイルの中でも一部だけ実行したいときには mocha のコマンドラインオプションの --grep もしくは -g を使うことができます。
このオプションに指定した文字列は正規表現として扱われるようです。
> (e.g.) mocha test -g 'chat_history'

=== 指定したスペック (describe) だけ実行する ===
指定した describe だけ実行したい場合は、テストコード自体に指定していまいます。 describe に .only につけるだけ。

    describe(function () {
    // ここのテストはスキップされる
    });
    describe.only(function () {
    // ここのテストは実行される
    });

=== 指定したテスト (it) だけ実行する === 
これも describe と同様に it に .only につけるだけ。

*/

const 
    supertest = require('supertest'),
    should = require('should'),
    settings = require( '../server/lib/settings' ),
    caiAuth = require( '../server/lib/credentials' ).CAI_BASIC_AUTH
    ;

const 	
    PATH_UNLOCK_USER = "/unlock_user",
    PATH_DELETE_OUTBOUND_DELIVERY = "/delodeli",
    PATH_PERFORMANCE_CHECK = "/perfcheck",
    PATH_CREATE_INCIDENT = "/create_incident",
    PATH_UPLOAD_FILES = "/upload_files",
    PATH_CHECK_INCIDENT = "/check_incident",
    PATH_OCR_REQUEST = "/ocr_request",
    PATH_GET_CHAT_HIST = "/get_chat_history",
	PATH_POST_CHAT_HIST = "/post_chat_history",
    //TESTED_SERVER = "http://localhost:8080",
    TESTED_SERVER = "https://iitsm-mw.cfapps.eu10.hana.ondemand.com",
    AUTOSOLVED_CREATE_INCIDENT = settings.AUTOSOLVED_CREATE_INCIDENT
    ;

const server = supertest.agent(TESTED_SERVER);

let reqBody = {
    "conversation": {
        "language": "ja",
        "id": "MochaTest",
        "memory": {
          "serverEnv": "test",
          "system":{ "raw": "CHK" },
          "client":{ "raw": "100" },
          "sapuserid":{ "raw": "SUYAMAT" },
          "vbeln":{ "raw": "80000001"},
          "incident_type": { "raw": "種別はトラブルです" },
          "incident_title": "受注伝票の登録時にエラーが発生している",
          "incident_text": "mocha test: インシデントテキスト",
          "date": { "raw": "20181030" },
          "due_date":{ "raw": "明日中です" },
          "processing_type":{ "raw": "オンライン処理です" },
          "timing": { "raw": "直近15分です" },
          "problem_occurring": { "raw": "システム全体" },
          "processing_time": { "raw": "1~10分です"},
          "normal_processing_time": { "raw": "10~30秒です"},
          "transaction_code": { "raw": "CAT2" },
          "transmission_number": { "raw": "IF0006"},
          "firstChatCategory": {
            "value": "セキュリティ",
            "raw": "セキュリティ"
          },
          "security_category": {
            "value": "ユーザーのアンロック",
            "raw": "ユーザーのアンロック"
          },
          "secondChatCategory": "ユーザーのアンロック"
        },
        "skill": "Mocha"
    },
    "nlp": {
        "source": "This is the mocha test."
    }
};

const _checkPath = ( path, body ) => {
    return new Promise( ( resolve, reject ) => {
        server
        .post(path)
        .send(body)
        .set('Accept', 'application/json')
        .auth( caiAuth.USER, caiAuth.PASS )
        //.expect("Content-type",/json/)
        .expect(200)
        .end( (err, res) => {
            if (err) reject(err);
            console.log(">>> Reply >>>", res.body.replies);
            res.status.should.equal(200);
            resolve();
        });
    });
};

console.log(`>>> Tested Server is ${TESTED_SERVER} <<<`);
console.log(`>>> Auto solved incident creation: ${AUTOSOLVED_CREATE_INCIDENT} <<<`);

describe("### Webhooks Test ###", () => {

    //####################################
    // Scenario "unlock_user"
    //####################################
    it(`=== PATH: ${PATH_UNLOCK_USER}-1 (Check lock status: No incident creation) ===`, async () => {
        await _checkPath( PATH_UNLOCK_USER, reqBody );
    }).timeout(5000);

    it(`=== PATH: ${PATH_UNLOCK_USER} (Incident creation: "login_check" & "canUserLogon = false") ===`, async () => {
        // Control final logon check
        reqBody.conversation.memory.login_check = "YES";
        reqBody.conversation.memory.canUserLogon = false;

        await _checkPath( PATH_UNLOCK_USER, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_UNLOCK_USER} ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_UNLOCK_USER} (The case of automatic solution [canUserLogon = true])===`, async () => {
        // If the incident creation for automatic solution is active, the incident will be created.
        reqBody.conversation.memory.canUserLogon = true;

        await _checkPath( PATH_UNLOCK_USER, reqBody );
    }).timeout(25000);

    if (AUTOSOLVED_CREATE_INCIDENT) {
        it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_UNLOCK_USER} ===`, async () => {
            await _checkPath( PATH_CHECK_INCIDENT, reqBody );
        }).timeout(25000);
    };

    //####################################
    // Scenario "delodeli"
    //####################################
    it(`=== PATH: ${PATH_DELETE_OUTBOUND_DELIVERY} (First check without "deletion_check")===`, async () => {
        // Deletion of outbound delivery scenario requires the ERP system.
        reqBody.conversation.memory.system.raw = "PND";
        reqBody.conversation.memory.client.raw = "002";
        
        await _checkPath( PATH_DELETE_OUTBOUND_DELIVERY, reqBody );
    }).timeout(5000);

    it(`=== PATH: ${PATH_DELETE_OUTBOUND_DELIVERY} (Incident creation: "deletion_check" & "canDeleteOdeli = false")===`, async () => {
        // Deletion check was false.
        reqBody.conversation.memory.deletion_check = "YES";
        reqBody.conversation.memory.canDeleteOdeli = false;
        
        await _checkPath( PATH_DELETE_OUTBOUND_DELIVERY, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_DELETE_OUTBOUND_DELIVERY} ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_DELETE_OUTBOUND_DELIVERY} (The case of automatic solution [canDeleteOdeli = true])===`, async () => {
        // If the incident creation for automatic solution is active, the incident will be created.
        reqBody.conversation.memory.canDeleteOdeli = true;

        await _checkPath( PATH_DELETE_OUTBOUND_DELIVERY, reqBody );
    }).timeout(25000);

    if (AUTOSOLVED_CREATE_INCIDENT) {
        it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_DELETE_OUTBOUND_DELIVERY} ===`, async () => {
            await _checkPath( PATH_CHECK_INCIDENT, reqBody );
        }).timeout(25000);
    };

    //####################################
    // Scenario "perfcheck"
    //####################################
    it(`=== PATH: ${PATH_PERFORMANCE_CHECK} (First check without "finalPerfChk")===`, async () => {
        // Change the system and client again
        reqBody.conversation.memory.system.raw = "CHK";
        reqBody.conversation.memory.client.raw = "100";
        
        await _checkPath( PATH_PERFORMANCE_CHECK, reqBody );
    }).timeout(5000);

    it(`=== PATH: ${PATH_PERFORMANCE_CHECK} (Incident creation: "finalPerfChk" & "isStillPerfProblem = true")===`, async () => {
        reqBody.conversation.memory.finalPerfChk = "anything";
        reqBody.conversation.memory.isStillPerfProblem = true;
        
        await _checkPath( PATH_PERFORMANCE_CHECK, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_PERFORMANCE_CHECK} ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_PERFORMANCE_CHECK} (Incident creation (Auto): "finalPerfChk" & "isStillPerfProblem = false")===`, async () => {
        reqBody.conversation.memory.finalPerfChk = "anything";
        reqBody.conversation.memory.isStillPerfProblem = false;
        
        await _checkPath( PATH_PERFORMANCE_CHECK, reqBody );
    }).timeout(25000);

    if (AUTOSOLVED_CREATE_INCIDENT) {
        it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_PERFORMANCE_CHECK} ===`, async () => {
            await _checkPath( PATH_CHECK_INCIDENT, reqBody );
        }).timeout(25000);
    };

    it(`=== PATH: ${PATH_PERFORMANCE_CHECK} (Incident creation: "variant" & "specificProcEnd = YES")===`, async () => {
        delete reqBody.conversation.memory.finalPerfChk;
        reqBody.conversation.memory.variant = "ZVARIANT_MOCHA";
        reqBody.conversation.memory.specificProcEnd = "YES";
        
        await _checkPath( PATH_PERFORMANCE_CHECK, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_PERFORMANCE_CHECK} ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_PERFORMANCE_CHECK} (Incident creation: "job_name" & "jobProblemEnd = YES")===`, async () => {
        reqBody.conversation.memory.processing_type.raw = "ジョブです";
        reqBody.conversation.memory.job_name = { "raw": "ZJOB_MOCHA" };
        reqBody.conversation.memory.jobProblemEnd = "YES";
        
        await _checkPath( PATH_PERFORMANCE_CHECK, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_PERFORMANCE_CHECK} ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    //####################################
    // Scenario "/create_incident"
    //####################################
    it(`=== PATH: ${PATH_CREATE_INCIDENT}-1 (Incident creation: "isProblemSolved = false/undefined")===`, async () => {
        await _checkPath( PATH_CREATE_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_CREATE_INCIDENT}-1 ===`, async () => {
        await _checkPath( PATH_CHECK_INCIDENT, reqBody );
    }).timeout(25000);

    it(`=== PATH: ${PATH_CREATE_INCIDENT} (Incident creation: "isProblemSolved = true")===`, async () => {
        reqBody.conversation.memory.isProblemSolved = true;
        
        await _checkPath( PATH_CREATE_INCIDENT, reqBody );
    }).timeout(25000);

    if (AUTOSOLVED_CREATE_INCIDENT) {
        it(`=== PATH: ${PATH_CHECK_INCIDENT} for ${PATH_CREATE_INCIDENT} ===`, async () => {
            await _checkPath( PATH_CHECK_INCIDENT, reqBody );
        }).timeout(25000);
    };

    //######################################################
    // Scenario "/get_chat_history" & "/post_chat_history"
    //######################################################
    // GET
    it(`=== PATH: ${PATH_GET_CHAT_HIST} (Getting the chat history of ${reqBody.conversation.memory.sapuserid.raw} from DB) ===`, async () => {
        await _checkPath( PATH_GET_CHAT_HIST, reqBody );
    }).timeout(25000);
    // POST
    it(`=== PATH: ${PATH_POST_CHAT_HIST} (Posting the chat history for ${reqBody.conversation.memory.sapuserid.raw}, ${reqBody.conversation.memory.firstChatCategory.raw}, ${reqBody.conversation.memory.secondChatCategory}) ===`, async () => {
        await _checkPath( PATH_POST_CHAT_HIST, reqBody );
    }).timeout(25000);
});