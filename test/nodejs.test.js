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

// tests for node.js debugging

// here is how most tests are setup:
// - requests to openwhisk and the agent are mocked using nock
// - docker is required and the containers actually run

const wskdebug = require('../index');
const Debugger = require("../src/debugger");

const test = require('./test');
const assert = require('assert');
const fse = require('fs-extra');

describe('nodejs', function() {
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

    it("should run an action without local sources", async function() {
        test.mockActionAndInvocation(
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

        await wskdebug(`myaction -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with plain js and flat source structure", async function() {
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/nodejs/plain-flat");
        await wskdebug(`myaction action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with plain js and one level deep source structure", async function() {
        test.mockActionAndInvocation(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/nodejs/plain-onelevel");
        await wskdebug(`myaction lib/action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("it should always use linux paths in docker code", async function() {
        const nodejs = require("../src/kinds/nodejs/nodejs")
        const path = require("path")

        // manually mock path
        path.sep = '\\'
        const posix = path.posix
        path.posix = { sep: '/' }

        process.chdir("test/nodejs/plain-onelevel");
        const ret = nodejs.mountAction({
            sourceFile: 'lib\\action.js',
            sourcePath: 'lib/action.js'
        })

        // restore mock
        path.sep = '/'
        path.posix = posix

        // asserts
        assert(ret.code.includes('lib/action.js'))
        assert(!ret.code.includes('lib\\action.js'))
    });

    it("should mount local sources with a require(../) dependency", async function() {
        this.timeout(10000);
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" },
            true // binary
        );

        process.chdir("test/nodejs/commonjs-onelevel");
        await wskdebug(`myaction lib/action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with a require(../) dependency reported as non binary", async function() {
        this.timeout(10000);
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/nodejs/commonjs-onelevel");
        await wskdebug(`myaction lib/action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with a require(../) dependency using absolute paths", async function() {
        this.timeout(10000);
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" },
            true // binary
        );

        process.chdir("test/nodejs/commonjs-onelevel");
        await wskdebug(`myaction ${process.cwd()}/lib/action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with a require(../) dependency and run build with --on-build set", async function() {
        this.timeout(10000);
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" }
        );

        process.chdir("test/nodejs/commonjs-onelevel");
        fse.removeSync("build");

        // simulate a build that moves things into a separate directory with different naming
        const onBuild = "mkdir -p build/out; cp -R lib build/out/folder; cp dependency.js build/out";
        await wskdebug(`myaction lib/action.js --on-build '${onBuild}' --build-path build/out/folder/action.js -p ${test.port}`);

        fse.removeSync("build");
        test.assertAllNocksInvoked();
    });



    it("should mount and run local sources with a comment on the last line", async function() {
        test.mockActionAndInvocation(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            { },
            { msg: "CORRECT" }
        );

        process.chdir("test/nodejs/trailing-comment");
        await wskdebug(`myaction -p ${test.port} action.js`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with commonjs and flat source structure", async function() {
        test.mockActionAndInvocation(
            "myaction",
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT/RESULT" },
            true // binary = true for nodejs means zip action with commonjs (require) loading
        );

        process.chdir("test/nodejs/commonjs-flat");
        await wskdebug(`myaction action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with plain js reported as binary", async function() {
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT" },
            true // binary
        );

        process.chdir("test/nodejs/plain-flat");
        await wskdebug(`myaction action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should mount local sources with commonjs reported as non binary", async function() {
        this.timeout(10000);
        test.mockActionAndInvocation(
            "myaction",
            // should not use this code if we specify local sources which return CORRECT
            `const main = () => ({ msg: 'WRONG' });`,
            {},
            { msg: "CORRECT/RESULT" },
            false // binary
        );

        process.chdir("test/nodejs/commonjs-flat");
        await wskdebug(`myaction action.js -p ${test.port}`);

        test.assertAllNocksInvoked();
    });

    it("should invoke and handle action when a source file changes and -P is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        // mock agent & action invocaton logic on the openwhisk side
        const ACTIVATION_ID = "1234567890";
        let invokedAction = false;
        let completedAction = false;

        test.nockActivation("myaction")
            .reply(async (uri, body) => {
                let response = [];
                // wskdebug polling the agent
                if (body.$waitForActivation === true) {
                    // when the action got invoked, we tell it wskdebug
                    // but only once
                    if (invokedAction && !completedAction) {
                        response = [ 200, {
                            response: {
                                result: {
                                    $activationId: ACTIVATION_ID
                                }
                            }
                        }];
                    } else {
                        // tell wskdebug to retry polling
                        response = [ 502, test.agentRetryResponse() ];
                    }
                } else if (body.key === "invocationOnSourceModification") {
                    // the action got invoked
                    invokedAction = true;
                    response = [ 200, { activationId: ACTIVATION_ID } ];

                } else if (body.$activationId === ACTIVATION_ID) {
                    // action was completed by wskdebug
                    completedAction = true;
                    response = [200, {}];
                }
                return response;
            })
            .persist();

        // wskdebug myaction action.js -l -P '{...}' -p ${test.port}
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        dbgr.run();

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!completedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(invokedAction, "action was not invoked on source change");
        assert.ok(completedAction, "action invocation was not handled and completed");
        test.assertAllNocksInvoked();
    });

    it("should invoke and handle action when a source file changes and --on-build and --build-path and -P are set", async function() {
        this.timeout(10000);
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        // mock agent & action invocaton logic on the openwhisk side
        const ACTIVATION_ID = "1234567890";
        let invokedAction = false;
        let completedAction = false;

        test.nockActivation("myaction")
            .reply(async (uri, body) => {
                let response = [];
                // wskdebug polling the agent
                if (body.$waitForActivation === true) {
                    // when the action got invoked, we tell it wskdebug
                    // but only once
                    if (invokedAction && !completedAction) {
                        response = [ 200, {
                            response: {
                                result: {
                                    $activationId: ACTIVATION_ID
                                }
                            }
                        }];
                    } else {
                        // tell wskdebug to retry polling
                        response = [ 502, test.agentRetryResponse() ];
                    }
                } else if (body.key === "invocationOnSourceModification") {
                    // the action got invoked
                    invokedAction = true;
                    response = [ 200, { activationId: ACTIVATION_ID } ];

                } else if (body.$activationId === ACTIVATION_ID) {
                    // action was completed by wskdebug
                    if (body.msg === "CORRECT") {
                        completedAction = true;
                        response = [200, {}];
                    } else {
                        response = [502, test.agentExitResponse()];
                    }
                }
                return response;
            })
            .persist();

        // wskdebug myaction action.js --on-build "..." --build-path build/action.js -P '{...}' -p ${test.port}
        process.chdir("test/nodejs/build-step");

        fse.removeSync("build");

        const argv = {
            port: test.port,
            action: "myaction",
            // copy a different file with "CORRECT in it"
            onBuild: `mkdir -p build; cp action-build.txt build/action.js`,
            buildPath: `build/action.js`,
            sourcePath: `action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        dbgr.run();

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!completedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        fse.removeSync("build");
        assert.ok(invokedAction, "action was not invoked on source change");
        assert.ok(completedAction, "action invocation was not handled and completed");
        test.assertAllNocksInvoked();
    });

    // TODO: test -l livereload connection

    // TODO: test agents - conditions (unit test agent code locally)
    // TODO: test agent already installed (debugger.getAction())

    // TODO: test breakpoint debugging
    // TODO: test action options
    // TODO: test debugger options
    // TODO: test non-concurrent openwhisk

});