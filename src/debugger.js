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

const openwhisk = require("openwhisk");
const wskprops = require('./wskprops');
const path = require('path');
const fs = require('fs-extra');
const OpenWhiskInvoker = require('./invoker');
const { spawnSync } = require('child_process');
const livereload = require('livereload');

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

function getAnnotation(action, key) {
    const a = action.annotations.find(a => a.key === key);
    if (a) {
        return a.value;
    }
}

class Debugger {
    constructor(argv) {
        this.argv = argv;

        this.wskProps = wskprops.get();
        if (argv.ignoreCerts) {
            this.wskProps.ignore_certs = true;
        }

        this.wsk = openwhisk(this.wskProps);

        const srcPath = this.argv.sourcePath;
        if (fs.lstatSync(srcPath).isFile()) {
            this.argv.sourceDir = path.dirname(srcPath);
            this.argv.sourceFile = path.basename(srcPath);
        } else {
            this.argv.sourceDir = srcPath;
            this.argv.sourceFile = "";
        }
}

    async run() {
        // quick fail for missing requirements such as docker not running
        await OpenWhiskInvoker.checkIfAvailable();

        const actionName = this.argv.action;
        console.log(`Starting debugger for /${this.wskProps.namespace}/${actionName}`);

        // get the action
        const { action, agentAlreadyInstalled } = await this.getAction(actionName);

        // local debug container
        this.invoker = new OpenWhiskInvoker(actionName, action, this.wskProps, this.argv);

        this.registerExitHandler(actionName);

        try {
            // start live reload
            if (this.argv.liveReload && this.argv.sourceDir) {
                await this.startLiveReload();
            }

            // start container & agent
            await this.invoker.start();
            if (!agentAlreadyInstalled) {
                await this.installAgent(actionName, action);
            }

            if (this.argv.onStart) {
                console.log("On start:", this.argv.onStart);
                spawnSync(this.argv.onStart, {shell: true, stdio: "inherit"});
            }
            console.log();
            console.log(`Action     : ${actionName}`);
            this.invoker.logInfo();
            console.log();
            console.log(`Ready, waiting for activations`);
            console.log(`Use CTRL+C to exit`);

            this.ready = true;

            // main blocking loop - end debugger with ctrl+c
            while (true) {
                const activation = await this.waitForActivations(actionName);

                const id = activation.$activationId;
                delete activation.$activationId;

                const startTime = Date.now();

                // run this activation on the local docker container
                // which will block if the actual debugger hits a breakpoint
                const result = await this.invoker.run(activation, id);

                const duration = Date.now() - startTime;

                // pass on the local result to the agent in openwhisk
                await this.completeActivation(actionName, id, result, duration);
            }
        } finally {
            await this.onExit(actionName);
        }
    }

    async getWskAction(actionName) {
        try {
            return await this.wsk.actions.get(actionName);
        } catch (e) {
            if (e.statusCode === 404) {
                return null;
            } else {
                throw e;
            }
        }
    }

    getActionCopyName(name) {
        return `${name}_wskdebug_original`;
    }

    isAgent(action) {
        return getAnnotation(action, "wskdebug") ||
               (getAnnotation(action, "description") || "").startsWith("wskdebug agent.");
    }

    async getAction(actionName) {
        let action = await this.getWskAction(actionName);
        if (action === null) {
            throw new Error(`Action not found: ${actionName}`);
        }

        let agentAlreadyInstalled = false;

        // check if this actoin needs to
        if (this.isAgent(action)) {
            // ups, action is our agent, not the original
            // happens if a previous wskdebug was killed and could not restore before it exited
            const backupName = this.getActionCopyName(actionName);

            // check the backup action
            try {
                const backup = await this.wsk.actions.get(backupName);

                if (this.isAgent(backup)) {
                    // backup is also an agent (should not happen)
                    // backup is useless, delete it
                    // await this.wsk.actions.delete(backupName);
                    throw new Error(`Dang! Agent is already installed and action backup is broken (${backupName}).\n\nPlease redeploy your action first before running wskdebug again.`);

                } else {
                    console.log("Agent was already installed, but backup is still present. All good.");

                    // need to look at the original action
                    action = backup;
                    agentAlreadyInstalled = true;
                    this.agentInstalled = true;
                }

            } catch (e) {
                if (e.statusCode === 404) {
                    // backup missing
                    throw new Error(`Dang! Agent is already installed and action backup is gone (${backupName}).\n\nPlease redeploy your action first before running wskdebug again.`);

                } else {
                    // other error
                    throw e;
                }
            }
        }
        return {action, agentAlreadyInstalled };
    }

    async installAgent(actionName, action) {
        let agentName = "agent";
        const concurrency = await this.supportsConcurrency();
        if (!concurrency) {
            console.log("This OpenWhisk system does not seem to support action concurrency. Debugging will be a bit slower.");
            agentName = "agent-no-concurrency";

            throw new Error("Non-concurrent agent not implemented yet.");
        }

        const backupName = this.getActionCopyName(actionName);

        if (this.argv.verbose) {
            console.log(`Installing agent in OpenWhisk`);
        }

        // create copy
        await this.wsk.actions.update({
            name: backupName,
            action: action
        });

        if (this.argv.verbose) {
            console.log(`Original action backed up at ${backupName}.`);
        }

        // overwrite action with agent
        await this.wsk.actions.update({
            name: actionName,
            action: {
                exec: {
                    // using the concurrency detection here is not quite correct
                    // but it works for now to separate between I/O Runtime and IT cloud openwhisk
                    kind: concurrency ? "nodejs:default" : "blackbox",
                    image: concurrency ? undefined : "openwhisk/action-nodejs-v8",
                    code: fs.readFileSync(`${__dirname}/../agent/${agentName}.js`, {encoding: 'utf8'})
                },
                limits: {
                    timeout: (this.argv.agentTimeout || 300) * 1000,
                    concurrency: 200
                },
                annotations: [
                    ...action.annotations,
                    { key: "wskdebug", value: true },
                    { key: "description", value: `wskdebug agent. temporarily installed over original action. original action backup at ${backupName}.` }
                ],
                parameters: action.parameters
            }
        });

        if (this.argv.verbose) {
            console.log(`Agent installed.`);
        }
        this.agentInstalled = true;
    }

