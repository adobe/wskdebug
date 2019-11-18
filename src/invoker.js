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

const { spawn, execSync } = require('child_process');
const fetch = require('fetch-retry');
const kinds = require('./kinds/kinds');
const path = require('path');
const fs = require('fs-extra');

const RUNTIME_PORT = 8080;
const INIT_RETRY_DELAY_MS = 100;

// https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#system-limits
const OPENWHISK_DEFAULTS = {
    timeout: 60*1000,
    memory: 256
}

function execute(cmd, options, verbose) {
    cmd = cmd.replace(/\s+/g, ' ');
    if (verbose) {
        console.log(cmd);
    }
    const result = execSync(cmd, options);
    if (result) {
        return result.toString().trim();
    } else {
        return '';
    }
}

// if value is a function, invoke it with args, otherwise return it as object
// if value is undefined, will return undefined
function resolveValue(value, ...args) {
    if (typeof value === "function") {
        return value(...args);
    } else {
        return value;
    }
}

function splitPath (fullPath) {
  let fileName = ''
  let dirPath = ''
  if (fs.lstatSync(fullPath).isFile()) {
    dirPath = path.dirname(fullPath);
    fileName = path.basename(fullPath);
  } else {
    dirPath = fullPath
  }
  return [dirPath, fileName]
}

class OpenWhiskInvoker {
    constructor(actionName, action, options, wskProps, wsk) {
        this.actionName = actionName;
        this.action = action;

        this.kind = options.kind;
        this.image = options.image;
        this.port = options.port;
        this.internalPort = options.internalPort;
        this.command = options.command;
        this.dockerArgs = options.dockerArgs;
        this.verbose = options.verbose;

        // the build path can be separate, if not, same as the source/watch path
        this.sourcePath = options.buildPath || options.sourcePath;
        this.hasBuildPath = Boolean(options.buildPath);
        this.buildPathRoot = options.buildPathRoot;

        if (this.sourcePath && !this.hasBuildPath) {
          [this.sourceDir, this.sourceFile] = splitPath(this.sourcePath)
          this.sourceRoot = process.cwd()
        } else {
          this.sourceDir = ""
          this.sourceFile = ""
          this.sourceRoot = ""
        }

        this.main = options.main;

        this.wskProps = wskProps;
        this.wsk = wsk;

        this.containerName = this.asContainerName(`wskdebug-${this.action.name}-${Date.now()}`);
    }

    static async checkIfAvailable() {
        try {
            execute("docker info", {stdio: 'ignore'});
        } catch (e) {
            throw new Error("Docker not running on local system. A local docker environment is required for the debugger.")
        }
    }

    async getImageForKind(kind) {
        try {
            const owSystemInfo = await this.wsk.actions.client.request("GET", "/");
            if (owSystemInfo.runtimes) {
                // transform result into a nice dictionary kind => image
                const runtimes = {};
                for (const set of Object.values(owSystemInfo.runtimes)) {
                    for (const entry of set) {
                        let image = entry.image;
                        // fix for Adobe I/O Runtime reporting incorrect image prefixes
                        image = image.replace("bladerunner/", "adobeapiplatform/");
                        runtimes[entry.kind] = image;
                    }
                }
                return runtimes[kind];

            } else if (this.verbose) {
                console.warn("Could not retrieve runtime images from OpenWhisk, using default image list.");
            }

        } catch (e) {
            if (this.verbose) {
                console.warn("Could not retrieve runtime images from OpenWhisk, using default image list.", e.message);
            }
        }
        return kinds.images[kind];
    }

