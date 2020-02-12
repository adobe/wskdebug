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

'use strict';

/* eslint-env mocha */

// redirect console log output into a log file during unit tests to keep stdout clean
// - log file: build/mocha.test.log
// - can be changed by setting the MOCHA_TEST_LOG_FILE environment variable

// this is a global mocha setup file, before() and after() here run before and after all tests

// disable log file when asked using -v or inside vscode test runners
if (process.argv.includes("-v") || process.argv.some(s => s.includes("vscode-mocha-test-adapter"))) {
    return;
}

const TEST_LOG_FILE = process.env.MOCHA_TEST_LOG_FILE || "build/mocha.test.log";

const clone = require('clone');
const util = require('util');
const path = require('path');
const fsExtra = require('fs-extra');

// ---------------------------------------------------------------------
// file writing using native fs binding, which works around mock-fs

const fsBinding = clone(process.binding('fs'));

function fileOpen(path) {
    // overwrite = 1537,
    // append = 521
    return fsBinding.open(path, 1537, 438, undefined, { path: path });
}

function fileWrite(fd, data) {
    const buffer = Buffer.from(data);
    fsBinding.writeBuffer(fd, buffer, 0, buffer.length, null, undefined, {});
}

function fileClose(fd) {
    fsBinding.close(fd, undefined, {});
}

// ---------------------------------------------------------------------

let logFile;
const originalConsole = {
    log: console.log,
    error: console.error,
    info: console.info,
    debug: console.debug
};

before(function() {
    console.log(`Log output in '${TEST_LOG_FILE}'. To log on stdout, run 'npm test -- -v'.`);
    console.log();
    process.on('exit', function() {
        console.log(`Log output written to '${TEST_LOG_FILE}'. To log on stdout, run 'npm test -- -v'.`);
        console.log();
    });

    fsExtra.mkdirsSync(path.dirname(TEST_LOG_FILE));
    logFile = fileOpen(TEST_LOG_FILE);
    // make available globally for e.g. child process output
    global.mochaLogFile = logFile;

    console.log = function(...args) {
        if (global.disableMochaLogFile) {
            process.stdout.write(util.format(...args));
        } else {
            fileWrite(logFile, util.format(...args) + "\n");
        }
    };
    console.error = function(...args) {
        if (global.disableMochaLogFile) {
            process.stderr.write(util.format(...args));
        } else {
            fileWrite(logFile, util.format(...args) + "\n");
        }
    }
    console.info = console.log;
    console.debug = console.log;
    console.warn = console.error;
    console._logToFile = true;
});

beforeEach(function() {
    // print full test title - all nested describes and current test
    let t = this.currentTest;
    let title = t.title;
    while (t.parent && t.parent.title) {
        t = t.parent;
        title = t.title + " > " + title;
    }
    console.log("[TEST]", title);
    console.log();
});

afterEach(function() {
    console.log();
});

after(function() {
    fileClose(logFile);
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
});
