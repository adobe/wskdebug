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

'use strict';

const Debugger = require("../src/debugger");

const test = require('./test');
const assert = require('assert');
const tmp = require('tmp');
const fs = require('fs');

describe('source watching', function() {
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

    it("should invoke action when a source file changes and -P is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        let invokedAction = false;
        test.nockActivation("myaction")
            .reply((uri, body) => {
                if (body.key === "invocationOnSourceModification") {
                    // right action got invoked
                    invokedAction = true;
                    return [200, {}];
                }
                return [500, {}];
            });

        // wskdebug myaction action.js -P '{...}' -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!invokedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(invokedAction, "action was not invoked on source change");
        test.assertAllNocksInvoked();
    });

    it("should invoke action when a source file changes and -P is set to a filename", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        let invokedAction = false;
        test.nockActivation("myaction")
            .reply((uri, body) => {
                if (body.key === "invocationOnSourceModification") {
                    // right action got invoked
                    invokedAction = true;
                    return [200, {}];
                }
                return [500, {}];
            });

        // wskdebug myaction action.js -P params.json -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: 'params.json'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!invokedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(invokedAction, "action was not invoked on source change");
        test.assertAllNocksInvoked();
    });

    it("should invoke action when a source file changes and -a and -P is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        // mock agent & action invocaton logic on the openwhisk side
        let invokedAction = false;
        let invokedWrongAction = false;

        test.nockActivation("another-action")
            .reply((uri, body) => {
                if (body.key === "invocationOnSourceModification") {
                    // right action got invoked
                    invokedAction = true;
                    return [200, {}];
                }
                return [500, {}];
            });

        test.nockActivation("myaction")
            .optionally()
            .reply(async () => {
                invokedWrongAction = true;
            });

        // wskdebug myaction action.js -P '{...}' -a another-action -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }',
            invokeAction: 'another-action'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!invokedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(!invokedWrongAction, "ignored -a and incorrectly invoked the action itself");
        assert.ok(invokedAction, "action was not invoked on source change");
        test.assertAllNocksInvoked();
    });

    it("should invoke action when a source file changes and -a is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        // mock agent & action invocaton logic on the openwhisk side
        let invokedAction = false;
        let invokedWrongAction = false;

        test.nockActivation("another-action")
            .reply(() => {
                // right action got invoked
                invokedAction = true;
                return [200, {}];
            });

        test.nockActivation("myaction")
            .optionally()
            .reply(async () => {
                invokedWrongAction = true;
            });

        // wskdebug myaction action.js -P '{...}' -a another-action -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeAction: 'another-action'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!invokedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(!invokedWrongAction, "ignored -a and incorrectly invoked the action itself");
        assert.ok(invokedAction, "action was not invoked on source change");
        test.assertAllNocksInvoked();
    });

    it("should run shell command when a source file changes and -r is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction action.js -r 'echo ...' -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // simulate a source file change
        test.touchFile("action.js");

        // wait for result of shell file command
        let ranShellCommand = false;
        while (!ranShellCommand && test.hasNotTimedOut(this)) {
            await test.sleep(100);
            if (fs.readFileSync(tmpFile).toString().trim() === "CORRECT") {
                ranShellCommand = true;
            }
        }

        await dbgr.stop();

        assert.ok(ranShellCommand, "shell command was not run on source change");
        test.assertAllNocksInvoked();
    });

    it("should run shell command on start when --on-start is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction -r 'echo ...' -p ${test.port}
        process.chdir("test/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            onStart: `echo "CORRECT" > ${tmpFile}`
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait for result of shell file command
        let ranShellCommand = false;
        while (!ranShellCommand && test.hasNotTimedOut(this)) {
            await test.sleep(100);
            if (fs.readFileSync(tmpFile).toString().trim() === "CORRECT") {
                ranShellCommand = true;
            }
        }

        await dbgr.stop();

        assert.ok(ranShellCommand, "shell command was not run on start");
        test.assertAllNocksInvoked();
    });

});