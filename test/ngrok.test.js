/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2019 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const Debugger = require("../src/debugger");

const test = require('./test');
const assert = require('assert');
const nock = require('nock');

describe('ngrok', () => {
    before(() => {
        test.isDockerInstalled();
    });

    beforeEach(async () => {
        await test.beforeEach();
    });

    afterEach(() => {
        test.afterEach();
    });

    it("should connect to ngrok if selected", async () => {
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
    })
    .timeout(20000);

    // TODO: test ngrokHandler, POST to local server
});