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
const assert = require('assert');
const stripAnsi = require('strip-ansi');

describe('node.js', () => {
    before(() => {
        test.isDockerInstalled();
    });

    beforeEach(async () => {
        test.beforeEach();
        this.cwd = process.cwd();
        // find free port
        this.port = await getPort(9229);
        console.log("[test] free port:", this.port);
    });

    afterEach(() => {
        test.afterEach();
        console.log("chdir back to", this.cwd);
        process.chdir(this.cwd);
    });

    it("should print help", async () => {
        test.startCaptureStdout();

        await wskdebug(`-h`);

        const stdio = test.endCaptureStdout();

        assert.equal(stdio.stderr, "");
        // testing a couple strings that should rarely change
        assert(stdio.stdout.includes("Debug an OpenWhisk <action> by forwarding its activations to a local docker container"));
        assert(stdio.stdout.includes("Supported kinds:"));
        assert(stdio.stdout.includes("Arguments:"));
        assert(stdio.stdout.includes("Action options:"));
        assert(stdio.stdout.includes("LiveReload options:"));
        assert(stdio.stdout.includes("Debugger options:"));
        assert(stdio.stdout.includes("Agent options:"));
        assert(stdio.stdout.includes("Options:"));
    });

    it("should print the version", async () => {
        test.startCaptureStdout();

        await wskdebug(`--version`);

        const stdio = test.endCaptureStdout();
        assert.equal(stdio.stderr, "");
        assert.equal(stripAnsi(stdio.stdout.trim()), require(`${process.cwd()}/package.json`).version);
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

        await wskdebug(`myaction -p ${this.port}`);

        test.assertAllNocksInvoked();
    })
    .timeout(30000);

    it("should mount local sources with plain js and flat source structure", async () => {
        test.mockOpenwhisk(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/plain-flat");
        await wskdebug(`myaction action.js -p ${this.port}`);

        test.assertAllNocksInvoked();
    })
    .timeout(30000);

    it("should mount local sources with plain js and one level deep source structure", async () => {
        test.mockOpenwhisk(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/plain-onelevel");
        await wskdebug(`myaction lib/action.js -p ${this.port}`);

        test.assertAllNocksInvoked();
    })
    .timeout(30000);

    it.skip("should mount and run local sources with a comment on the last line", async () => {
        test.mockOpenwhisk(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            { },
            { msg: "CORRECT" }
        );

        process.chdir("test/trailing-comment");
        await wskdebug(`myaction -p ${this.port} action.js`);

        test.assertAllNocksInvoked();
    })
    .timeout(30000);

    it("should mount local sources with commonjs and flat source structure", async () => {
        test.mockOpenwhisk(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "one/two" },
            true // binary = true for nodejs means zip action with commonjs (require) loading
        );

        process.chdir("test/commonjs-flat");
        await wskdebug(`myaction action.js -p ${this.port}`);

        test.assertAllNocksInvoked();
    })
    .timeout(30000);
});