    async startContainer() {
        const action = this.action;

        // this must run after initial build was kicked off in Debugger.startSourceWatching()
        // so that built files are present
        if (this.sourcePath && this.hasBuildPath) {
          [this.sourceDir, this.sourceFile] = splitPath(this.sourcePath)
          this.sourceRoot = this.buildPathRoot || this.sourceDir
        }

        // kind and image

        // precendence:
        // 1. arguments (this.image)
        // 2. action (action.exec.image)
        // 3. defaults (kinds.images[kind])

        const kind = this.kind || action.exec.kind;

        if (kind === "blackbox") {
            throw new Error("Action is of kind 'blackbox', must specify kind using `--kind` argument.");
        }

        // const runtime = kinds[kind] || {};
        this.image = this.image || action.exec.image || await this.getImageForKind(kind);

        if (!this.image) {
            throw new Error(`Unknown kind: ${kind}. You might want to specify --image.`);
        }

        // debugging instructions
        this.debugKind = kinds.debugKinds[kind] || kind.split(":")[0];
        try {
            this.debug = require(`${__dirname}/kinds/${this.debugKind}/${this.debugKind}`);
        } catch (e) {
            if (this.verbose) {
                console.error(`Cannot find debug info for kind ${this.debugKind}:`, e.message);
            }
            this.debug = {};
        }

        this.debug.internalPort = this.internalPort                      || resolveValue(this.debug.port, this);
        this.debug.port         = this.port         || this.internalPort || resolveValue(this.debug.port, this);

        // ------------------------

        this.debug.command = this.command || resolveValue(this.debug.command, this);

        if (!this.debug.port) {
            throw new Error(`No debug port known for kind: ${kind}. Please specify --port.`);
        }
        if (!this.debug.internalPort) {
            throw new Error(`No debug port known for kind: ${kind}. Please specify --internal-port.`);
        }
        if (!this.debug.command) {
            throw new Error(`No debug command known for kind: ${kind}. Please specify --command.`);
        }

        // limits
        const memory = (action.limits.memory || OPENWHISK_DEFAULTS.memory) * 1024 * 1024;

        // source mounting
        if (this.sourcePath) {
            if (!this.debug.mountAction) {
                console.warn(`Warning: Sorry, mounting sources not yet supported for: ${kind}.`);
                this.sourcePath = undefined;
            }
        }

        const dockerArgsFromKind = resolveValue(this.debug.dockerArgs, this) || "";
        const dockerArgsFromUser = this.dockerArgs || "";

        let showDockerRunOutput = this.verbose;

        try {
            execute(`docker inspect --type=image ${this.image} 2> /dev/null`);
        } catch (e) {
            // make sure the user can see the image download process as part of docker run
            showDockerRunOutput = true;
            console.log(`
+------------------------------------------------------------------------------------------+
| Docker image must be downloaded: ${this.image}
|                                                                                          |
| Note: If you debug in VS Code and it fails with "Cannot connect to runtime process"      |
| due to a timeout, run this command once:                                                 |
|                                                                                          |
|     docker pull ${this.image}
|                                                                                          |
| Alternatively set a higher 'timeout' in the launch configuration, such as 60000 (1 min). |
+------------------------------------------------------------------------------------------+
`)
        }

        if (this.verbose) {
            console.log(`Starting local debug container ${this.name()}`);
        }

        execute(
            `docker run
                -d
                --name ${this.name()}
                --rm
                -m ${memory}
                -p ${RUNTIME_PORT}
                -p ${this.debug.port}:${this.debug.internalPort}
                ${dockerArgsFromKind}
                ${dockerArgsFromUser}
                ${this.image}
                ${this.debug.command}
            `,
            // live stream view for docker image download output
            { stdio: showDockerRunOutput ? "inherit" : null },
            this.verbose
        );

        this.containerRunning = true;

        spawn("docker", ["logs", "-t", "-f", this.name()], {
            stdio: [
                "inherit", // stdin
                global.mochaLogFile || "inherit", // stdout
                global.mochaLogFile || "inherit"  // stderr
            ]
        });
    }

    async logInfo() {
        if (this.sourcePath) {
            console.info(`Sources    : ${this.sourcePath}`);
        }
        console.info(`Image      : ${this.image}`);
        console.info(`Debug type : ${this.debugKind}`);
        console.info(`Debug port : localhost:${this.debug.port}`)
    }

    async init(actionWithCode) {
        let action;
        if (this.sourcePath && this.debug.mountAction) {
            action = resolveValue(this.debug.mountAction, this);

            if (this.verbose) {
                console.log(`Mounting sources onto local debug container: ${this.sourcePath}`);
            }
        } else {
            if (this.verbose) {
                console.log(`Pushing action code to local debug container: ${this.action.name}`);
            }
            action = {
                binary: actionWithCode.exec.binary,
                main:   actionWithCode.exec.main || "main",
                code:   actionWithCode.exec.code,
            };
        }

        const response = await fetch(`${this.url()}/init`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: action
            }),
            retries: this.timeout() / INIT_RETRY_DELAY_MS,
            retryDelay: INIT_RETRY_DELAY_MS
        });

        if (response.status === 502) {
            const body = await response.json();
            throw new Error("Could not initialize action code on local debug container:\n\n" + body.error);
        }
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

    asContainerName(name) {
        // docker container names are restricted to [a-zA-Z0-9][a-zA-Z0-9_.-]*

        // 1. replace special characters with dash
        name = name.replace(/[^a-zA-Z0-9_.-]+/g, '-');
        // 2. leading character is more limited
        name = name.replace(/^[^a-zA-Z0-9]+/g, '');
        // 3. (nice to have) remove trailing special chars
        name = name.replace(/[^a-zA-Z0-9]+$/g, '');

        return name;
    }
}

module.exports = OpenWhiskInvoker;