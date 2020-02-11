/**
 *  Copyright 2019 Adobe. All rights reserved.
 *
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

/* eslint-env mocha */

'use strict';

const Debugger = require("../src/debugger");

const test = require('./test');
const assert = require('assert');
const nock = require('nock');

describe('ngrok',  function() {
    this.timeout(30000);

    before(function() {
        test.isDockerInstalled();
    });

    beforeEach(async function() {
        await test.beforeEach();
    });

    afterEach(function() {
        test.afterEach();
    });

    it("should connect to ngrok if selected", async function() {
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        // validate that it connects to ngrok
        // leaving it at that for now - more validation would be quite difficult
        const ngrok = nock('http://127.0.0.1', {
            filteringScope: scope => /^http:\/\/127\.0\.0\.1:.*/.test(scope),
        })
            .post('/api/tunnels')
            .reply(201, { "public_url":"https://UNIT_TEST.ngrok.io" });

        // wskdebug myaction --ngrok -p ${test.port}
        const argv = {
            port: test.port,
            action: "myaction",
            ngrok: true
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test
        dbgr.run();
        await dbgr.stop();

        assert(ngrok.isDone(), "Expected these HTTP requests: " + ngrok.pendingMocks().join());
    });

    // TODO: test ngrokHandler, POST to local server
});