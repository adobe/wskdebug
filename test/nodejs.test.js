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

// tests for node.js debugging

// here is how most tests are setup:
// - requests to openwhisk and the agent are mocked using nock
// - docker is required and the containers actually run

const wskdebug = require('../index');
const test = require('./test');
const getPort = require('get-port');

describe('node.js', () => {
    before(() => {
        test.isDockerInstalled();
    });

    beforeEach(async () => {
        test.beforeEach();
        this.cwd = process.cwd();
        this.port = await getPort(9229);
        console.log("[test] free port:", this.port);
    });

    afterEach(() => {
        test.afterEach();
        console.log("chdir back to", this.cwd);
        process.chdir(this.cwd);
    });

    it("should run an action without local sources", async () => {
        test.mockOpenwhisk(
            "myaction",
            `function main(params) {
                return {
                    msg: 'CORRECT',
                    input: params.input
                }
            }`,
            { input: "test-input" },
            { msg: "CORRECT", input: "test-input" }
        );

        // using debug port 12345 as default makes problems in Github Actions
        await wskdebug(`myaction -p ${this.port}`);

        test.assertAllNocksInvoked();
    }).timeout(30000);

    it("should run an action with local sources - plain js, flat source structure", async () => {
        test.mockOpenwhisk(
            "myaction",
            `function main(params) {
                return {
                    msg: 'WRONG' // should not use this if we specify local sources which return different
                };
            }`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/plain-flat");
        // using debug port 12345 as default makes problems in Github Actions
        await wskdebug(`myaction action.js -p ${this.port}`);

        test.assertAllNocksInvoked();
    }).timeout(30000);
});