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

const openwhisk = require('openwhisk');

function outOfTime(deadline) {
    // stop 10 seconds before timeout, to have enough buffer
    return (Date.now() >= ((deadline || process.env.__OW_DEADLINE) - 10*1000));
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function removePrefix(str, prefix) {
    if (str.startsWith(prefix)) {
        return str.substring(prefix.length);
    }
    return str;
}

function actionName() {
    return removePrefix(process.env.__OW_ACTION_NAME, `/${process.env.__OW_NAMESPACE}/`);
}

async function newActivation(args) {
    args.$activationId = process.env.__OW_ACTIVATION_ID;
    await openwhisk().actions.invoke({
        name: `${actionName()}_wskdebug_invoked`,
        params: args
    });
    return args.$activationId;
}

async function pollActivations(actionName, onActivation, onLoop) {
    const wsk = openwhisk();

    let since = Date.now();

    while (true) {

        console.log("polling for activations since", since);
        const nextSince = Date.now();
        const activations = await wsk.activations.list({
            name: actionName,
            since: since,
            docs: true // include results
        });
        since = nextSince;

        console.dir(activations, { depth: null });

        for (const a of activations) {
            const result = onActivation(a);
            if (result) {
                return result;
            }
        }

        await sleep(1000);

        onLoop();
    }
}

async function waitForCompletion(activationId) {
    return pollActivations(
        `${actionName()}_wskdebug_completed`,
        a => {
            // find the one with the $activationId we are waiting on
            if (a.response && a.response.result &&
                a.response.result.$activationId === activationId) {
                const result = a.response.result;
                delete result.$activationId;
                return result;
            }
        },
        () => {
            if (outOfTime()) {
                throw new Error(`Debugger did not complete activation within timeout.`);
            }
        }
    );
}

async function doMain(args) {
    // normal activation: if debugger is waiting, make activation available to him
    console.log("activation, passing on to debugger");

    const id = await newActivation(args);
    return waitForCompletion( id );
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
