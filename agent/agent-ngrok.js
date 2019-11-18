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

// agent that forwards invocations to the developer's computer using ngrok.com

const openwhisk = require('openwhisk');
const https = require('https');

// Note: this function is duplicated by all agents
function hit(args, condition) {
    if (condition) {
        console.log("arguments:", args);
        console.log("evaluating hit condition: ", condition);
        // eslint-disable-next-line no-with
        with (args) { // lgtm [js/with-statement]
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

    if (hit(args, args.$condition) && args.$ngrokUrl) {
        console.log("passing on to debugger");

        console.log("post to ngrok", args.$ngrokUrl);
        const options = {
            hostname: args.$ngrokUrl,
            port: 443,
            path: '/',
            method: 'POST',
            headers: {
                authorization: args.$ngrokAuth
            }
        };
        return new Promise((resolve, reject) => {
            const req = https.request(options, (resp) => {
                console.log("response: ", resp.statusCode);
                let body = '';

                // A chunk of data has been recieved.
                resp.on('data', (chunk) => {
                    body += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    resolve(JSON.parse(body));
                });

            });
            req.on("error", err => {
                console.error(err);
                reject(err);
            });
            args.$activationId = process.env.__OW_ACTIVATION_ID;
            delete args.$ngrokUrl;
            delete args.$ngrokAuth;
            req.write(JSON.stringify(args));
            req.end();
        });

    } else {
        console.log("condition evaluated to false (or $ngrokUrl missing), executing original action");
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
