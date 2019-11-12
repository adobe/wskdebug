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

const test = require('./test');

// const assert = require('assert');

describe('node.js', () => {
    beforeEach(() => {
        test.beforeEach();
    });

    afterEach(() => {
        test.afterEach();
    });

    it("should debug an action without local sources", async () => {
        const ACTION_NAME = "myaction";
        const CODE = "function main(params) { return { msg: 'CORRECT', input: params.input } }";

        test.mockOpenwhiskAction(ACTION_NAME, CODE);
        test.expectActionBackup(ACTION_NAME, CODE);
        test.expectInstallAgent(ACTION_NAME);
        test.mockInvocation(ACTION_NAME, "1234", { input: "test-input" });
        test.expectInvocationResult(ACTION_NAME, "1234", { msg: "CORRECT", input: "test-input" });

        // using debug port 12345 as default makes problems in Github Actions
        await test.wskdebug(`${ACTION_NAME} -p 12345`);

        test.assertAllNocksInvoked();
    }).timeout(5000)

    it("should debug an action without local sources2", async () => {
        const ACTION_NAME = "myaction";
        const CODE = "function main(params) { return { msg: 'CORRECT', input: params.input } }";

        test.mockOpenwhiskAction(ACTION_NAME, CODE);
        test.expectActionBackup(ACTION_NAME, CODE);
        test.expectInstallAgent(ACTION_NAME);
        test.mockInvocation(ACTION_NAME, "5555", { input: "different" });
        test.expectInvocationResult(ACTION_NAME, "5555", { msg: "CORRECT", input: "different" });

        // using debug port 12345 as default makes problems in Github Actions
        await test.wskdebug(`${ACTION_NAME} -p 12345`);

        test.assertAllNocksInvoked();
    }).timeout(5000)
});