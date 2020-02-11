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

// tests basic cli

const wskdebug = require('../index');

const test = require('./test');
const assert = require('assert');
const stripAnsi = require('strip-ansi');
const {execSync} = require('child_process');

describe('cli', function() {

    it("should print version (via cli.js)", async function() {
        this.timeout(5000);
        const stdout = execSync("node cli.js --version").toString();
        assert.equal(stripAnsi(stdout.trim()), require(`${process.cwd()}/package.json`).version);
    });

    it("should print help", async function() {
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

    it("should print the version", async function() {
        test.startCaptureStdout();

        await wskdebug(`--version`);

        const stdio = test.endCaptureStdout();
        assert.equal(stdio.stderr, "");
        assert.equal(stripAnsi(stdio.stdout.trim()), require(`${process.cwd()}/package.json`).version);
    });

});