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
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

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

    it("should invoke action when a source file changes and -P is set when source-path points to directory", async function() {
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

        // wskdebug myaction test/fake -P '{...}' -p ${test.port}
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: "test/fake",
            invokeParams: '{ "key": "invocationOnSourceModification" }',
            // fake language/kind, manually set all required elements
            kind: "fake",
            image: "adobeapiplatform/adobe-action-nodejs-v10:3.0.21",
            internalPort: 1234,
            command: "node app.js"
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("test/fake/params.json");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!invokedAction && test.hasNotTimedOut(this)) {
            await test.sleep(100);
        }

        await dbgr.stop();

        assert.ok(invokedAction, "action was not invoked on source change");
        test.assertAllNocksInvoked();
    });

    it("should not invoke action when a source file in parent dir changes and -P is set", async function() {
        this.timeout(10000);
        const deadline = Date.now() + this.timeout()/2;

        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        let invokedAction = false;
        test.nockActivation("myaction")
            .optionally()
            .reply((uri, body) => {
                if (body.key === "invocationOnSourceModification") {
                    // right action got invoked
                    invokedAction = true;
                    return [200, {}];
                }
                return [500, {}];
            });

        // wskdebug myaction action.js -P '{...}' -p ${test.port}
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: '{ "key": "invocationOnSourceModification" }'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change in (unwatched) parent directory
        test.touchFile("../action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        while (Date.now() < deadline) {
            await test.sleep(100);
            if (invokedAction) {
                // this would be wrong, but let's abort then
                break;
            }
        }

        await dbgr.stop();

        assert.ok(!invokedAction, "action was invoked on unwatched source change");
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
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeParams: 'params.json'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

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
        process.chdir("test/nodejs/plain-flat");
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

        // wait a bit
        await test.sleep(500);

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
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            invokeAction: 'another-action'
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

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
        process.chdir("test/nodejs/plain-flat");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `${process.cwd()}/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

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

    it("should run shell command when a file with a custom extension set in --watch-exts changes", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction action.js -r 'echo ...' -p ${test.port}
        process.chdir("test/nodejs/watch");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `src/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`,
            watchExts: "xyz"
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("action.xyz");

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

    it("should not run shell command when a file with an extension not set in --watch-exts changes", async function() {
        this.timeout(10000);
        const deadline = Date.now() + this.timeout()/2;

        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        console.log(tmpFile);
        tmp.setGracefulCleanup();

        // wskdebug myaction action.js -r 'echo ...' -p ${test.port}
        process.chdir("test/nodejs/watch");
        const argv = {
            verbose: true,
            port: test.port,
            action: "myaction",
            sourcePath: `src/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`,
            watchExts: "xyz"
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change but != xyz extension set above
        test.touchFile("src/action.js");

        // wait for result of shell file command
        let ranShellCommand = false;
        while (Date.now() < deadline) {
            await test.sleep(100);
            if (fs.readFileSync(tmpFile).toString().trim() === "CORRECT") {
                ranShellCommand = true;
            }
        }

        await dbgr.stop();

        assert.ok(!ranShellCommand, "shell command was incorrectly run on source change");
        test.assertAllNocksInvoked();
    });

    it("should trigger when a source file inside --watch dir is changed", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction action.js -r 'echo ...' -p ${test.port}
        process.chdir("test/nodejs/watch");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `src/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`,
            watch: "src"
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("src/action.js");

        // eslint-disable-next-line no-unmodified-loop-condition
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

    it("should not trigger when a source file outside --watch dir is changed", async function() {
        this.timeout(10000);
        const deadline = Date.now() + this.timeout()/2;

        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction action.js -r 'echo ...' -p ${test.port}
        process.chdir("test/nodejs/watch");
        const argv = {
            port: test.port,
            action: "myaction",
            sourcePath: `src/action.js`,
            onChange: `echo "CORRECT" > ${tmpFile}`,
            watch: "src"
        };

        const dbgr = new Debugger(argv);
        await dbgr.start();
        // no need to run() for this test

        // wait a bit
        await test.sleep(500);

        // simulate a source file change
        test.touchFile("dummy.js");

        // eslint-disable-next-line no-unmodified-loop-condition
        let ranShellCommand = false;
        while (Date.now() < deadline) {
            await test.sleep(100);
            if (fs.readFileSync(tmpFile).toString().trim() === "CORRECT") {
                ranShellCommand = true;
                // this would be wrong, but let's abort then
                break;
            }
        }

        await dbgr.stop();

        assert.ok(!ranShellCommand, "shell command was run on unwatched source change");
    });

    it("should run shell command on start when --on-start is set", async function() {
        const action = "myaction";
        const code = `const main = () => ({ msg: 'WRONG' });`;

        test.mockAction(action, code);
        test.expectAgent(action, code);

        const tmpFile = tmp.fileSync().name;
        tmp.setGracefulCleanup();

        // wskdebug myaction -r 'echo ...' -p ${test.port}
        process.chdir("test/nodejs/plain-flat");
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