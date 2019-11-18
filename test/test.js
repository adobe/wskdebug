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

'use strict';

const assert = require('assert');
const nock = require('nock');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const getPort = require('get-port');

const FAKE_OPENWHISK_SERVER = "https://example.com";
const FAKE_OPENWHISK_AUTH = "c3VwZXItc2VjcmV0LWtleQ==";
const FAKE_OPENWHISK_NAMESPACE = "test";

const WSKDEBUG_BACKUP_ACTION_SUFFIX = "_wskdebug_original";

let openwhisk;

function isDockerInstalled() {
    try {
        execSync("docker info", {stdio: 'ignore'});
    } catch (e) {
        throw new Error("Docker not available or running on local system. These unit tests require it.")
    }
}

async function beforeEach() {
    process.env.WSK_CONFIG_FILE = path.join(process.cwd(), "test/wskprops");
    // nock.recorder.rec({ enable_reqheaders_recording: true });
    openwhisk = nock(FAKE_OPENWHISK_SERVER);
    // openwhisk.log(console.log);
    mockOpenwhiskSwagger(openwhisk);

    // save current working dir
    this.cwd = process.cwd();

    // find free port
    this.port = await getPort(9229);
    console.log("[test] free port:", this.port);
}

function afterEach() {
    delete process.env.WSK_CONFIG_FILE;
    nock.cleanAll();

    // restore working dir from beforeEach()
    process.chdir(this.cwd);
}

function assertAllNocksInvoked() {
    assert(
        openwhisk.isDone(),
        "Expected these HTTP requests: " + openwhisk.pendingMocks().join()
    );
}

function agentRetryResponse() {
    return {
        response: {
            success: false,
            result: {
                error: {
                    error: "Please retry.",
                    code: 42 // retry
                }
            }
        }
    };
}

function agentExitResponse() {
    return {
        response: {
            success: false,
            result: {
                error: {
                    error: "Please exit, thanks.",
                    code: 43 // graceful exit
                }
            }
        }
    };
}

function mockAction(name, code, binary=false) {
    // reading action without code
    // nockExpected
    //     .get(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${name}`)
    //     .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
    //     .query({"code":"false"})
    //     .reply(200, actionDescription(name, binary));

    // with code
    const action = nodejsActionDescription(name, binary);
    action.exec.code = code;

    // reading action with code
    openwhisk
        .get(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${name}`)
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, action);
}

function expectAgent(name, code, binary=false) {
    const backupName = name + WSKDEBUG_BACKUP_ACTION_SUFFIX;

    // wskdebug creating the backup action
    openwhisk
        .put(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${backupName}?overwrite=true`)
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, nodejsActionDescription(backupName, binary));

    // wskdebug creating the backup action
    openwhisk
        .put(
            `/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${name}?overwrite=true`,
            body => body.annotations.some(v => v.key === "wskdebug" && v.value === true)
        )
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, nodejsActionDescription(name));

    // reading it later on restore
    openwhisk
        .get(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${backupName}`)
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, Object.assign(nodejsActionDescription(backupName, binary), { exec: { code } }));

    // restoring action
    openwhisk
        .put(
            `/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${name}?overwrite=true`,
            body => body.exec && body.exec.code === code
        )
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, nodejsActionDescription(name, binary));

    // removing backup after restore
    openwhisk
        .delete(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${backupName}`)
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200);
}

