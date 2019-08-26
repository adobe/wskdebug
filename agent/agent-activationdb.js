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

/* eslint-disable strict */

// agent that forwards invocations to the developer's computer by storing them in the
// activation db using simple "echo.js" actions (_wskdebug_invoked & _wskdebug_completed),
// and polling the activation db for those

const openwhisk = require('openwhisk');

const activationListFilterOnlyBasename = false;

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

    const since = Date.now();

    while (true) {

        let name = actionName;
        if (activationListFilterOnlyBasename) {
            if (actionName.includes("/")) {
                name = actionName.substring(actionName.lastIndexOf("/") + 1);
            }
        }

        const activations = await wsk.activations.list({
            name: name,
            since: since,
            docs: true // include results
        });

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

// Note: this function is duplicated by all agents
function hit(args, condition) {
    if (condition) {
        console.log("arguments:", args);
        console.log("evaluating hit condition: ", condition);
        // eslint-disable-next-line no-with
        with (args) {
            try {
                // eslint-disable-next-line no-eval
                return eval(condition);
            } catch (e) {
                console.log("failed to eval condition:", e);
                // be safe: do not hit if error in condition
                return false;
            }
        }
    } else {
        // no condition => always hit
        return true;
    }
}

async function doMain(args) {
    // normal activation: make activation available to debugger
    console.log("activation");

    if (hit(args, args.$condition)) {
        console.log("passing on to debugger");
        const id = await newActivation(args);
        return waitForCompletion( id );

    } else {
        console.log("condition evaluated to false, executing original action");
        return openwhisk().actions.invoke({
            name: `${process.env.__OW_ACTION_NAME}_wskdebug_original`,
            params: args,
            blocking: true,
            result: true
        });
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