    registerExitHandler(actionName) {
        // ensure we remove the agent when this app gets terminated
        ['SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, async () => {
                console.log();
                console.log();
                process.stdout.write("Shutting down...");

                await this.onExit(actionName);

                process.exit();
            });
        });
    }

    async onExit(actionName) {
        try {
            await this.abortPendingActivations(actionName);
            await this.restoreAction(actionName);
            await this.invoker.stop();

            // only log this if we started properly
            if (this.ready) {
                console.log(`Done`);
            }
        } catch (e) {
            if (this.argv.verbose) {
                console.error("Error while terminating:");
                console.error(e);
            } else {
                console.error("Error while terminating:", e.message);
            }
        }
    }

    async abortPendingActivations(/*actionName*/) {
        // TODO: tell agent to abort, new command $abortActivations
    }

    async restoreAction(actionName) {
        if (this.agentInstalled) {
            if (this.argv.verbose) {
                console.log();
                console.log(`Restoring action`);
            }

            const copy = this.getActionCopyName(actionName);

            try {
                const original = await this.wsk.actions.get(copy);

                await this.wsk.actions.update({
                    name: actionName,
                    action: original
                });

                await this.wsk.actions.delete(copy);

            } catch (e) {
                console.error("Error while restoring original action:", e);
            }
        }
    }

    async waitForActivations(actionName) {
        // secondary loop to get next activation
        // the $waitForActivation agent activation will block, but only until
        // it times out, hence we need to retry when it fails
        while (true) {
            if (this.argv.verbose) {
                process.stdout.write(".");
            }
            try {
                // invoke - blocking for up to 1 minute
                const activation = await this.wsk.actions.invoke({
                    name: actionName,
                    params: {
                        $waitForActivation: true
                    },
                    blocking: true
                });

                // check for successful response with a new activation
                if (activation && activation.response) {
                    const params = activation.response.result;
                    if (this.argv.verbose) {
                        console.log();
                        console.log(`Activation: ${params.$activationId}`);
                        console.log(params);
                    } else {
                        console.log(`Activation: ${params.$activationId}`);
                    }
                    return params;

                } else if (activation && activation.activationId) {
                    // ignore this and retry.
                    // usually means the action did not respond within one second,
                    // which in turn is unlikely for the agent who should exit itself
                    // after 50 seconds, so can only happen if there was some delay
                    // outside the action itself

                } else {
                    // unexpected, just log and retry
                    console.log("Unexpected empty response while waiting for new activations:", activation);
                }

            } catch(e) {
                // special error code 42 from agent=> retry
                // otherwise log error and abort
                if (this.getActivationError(e).code !== 42) {
                    console.error();
                    console.error("Unexpected error while polling agent for activation:");
                    console.dir(e, { depth: null });
                    throw new Error("Unexpected error while polling agent for activation.");
                }
            }

            // some small wait to avoid too many requests in case things run amok
            await sleep(100);
        }
    }

    getActivationError(e) {
        if (e.error && e.error.response && e.error.response.result && e.error.response.result.error) {
            return e.error.response.result.error;
        }
        return {};
    }

    async completeActivation(actionName, activationId, result, duration) {
        console.log(`Completed activation ${activationId} in ${duration/1000.0} sec:`);
        if (this.argv.verbose) {
            console.log(result);
        }

        result.$activationId = activationId;
        await this.wsk.actions.invoke({
            name: actionName,
            params: result,
            blocking: true
        });
    }

    async supportsConcurrency() {
        // check swagger api docs to see if concurrency is supported
        try {
            const swagger = await this.wsk.actions.client.request("GET", "/api/v1/api-docs");

            if (swagger && swagger.definitions && swagger.definitions.ActionLimits && swagger.definitions.ActionLimits.properties) {
                return swagger.definitions.ActionLimits.properties.concurrency;
            }
        } catch (e) {
            return false;
        }
    }

    async startLiveReload() {
        const liveReloadServer = livereload.createServer();
        liveReloadServer.watch(this.argv.sourceDir);

        if (this.argv.onReload) {
            const reloadCmd = this.argv.onReload;

            // overwrite function to get notified on changes
            const refresh = liveReloadServer.refresh;
            liveReloadServer.refresh = function(filepath) {
                try {
                    // call original function
                    const result = refresh.call(this, filepath);

                    console.log("On reload:", reloadCmd);
                    spawnSync(reloadCmd, {shell: true, stdio: "inherit"});

                    return result;
                } catch (e) {
                    console.error(e);
                }
            };
        }

        console.log("LiveReload enabled on", this.argv.sourceDir);
    }
}

module.exports = Debugger;