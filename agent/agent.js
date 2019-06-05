/*
 Copyright 2019 Adobe. All rights reserved.
 This file is licensed to you under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License. You may obtain a copy
 of the License at http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software distributed under
 the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 OF ANY KIND, either express or implied. See the License for the specific language
 governing permissions and limitations under the License.
*/

'use strict';

const os = require("os");

// shared across activations
const activations = [];
const completions = {};

function checkTimeout(deadline) {
    // stop 10 seconds before timeout, to have enough buffer
    if (Date.now() >= ((deadline || process.env.__OW_DEADLINE) - 10*1000)) {
        const e = new Error("No activation within timeout. Please retry.");
        e.code = 42;
        throw e;
    }
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function newActivation(args) {
    args.$activationId = process.env.__OW_ACTIVATION_ID;
    activations.push(args);
    return args.$activationId;
}

async function waitForActivation() {
    // blocking invocations only wait for 1 minute, regardless of the action timeout
    const oneMinuteDeadline = Date.now() + 60*1000;

    while (activations.length === 0) {
        await sleep(100);

        checkTimeout(oneMinuteDeadline);
    }

    const activation = activations.shift();
    console.log("activation id:", activation.$activationId);
    return activation;
}

function complete(result) {
    const id = result.$activationId;
    completions[result.$activationId] = result;
    delete result.$activationId;
    return {
        message: `completed activation ${id}`
    };
}

async function waitForCompletion(activationId) {
    while (!completions[activationId]) {
        await sleep(100);
    }
    const result = completions[activationId];
    delete completions[activationId];
    return result;
}

async function doMain(args) {
    console.log("hostname:", os.hostname());

    if (args.$waitForActivation) {
        // debugger connects and waits for new activations
        console.log("debugger connected, waiting for activation");
        return waitForActivation();

    } else if (args.$activationId) {
        // debugger pushes result of completed activation
        console.log("completing activation", args.$activationId);
        return complete(args);

    } else {
        // normal activation: if debugger is waiting, make activation available to him
        console.log("activation, passing on to debugger");
        return waitForCompletion( newActivation(args) );
    }
}

// OpenWhisk does not like raw exceptions, the error object should be the string message only
async function main(args) {
    try {
        return await doMain(args);
    } catch (e) {
        console.log("Exception:", e);
        return Promise.reject({ error: e.message, code: e.code});
    }
}

module.export = main;
