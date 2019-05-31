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
const fs = require('fs-extra');
const OpenWhiskInvoker = require('./invoker');

async function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

class Debugger {
    constructor(argv) {
        this.argv = argv;

        this.wskProps = wskprops.get();
        if (argv.ignoreCerts) {
            this.wskProps.ignore_certs = true;
        }

        this.wsk = openwhisk(this.wskProps);
    }

    getActionCopyName(name) {
        return `${name}_wskdebug_original`;
    }

    async run() {
        // quick fail for missing requirements such as docker not running
        await OpenWhiskInvoker.checkIfAvailable();

        // get the action
        const actionName = this.argv.action;
        const action = await this.getAction(actionName);

        // local debug container
        this.invoker = new OpenWhiskInvoker(actionName, action, this.wskProps, this.argv);

        this.registerExitHandler(actionName);

        try {
            // start container & agent
            await this.invoker.start();
            await this.installAgent(actionName, action);

            console.log(`Ready, waiting for activations of ${actionName}`);
            console.log(`Use CTRL+C to exit`);

            this.ready = true;

            // main blocking loop - end debugger with ctrl+c
            while (true) {
                const activation = await this.waitForActivations(actionName);

                const id = activation.$activationId;
                delete activation.$activationId;

                // run this activation on the local docker container
                // which will block if the actual debugger hits a breakpoint
                const result = await this.invoker.run(activation, id);

                // pass on the local result to the agent in openwhisk
                await this.completeActivation(actionName, id, result);
            }
        } finally {
            await this.onExit(actionName);
        }
    }

    async getAction(actionName) {
        try {
            return await this.wsk.actions.get(actionName);

        } catch (e) {
            if (e.statusCode === 404) {
                throw new Error(`Action not found: ${actionName}`);
            } else {
                throw e;
            }
        }
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

        // create copy
        await this.wsk.actions.update({
            name: backupName,
            action: action
        });

        if (this.argv.verbose) {
            console.log(`Installing agent in OpenWhisk. Original action backed up at ${backupName}.`);
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
                annotations: [...action.annotations, { key: "description", value: `wskdebug agent. temporarily installed over original action. original action backup at ${backupName}.` }],
                parameters: action.parameters
            }
        });

        this.agentInstalled = true;
    }

    registerExitHandler(actionName) {
        // ensure we remove the agent when this app gets terminated
        ['SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, async () => {
                await this.onExit(actionName);
                process.exit();
            });
        });
    }

    async onExit(actionName) {
        try {
            // concurrently clean up, slightly faster
            await Promise.all([
                this.abortPendingActivations(actionName),
                this.restoreAction(actionName),
                this.invoker.stop()
            ])

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
            console.log();
            process.stdout.write("Shutting down...");
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
                const activation = await this.wsk.actions.invoke({
                    name: actionName,
                    params: {
                        $waitForActivation: true
                    },
                    blocking: true
                });
                if (activation && activation.response) {
                    const params = activation.response.result;
                    if (this.argv.verbose) {
                        console.log();
                        console.log(`Activation: ${params.$activationId}`);
                        console.log(params);
                    } else {
                        process.stdout.write(`Activation: ${params.$activationId}...`);
                    }
                    return params;
                } else {
                    console.log("Incomplete activation (no response.result):", activation);
                }

            } catch(e) {
                if (this.getActivationError(e).code !== 42) {
                    console.error();
                    console.error("Unexpected error while polling agent for activation:");
                    console.dir(e, { depth: null });
                    throw new Error("Unexpected error while polling agent for activation.");
                }
            }

            // some small wait to avoid too many requests in case things run amok
            await sleep(1000);
        }
    }

    getActivationError(e) {
        if (e.error && e.error.response && e.error.response.result && e.error.response.result.error) {
            return e.error.response.result.error;
        }
        return {};
    }

    async completeActivation(actionName, activationId, result) {
        if (this.argv.verbose) {
            console.log();
            console.log(`Completed activation: ${activationId}`);
            console.log(result);
        } else {
            console.log(" completed.");
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
}

module.exports = Debugger;