function nockActivation(name, bodyFn) {
    return openwhisk
        .post(`/api/v1/namespaces/${FAKE_OPENWHISK_NAMESPACE}/actions/${name}`, bodyFn)
        .query(true) // support both ?blocking=true and non blocking (no query params)
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`);
}

function mockAgentPoll(name) {
    return nockActivation(name, body => body.$waitForActivation === true)
        .optionally()
        .reply(502, agentRetryResponse())
        .persist();
}

function expectAgentInvocation(name, params, result) {
    params = params || {};
    const activationId = Date.now();
    result.$activationId = activationId;

    // wskdebug agent ping for new activation
    nockActivation(name, body => body.$waitForActivation === true)
        .reply(200, {
            response: {
                result: Object.assign(params, { $activationId: activationId })
            }
        });

    // wskdebug sending result back to agent
    nockActivation(
            name,
            body => {
                assert.deepStrictEqual(body, result);
                return true;
            }
        ).reply(200, {
            response: {
                result: {
                    message: "Completed"
                }
            }
        });

    // graceful shutdown for wskdebug to end test
    nockActivation(name, body => body.$waitForActivation === true)
        .reply(502, {
            response: {
                success: false,
                result: {
                    error: {
                        error: "Please exit, thanks.",
                        code: 43 // graceful exit
                    }
                }
            }
        });
}

function mockActionAndInvocation(action, code, params, expectedResult, binary=false) {
    mockAction(action, code, binary);
    expectAgent(action, code, binary);

    expectAgentInvocation(action, params, expectedResult);
}

// --------------------------------------------< internal >---------------

function nodejsActionDescription(name, binary=false) {
    return {
        "annotations":[
            { "key": "exec", "value": "nodejs:10" },
            { "key": "provide-api-key", "value": true }
        ],
        "exec":{
            "kind": "nodejs:10",
            "binary": binary
        },
        "limits":{
            "concurrency": 200,
            "logs": 10,
            "memory": 256,
            "timeout": 300000
        },
        "name": name,
        "namespace": FAKE_OPENWHISK_NAMESPACE,
        "parameters": [],
        "publish": false,
        "version": "0.0.1"
    };
}

function mockOpenwhiskSwagger(openwhisk) {
    // mock swagger api response
    openwhisk
        .get('/')
        .optionally()
        .matchHeader("accept", "application/json")
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, {
            "api_paths": ["/api/v1"],
            "description": "OpenWhisk",
            "limits": {
                "actions_per_minute":600,
                "concurrent_actions":100,
                "max_action_duration":3600000,
                "max_action_logs":10485760,
                "max_action_memory":52428800000,
                "min_action_duration":100,
                "min_action_logs":0,
                "min_action_memory":134217728,
                "sequence_length":50,
                "triggers_per_minute":600
            },
            "runtimes":{
                "nodejs": [
                    {
                        "kind":"nodejs:10",
                        "attached":true,
                        "default":true,
                        "deprecated":false,
                        "image":"bladerunner/adobe-action-nodejs-v10:3.0.21",
                        "requireMain":false
                    },{
                        "kind":"nodejs",
                        "attached":true,
                        "default":false,
                        "deprecated":true,
                        "image":"bladerunner/adobe-action-nodejs-v10-fat:3.0.17",
                        "requireMain":false
                    },{
                        "kind":"nodejs:10-fat",
                        "attached":true,
                        "default":false,
                        "deprecated":true,
                        "image":"bladerunner/adobe-action-nodejs-v10-fat:3.0.17",
                        "requireMain":false
                    },{
                        "kind":"nodejs:6",
                        "attached":true,
                        "default":false,
                        "deprecated":true,
                        "image":"bladerunner/adobe-action-nodejs-v10-fat:3.0.17",
                        "requireMain":false
                    },{
                        "kind":"nodejs:8",
                        "attached":true,
                        "default":false,
                        "deprecated":true,
                        "image":"bladerunner/adobe-action-nodejs-v10-fat:3.0.17",
                        "requireMain":false
                    }
                ]
            },
            "support":{
                "github":"https://github.com/apache/openwhisk/issues",
                "slack":"http://slack.openwhisk.org"
            }
        });

    openwhisk
        .get('/api/v1')
        .optionally()
        .matchHeader("accept", "application/json")
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200,{
            "api_version":"1.0.0",
            "api_version_path":"v1",
            "build":"2019-11-08 - a",
            "buildno":"v58 - runtime-prs-v59-f7774d5",
            "description":"OpenWhisk API",
            "swagger_paths": {
                "api-docs":"/api-docs",
                "ui":"/docs"
            }
        });

    openwhisk
        .get('/api/v1/api-docs')
        .optionally()
        .matchHeader("accept", "application/json")
        .matchHeader("authorization", `Basic ${FAKE_OPENWHISK_AUTH}`)
        .reply(200, JSON.parse(fs.readFileSync("./test/openwhisk-swagger.json")));
}

// --------------------------------------------< utils >---------------

let capture;

function startCaptureStdout() {
    endCaptureStdout();
    global.disableMochaLogFile = true;

    capture = {
        stdout: "",
        stderr: "",
        original: {
            stdoutWrite: process.stdout.write,
            stderrWrite: process.stderr.write
        }
    };
    process.stdout.write = function(string) {
        capture.stdout += string;
    };
    process.stderr.write = function(string) {
        capture.stderr += string;
    };
}

function endCaptureStdout() {
    delete global.disableMochaLogFile;

    if (capture && capture.original) {
        process.stdout.write = capture.original.stdoutWrite;
        process.stderr.write = capture.original.stderrWrite;
        delete capture.original;
    }
    if (capture) {
        return {
            stdout: capture.stdout,
            stderr: capture.stderr
        };
    } else {
        return {};
    }
}

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function touchFile(file) {
    fs.utimesSync(file, Date.now(), Date.now());
}

function hasNotTimedOut(testCtx) {
    if (!testCtx.test) {
        return false;
    }
    if (testCtx.test.__deadline === undefined) {
        testCtx.test.__deadline = Date.now() + testCtx.timeout() * 0.8;
        return true;
    }
    return Date.now() < testCtx.test.__deadline;
}

// --------------------------------------------< exports >---------------

module.exports = {
    isDockerInstalled,
    beforeEach,
    afterEach,
    assertAllNocksInvoked,
    // mock
    mockActionAndInvocation,
    // advanced
    mockAction,
    expectAgent,
    nockActivation,
    expectAgentInvocation,
    mockAgentPoll,
    agentRetryResponse,
    agentExitResponse,
    // utils
    startCaptureStdout,
    endCaptureStdout,
    sleep,
    touchFile,
    hasNotTimedOut
}