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

const { execSync } = require('child_process');
const fetch = require('fetch-retry');

const RUNTIME_PORT = 8080;

// https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#system-limits
const OPENWHISK_DEFAULTS = {
    timeout: 60*1000,
    memory: 256
}

// https://github.com/apache/incubator-openwhisk/blob/master/ansible/files/runtimes.json
// note: openwhisk deployments might have their own versions
const RUNTIMES = {
    "nodejs"         : { // deprecated, image no longer available
        image: "openwhisk/nodejsaction:latest"
    },
    "nodejs:6"       : {
        image: "openwhisk/nodejs6action:latest"
        // can reference a different DEBUG below if necessary
        // debug: "nodejsLegacy"
    },
    "nodejs:8"       : {
        image: "openwhisk/action-nodejs-v8:latest"
    },
    "nodejs:10"      : { // Adobe I/O Runtime specific
        image: "adobeapiplatform/adobe-action-nodejs-v10:3.0.13"
    },
    "nodejs:12"      : {
        image: "openwhisk/action-nodejs-v12:latest"
    },
    "nodejs:default" : { // Adobe I/O Runtime specific
        image: "adobeapiplatform/adobe-action-nodejs-v10:3.0.13"
    },
    "python"         : {
        image: "openwhisk/python2action:latest"
    },
    "python:2"       : {
        image: "openwhisk/python2action:latest"
    },
    "python:3"       : {
        image: "openwhisk/python3action:latest"
    },
    "swift"          : { // deprecated, image no longer available
        image: "openwhisk/swiftaction:latest"
    },
    "swift:3"        : { // deprecated, but still available
        image: "openwhisk/swift3action:latest"
    },
    "swift:3.1.1"    : {
        image: "openwhisk/action-swift-v3.1.1:latest"
    },
    "swift:4.1"      : {
        image: "openwhisk/action-swift-v4.1:latest"
    },
    "java"           : {
        image: "openwhisk/java8action:latest"
    },
    "php:7.1"        : {
        image: "openwhisk/action-php-v7.1:latest"
    },
    "php:7.2"        : {
        image: "openwhisk/action-php-v7.2:latest"
    },
    "native"         : {
        image: "openwhisk/dockerskeleton:latest"
    }
}

const DEBUG = {
    nodejs: {
        // additional debug port to expose
        port: 9229,
        // modified docker image command/entrypoint to enable debugging
        command: "node --expose-gc --inspect=0.0.0.0:9229 app.js"
    }
}

const RETRY_DELAY_MS = 100;

function execute(cmd, options) {
    cmd = cmd.replace(/\s+/g, ' ');
    // console.log(cmd);
    const result = execSync(cmd, options);
    if (result) {
        return result.toString().trim();
    } else {
        return '';
    }
}

class OpenWhiskInvoker {
    constructor(actionName, action, wskProps, options) {
        this.actionName = actionName;
        this.action = action;
        this.wskProps = wskProps;

        this.kind = options.kind;
        this.image = options.image;
        this.debugPort = options.debugPort;
        this.debugCommand = options.debugCommand;
        this.verbose = options.verbose;

        this.containerName = `wskdebug-${this.action.name}-${Date.now()}`;
    }

    async start() {
        await this.startContainer();
        await this.init();
    }

    static async checkIfAvailable() {
        try {
            execute("docker info", {stdio: 'ignore'});
        } catch (e) {
            throw new Error("Docker not running on local system. A local docker environment is required for the debugger.")
        }
    }

    async startContainer() {
        const action = this.action;

        // precendence:
        // 1. arguments (this.image)
        // 2. action (action.exec.image)
        // 3. defaults (RUNTIMES[kind].image)

        const kind = this.kind || action.exec.kind;

        if (kind === "blackbox") {
            throw new Error("Action is of kind 'blackbox', must specify kind using `--kind` argument.");
        }
        const baseKind = kind.split(":")[0];

        const runtime = RUNTIMES[kind] || {};
        const image = this.image || action.exec.image || runtime.image;

        if (!image) {
            throw new Error(`Unknown kind: ${kind}. You might want to specify --image.`);
        }

        const debug = DEBUG[runtime.debug || baseKind] || {};
        debug.port = this.debugPort || debug.port;
        debug.command = this.debugCommand || debug.command;

        if (!debug.port) {
            throw new Error(`No debug port known for kind: ${kind}. Please specify --debug-port.`);
        }
        if (!debug.command) {
            throw new Error(`No debug command known for kind: ${kind}. Please specify --debug-command.`);
        }

        const memory = (action.limits.memory || OPENWHISK_DEFAULTS.memory) * 1024 * 1024;

        console.log(`Debug type: ${runtime.debug || baseKind}`);
        console.log(`Debug port: localhost:${debug.port}`)

        if (this.verbose) {
            console.log(`Starting local debug container ${this.name()}`);
        }

        execute(`
            docker run
                -d
                --name ${this.name()}
                --rm
                -m ${memory}
                -p ${RUNTIME_PORT}
                -p ${debug.port}:${debug.port}
                ${image}
                ${debug.command}
        `);

        this.containerRunning = true;
    }

    async init() {
        await fetch(`${this.url()}/init`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: {
                    binary: this.action.exec.binary,
                    main:   this.action.exec.main || "main",
                    code:   this.action.exec.code,
                }
            }),
            retries: this.timeout() / RETRY_DELAY_MS,
            retryDelay: RETRY_DELAY_MS
        });
    }

    async run(args, activationId) {
        const response = await fetch(`${this.url()}/run`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: args,

                api_host        : this.wskProps.apihost,
                api_key         : this.wskProps.api_key,
                namespace       : this.wskProps.namespace,
                action_name     : `/${this.wskProps.namespace}/${this.actionName}`,
                activation_id   : activationId,
                deadline        : `${Date.now() + this.timeout()}`,
                allow_concurrent: "true"
            })
        });

        return response.json();
    }

    async stop() {
        if (this.containerRunning) {
            if (this.verbose) {
                console.log("Stopping local debug container");
            }
            execute(`docker kill ${this.name()}`);
        }
    }

    name() {
        return this.containerName;
    }

    url() {
        if (!this.containerURL) {
            // ask docker for the exposed IP and port of the RUNTIME_PORT on the container
            const host = execute(`docker port ${this.name()} ${RUNTIME_PORT}`);
            this.containerURL = `http://${host}`;
        }
        return this.containerURL;
    }

    timeout() {
        return this.action.limits.timeout || OPENWHISK_DEFAULTS.timeout;
    }
}

module.exports = OpenWhiskInvoker;