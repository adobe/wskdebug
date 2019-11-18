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
const http = require('http');
const ngrok = require('ngrok');
const url = require('url');
const util = require('util');
const crypto = require("crypto");

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
        this.action = argv.action;

        this.wskProps = wskprops.get();
        if (argv.ignoreCerts) {
            this.wskProps.ignore_certs = true;
        }

        const watchPath = this.argv.sourcePath;
        if (watchPath) {
            // source path is always the path to watch
            // we only watch entire directories
            if (fs.lstatSync(watchPath).isFile()) {
                this.watchDir = path.dirname(watchPath);
            } else {
                this.watchDir = watchPath;
            }
        }
    }

    async start() {
        await this.setupWsk();

        // quick fail for missing requirements such as docker not running
        await OpenWhiskInvoker.checkIfAvailable();

        console.info(`Starting debugger for /${this.wskProps.namespace}/${this.action}`);

        // get the action
        const { action, agentAlreadyInstalled } = await this.getAction(this.action);

        // local debug container
        this.invoker = new OpenWhiskInvoker(this.action, action, this.argv, this.wskProps, this.wsk);

        try {
            // start live reload (if requested)
            await this.startSourceWatching();

            // start container & agent
            await this.invoker.start();

            // user can switch between agents (ngrok or not), hence we need to restore
            // (better would be to track the agent + its version and avoid a restore, but that's TBD)
            if (agentAlreadyInstalled) {
                await this.restoreAction(this.action);
            }

            await this.installAgent(this.action, action);

            if (this.argv.onStart) {
                console.log("On start:", this.argv.onStart);
                spawnSync(this.argv.onStart, {shell: true, stdio: "inherit"});
            }
            console.log();
            console.info(`Action     : ${this.action}`);
            this.invoker.logInfo();
            if (this.argv.condition) {
                console.info(`Condition  : ${this.argv.condition}`);
            }
            console.log();
            console.info(`Ready, waiting for activations`);
            console.info(`Use CTRL+C to exit`);

            this.ready = true;

        } catch (e) {
            await this.shutdown();
            throw e;
        }
    }

    async run() {
        return this.runPromise = this._run();
    }

    async _run() {
        try {
            this.running = true;

            // main blocking loop
            // abort if this.running is set to false
            // from here on, user can end debugger with ctrl+c
            while (this.running) {
                if (this.argv.ngrok) {
                    // agent: ngrok
                    // simply block, ngrokServer keeps running in background
                    await sleep(1000);

                } else {
                    // agent: concurrent
                    // agent: non-concurrent
                    // wait for activation, run it, complete, repeat
                    const activation = await this.waitForActivations(this.action);
                    if (!activation) {
                        this.running = false;
                        return;
                    }

                    const id = activation.$activationId;
                    delete activation.$activationId;

                    const startTime = Date.now();

                    // run this activation on the local docker container
                    // which will block if the actual debugger hits a breakpoint
                    const result = await this.invoker.run(activation, id);

                    const duration = Date.now() - startTime;

                    // pass on the local result to the agent in openwhisk
                    await this.completeActivation(this.action, id, result, duration);
                }
            }
        } finally {
            await this.shutdown();
        }
    }

    async stop() {
        this.running = false;
        if (this.runPromise) {
            // wait for the main loop to gracefully end, which will call shutdown()
            await this.runPromise;
        } else {
            // someone called stop() without run()
            await this.shutdown();
        }
    }

    async kill() {
        this.running = false;

        await this.shutdown();
    }

    async shutdown() {
        // only log this if we started properly
        if (this.ready) {
            console.log();
            console.log();
            console.log("Shutting down...");
        }

        // need to shutdown everything even if some fail, hence tryCatch() for each

        if (this.action) {
            await this.tryCatch(this.restoreAction(this.action));
        }
        await this.tryCatch(this.invoker.stop());

        if (this.liveReloadServer) {
            await this.tryCatch(() => {
                if (this.liveReloadServer.server) {
                    this.liveReloadServer.close();
                } else {
                    this.liveReloadServer.watcher.close();
                }
                this.liveReloadServer = null;
            });
        }

        if (this.ngrokServer) {
            await this.tryCatch(() => {
                this.ngrokServer.close();
                this.ngrokServer = null;
            });
        }
        await this.tryCatch(ngrok.kill());

        // only log this if we started properly
        if (this.ready) {
            console.log(`Done`);
        }
        this.ready = false;
    }

    // ------------------------------------------------< openwhisk utils >------------------

    async setupWsk() {
        if (!this.wsk) {
            this.wsk = openwhisk(this.wskProps);
            if (this.wskProps.namespace === undefined) {
                // there is a strict 1-1 bijection between auth and namespace, hence auth is enough.
                // while the openwhisk() client does not care about the namespace being set,
                // some code here in wskdebug relies on it to be set correctly.
                const namespaces = await this.wsk.namespaces.list();
                if (!namespaces || namespaces.length < 1) {
                    console.error("Error: Unknown namespace. Please specify as NAMESPACE in .wskprops.");
                    process.exit(2);
                }
                if (namespaces.length > 1) {
                    console.error("Error: OpenWhisk reports access to more than one namespace. Please specify the namespace to use as NAMESPACE in .wskprops.", namespaces);
                    process.exit(2);
                }
                this.wskProps.namespace = namespaces[0];
            }
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

    async actionExists(name) {
        try {
            await this.wsk.actions.get(name);
            return true;
        } catch (e) {
            return false;
        }
    }

    async deleteActionIfExists(name) {
        if (await this.actionExists(name)) {
            await this.wsk.actions.delete(name);
        }
    }

    // ------------------------------------------------< agent >------------------

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
                    console.warn("Agent was already installed, but backup is still present. All good.");

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

    async createHelperAction(actionName, file) {
        const nodejs8 = await this.openwhiskSupports("nodejs8");

        await this.wsk.actions.update({
            name: actionName,
            action: {
                exec: {
                    kind: nodejs8 ? "nodejs:default" : "blackbox",
                    image: nodejs8 ? undefined : "openwhisk/action-nodejs-v8",
                    code: fs.readFileSync(file, {encoding: 'utf8'})
                },
                limits: {
                    timeout: (this.argv.agentTimeout || 300) * 1000
                },
                annotations: [
                    { key: "description", value: `wskdebug agent helper. temporarily installed.` }
                ]
            }
        });
    }

    async installAgent(actionName, action) {
        this.agentInstalled = true;

        const agentDir = `${__dirname}/../agent`;
        let agentName;

        // choose the right agent implementation
        let code;
        if (this.argv.ngrok) {
            // user manually requested ngrok
            if (this.argv.verbose) {
                console.log("Setting up ngrok", this.argv.ngrokRegion ? `(region: ${this.argv.ngrokRegion})` : "");
            }

            // 1. start local server on random port
            this.ngrokServer = http.createServer(this.ngrokHandler.bind(this));
            // turn server.listen() into promise so we can await
            const listen = util.promisify( this.ngrokServer.listen.bind(this.ngrokServer) );
            await listen(0, '127.0.0.1');

            // 2. start ngrok tunnel connected to that port
            this.ngrokServerPort = this.ngrokServer.address().port;

            // create a unique authorization token that we check on our local instance later
            // this adds extra protection on top of the uniquely generated ngrok subdomain (e.g. a01ae275.ngrok.io)
            this.ngrokAuth = crypto.randomBytes(32).toString("hex");
            const ngrokUrl = await ngrok.connect({
                addr: this.ngrokServerPort,
                region: this.argv.ngrokRegion
            });

            // 3. pass on public ngrok url to agent
            action.parameters.push({
                key: "$ngrokUrl",
                value: url.parse(ngrokUrl).host
            });
            action.parameters.push({
                key: "$ngrokAuth",
                value: this.ngrokAuth
            });

            console.log(`Ngrok forwarding: ${ngrokUrl} => http://localhost:${this.ngrokServerPort} (auth: ${this.ngrokAuth})`);

            // agent using ngrok for forwarding
            agentName = "ngrok";
            code = fs.readFileSync(`${agentDir}/agent-ngrok.js`, {encoding: 'utf8'});

        } else {
            this.concurrency = await this.openwhiskSupports("concurrency");
            if (this.concurrency) {
                // normal fast agent using concurrent node.js actions
                agentName = "concurrency";
                code = fs.readFileSync(`${agentDir}/agent-concurrency.js`, {encoding: 'utf8'});

            } else {
                console.log("This OpenWhisk does not support action concurrency. Debugging will be a bit slower. Consider using '--ngrok' which might be a faster option.");

                agentName = "polling activation db";

                // this needs 2 helper actions in addition to the agent in place of the action
                await this.createHelperAction(`${actionName}_wskdebug_invoked`,   `${agentDir}/echo.js`)
                await this.createHelperAction(`${actionName}_wskdebug_completed`, `${agentDir}/echo.js`)

                code = fs.readFileSync(`${agentDir}/agent-activationdb.js`, {encoding: 'utf8'});
                // rewrite the code to pass config (we want to avoid fiddling with default params of the action)
                if (await this.openwhiskSupports("activationListFilterOnlyBasename")) {
                    code = code.replace("const activationListFilterOnlyBasename = false;", "const activationListFilterOnlyBasename = true;");
                }
            }
        }

        const backupName = this.getActionCopyName(actionName);

        if (this.argv.verbose) {
            console.log(`Installing agent in OpenWhisk (${agentName})...`);
        }

        // create copy
        await this.wsk.actions.update({
            name: backupName,
            action: action
        });

        if (this.argv.verbose) {
            console.log(`Original action backed up at ${backupName}.`);
        }

        // this is to support older openwhisks for which nodejs:default is less than version 8
        const nodejs8 = await this.openwhiskSupports("nodejs8");

        if (this.argv.condition) {
            action.parameters.push({
                key: "$condition",
                value: this.argv.condition
            });
        }

        // overwrite action with agent
        await this.wsk.actions.update({
            name: actionName,
            action: {
                exec: {
                    kind: nodejs8 ? "nodejs:default" : "blackbox",
                    image: nodejs8 ? undefined : "openwhisk/action-nodejs-v8",
                    code: code
                },
                limits: {
                    timeout: (this.argv.agentTimeout || 300) * 1000,
                    concurrency: this.concurrency ? 200: 1
                },
                annotations: [
                    ...action.annotations,
                    { key: "provide-api-key", value: true },
                    { key: "wskdebug", value: true },
                    { key: "description", value: `wskdebug agent. temporarily installed over original action. original action backup at ${backupName}.` }
                ],
                parameters: action.parameters
            }
        });

        if (this.argv.verbose) {
            console.log(`Agent installed.`);
        }
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

                // copy the backup (copy) to the regular action
                await this.wsk.actions.update({
                    name: actionName,
                    action: original
                });

                // remove the backup
                await this.wsk.actions.delete(copy);

                // remove any helpers if they exist
                await this.deleteActionIfExists(`${actionName}_wskdebug_invoked`);
                await this.deleteActionIfExists(`${actionName}_wskdebug_completed`);

            } catch (e) {
                console.error("Error while restoring original action:", e);
            }
        }
    }

    // ------------------------------------------------< ngrok >------------------

    // local http server retrieving forwards from the ngrok agent, running them
    // as a blocking local invocation and then returning the activation result back
    ngrokHandler(req, res) {
        // check authorization against our unique token
        const authHeader = req.headers.authorization;
        if (authHeader !== this.ngrokAuth) {
            res.statusCode = 401;
            res.end();
            return;
        }

        if (req.method === 'POST') {
            // agent POSTs arguments as json body
            let body = '';
            // collect full request body first
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const params = JSON.parse(body);
                    const id = params.$activationId;
                    delete params.$activationId;

                    if (this.argv.verbose) {
                        console.log();
                        console.info(`Activation: ${id}`);
                        console.log(params);
                    } else {
                        console.info(`Activation: ${id}`);
                    }

                    const startTime = Date.now();

                    const result = await this.invoker.run(params, id);

                    const duration = Date.now() - startTime;
                    console.info(`Completed activation ${id} in ${duration/1000.0} sec`);
                    if (this.argv.verbose) {
                        console.log(result);
                    }

                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(result));

                } catch (e) {
                    console.error(e);
                    res.statusCode = 400;
                    res.end();
                }
            });
        } else {
            res.statusCode = 404;
            res.end();
        }
    }

    // ------------------------------------------------< polling >------------------

    async waitForActivations(actionName) {
        this.activationsSeen = this.activationsSeen || {};

        // secondary loop to get next activation
        // the $waitForActivation agent activation will block, but only until
        // it times out, hence we need to retry when it fails
        while (this.running) {
            if (this.argv.verbose) {
                process.stdout.write(".");
            }
            try {
                let activation;
                if (this.concurrency) {
                    // invoke - blocking for up to 1 minute
                    activation = await this.wsk.actions.invoke({
                        name: actionName,
                        params: {
                            $waitForActivation: true
                        },
                        blocking: true
                    });

                } else {
                    // poll for the newest activation
                    const since = Date.now();

                    // older openwhisk only allows the name of an action when filtering activations
                    // newer openwhisk versions want package/name
                    let name = actionName;
                    if (await this.openwhiskSupports("activationListFilterOnlyBasename")) {
                        if (actionName.includes("/")) {
                            name = actionName.substring(actionName.lastIndexOf("/") + 1);
                        }
                    }

                    while (true) {
                        if (this.argv.verbose) {
                            process.stdout.write(".");
                        }

                        const activations = await this.wsk.activations.list({
                            name: `${name}_wskdebug_invoked`,
                            since: since,
                            limit: 1, // get the most recent one only
                            docs: true // include results
                        });

                        if (activations && activations.length >= 1) {
                            const a = activations[0];
                            if (a.response && a.response.result && !this.activationsSeen[a.activationId]) {
                                activation = a;
                                break;
                            }
                        }

                        // need to limit load on openwhisk (activation list)
                        await sleep(1000);
                    }
                }

                // check for successful response with a new activation
                if (activation && activation.response) {
                    const params = activation.response.result;

                    // mark this as seen so we don't reinvoke it
                    this.activationsSeen[activation.activationId] = true;

                    if (this.argv.verbose) {
                        console.log();
                        console.info(`Activation: ${params.$activationId}`);
                        console.log(params);
                    } else {
                        console.info(`Activation: ${params.$activationId}`);
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
                // look for special error codes from agent
                const errorCode = this.getActivationError(e).code;
                // 42 => retry
                if (errorCode === 42) {
                    // do nothing
                } else if (errorCode === 43) {
                    // 43 => graceful shutdown (for unit tests)
                    console.log("Graceful shutdown requested by agent (only for unit tests)");
                    return null;
                } else {
                    // otherwise log error and abort
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
        console.info(`Completed activation ${activationId} in ${duration/1000.0} sec`);
        if (this.argv.verbose) {
            console.log(result);
        }

        try {
            result.$activationId = activationId;
            await this.wsk.actions.invoke({
                name: this.concurrency ? actionName : `${actionName}_wskdebug_completed`,
                params: result,
                blocking: true
            });
        } catch (e) {
            // look for special error codes from agent
            const errorCode = this.getActivationError(e).code;
            // 42 => retry
            if (errorCode === 42) {
                // do nothing
            } else if (errorCode === 43) {
                // 43 => graceful shutdown (for unit tests)
                console.log("Graceful shutdown requested by agent (only for unit tests)");
                this.running = false;
            } else {
                console.error("Unexpected error while completing activation:", e);
            }
        }
    }

    // ----------------------------------------< openwhisk feature detection >-----------------

    async getOpenWhiskVersion() {
        if (this.openwhiskVersion === undefined) {
            try {
                const json = await this.wsk.actions.client.request("GET", "/api/v1");
                if (json && typeof json.build === "string") {
                    this.openwhiskVersion = json.build;
                } else {
                    this.openwhiskVersion = null;
                }
            } catch (e) {
                console.warn("Could not retrieve OpenWhisk version:", e.message);
                this.openwhiskVersion = null;
            }
        }
        return this.openwhiskVersion;
    }

    async openwhiskSupports(feature) {
        const FEATURES = {
            // guesstimated
            activationListFilterOnlyBasename: v => v.startsWith("2018") || v.startsWith("2017"),
            // hack
            nodejs8: v => !v.startsWith("2018") && !v.startsWith("2017"),
            concurrency: async (_, wsk) => {
                // check swagger api docs instead of version to see if concurrency is supported
                try {
                    const swagger = await wsk.actions.client.request("GET", "/api/v1/api-docs");

                    if (swagger && swagger.definitions && swagger.definitions.ActionLimits && swagger.definitions.ActionLimits.properties) {
                        return swagger.definitions.ActionLimits.properties.concurrency;
                    }
                } catch (e) {
                    console.warn('Could not read /api/v1/api-docs, setting max action concurrency to 1')
                    return false;
                }
            }
        };
        const checker = FEATURES[feature];
        if (checker) {
            return checker(await this.getOpenWhiskVersion(), this.wsk);
        } else {
            throw new Error("Unknown feature " + feature);
        }
    }

    // ------------------------------------------------< source watching >-----------------

    async startSourceWatching() {
        if (this.watchDir &&
            // each of these triggers listening
            (   this.argv.livereload
             || this.argv.onBuild
             || this.argv.onChange
             || this.argv.invokeParams
             || this.argv.invokeAction )
        ) {

            // run build initially
            if (this.argv.onBuild) {
                console.info("=> Build:", this.argv.onBuild);
                spawnSync(this.argv.onBuild, {shell: true, stdio: "inherit"});
            }

            this.liveReloadServer = livereload.createServer({
                port: this.argv.livereloadPort,
                noListen: !this.argv.livereload,
                exclusions: [this.argv.buildPath],
                // TODO: we might need a cli arg to extend this. unfortunately wildcards don't work
                //       for now it's just a list of all standard openwhisk supported languages
                extraExts: ["json", "go", "java", "scala", "php", "py", "rb", "swift", "rs", "cs", "bal"]
            });
            this.liveReloadServer.watch(this.watchDir);

            // overwrite function to get notified on changes
            const refresh = this.liveReloadServer.refresh;
            const argv = this.argv;
            const wsk = this.wsk;
            this.liveReloadServer.refresh = function(filepath) {
                try {
                    let result = [];
                    // call original function if we are listening
                    if (argv.livereload) {
                        result = refresh.call(this, filepath);
                    }

                    // run build command before invoke triggers below
                    if (argv.onBuild) {
                        console.info("=> Build:", argv.onBuild);
                        spawnSync(argv.onBuild, {shell: true, stdio: "inherit"});
                    }

                    // run shell command
                    if (argv.onChange) {
                        console.info("=> Run:", argv.onChange);
                        spawnSync(argv.onChange, {shell: true, stdio: "inherit"});
                    }

                    // action invoke
                    if (argv.invokeParams || argv.invokeAction) {
                        let json = {};
                        if (argv.invokeParams) {
                            if (argv.invokeParams.trim().startsWith("{")) {
                                json = JSON.parse(argv.invokeParams);
                            } else {
                                json = JSON.parse(fs.readFileSync(argv.invokeParams, {encoding: 'utf8'}));
                            }
                        }
                        const action = argv.invokeAction || argv.action;
                        wsk.actions.invoke({
                            name: action,
                            params: json
                        }).then(response => {
                            console.info(`=> Invoked action ${action} with params ${argv.invokeParams}: ${response.activationId}`);
                        }).catch(err => {
                            console.error("Error invoking action:", err);
                        });
                    }

                    return result;
                } catch (e) {
                    console.error(e);
                }
            };

            if (this.argv.livereload) {
                console.info(`LiveReload enabled for ${this.watchDir} on port ${this.liveReloadServer.config.port}`);
            }
        }
    }

    // ------------------------------------------------< utils >-----------------

    async tryCatch(task, message="Error during shutdown:") {
        try {
            if (typeof task === "function") {
                task();
            } else {
                await task;
            }
        } catch (e) {
            console.log(e);
            if (this.argv.verbose) {
                console.error(message);
                console.error(e);
            } else {
                console.error(message, e.message);
            }
        }
    }

}

module.exports = Debugger;