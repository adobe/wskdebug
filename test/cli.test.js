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

// tests basic cli

const wskdebug = require('../index');

const test = require('./test');
const assert = require('assert');
const stripAnsi = require('strip-ansi');
const {execSync} = require('child_process');

describe('cli', function() {

    // DISABLED - leads to segfault in nyc
    it.skip("should print version (via cli.js)", async function() {
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