#!/usr/bin/env node

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

const yargs = require("yargs");
const Debugger = require("./src/debugger");
const path = require("path");

const consoleError = console.error;
console.error = (...args) => {
    consoleError(...args.map(a => `\x1b[31m${a}\x1b[0m`) );
}

yargs
.help()
.alias("h", "help")
.showHelpOnFail(true)
.updateStrings({
    'Positionals:': 'Arguments:',
    'Not enough non-option arguments: got %s, need at least %s': "Error: Missing argument <action> (%s/%s)"
})
.version(false)
.command(
    "* <action> [source-path]",
    `Apache OpenWhisk Debugger

    Debug OpenWhisk actions using local docker containers as runtimes. If only
    <action> is specified, the debugger will use the deployed action code.

    Use [source-path] to point to a local file or folder containing the action
    sources. The debugger will dynamically mount these on the action runtime and
    automatically reload the code on each new activation. Configure the IDE debug
    configuration with this as the source path.

    Please note that [source-path] is currently only supported for Node JS actions
    with a kind "nodejs:*".`,
    yargs => {
        yargs.positional('action', {
            describe: 'Name of action to debug. Required.',
            type: 'string'
        });
        yargs.positional('source-path', {
            describe: 'Path to local action sources, folder or file.',
            type: 'string',
            coerce: path.resolve // ensure absolute path
        });

        yargs.option("m", {
            alias: "main",
            type: "string",
            describe: "Name of action entry point."
        });
        yargs.option("k", {
            alias: "kind",
            type: "string",
            describe: "Action kind override. Needed for blackbox images."
        });
        yargs.option("i", {
            alias: "image",
            type: "string",
            describe: "Docker image to use as action runtime."
        });
        yargs.option("P", {
            alias: "debug-port",
            type: "number",
            describe: "Advanced: Debug port to expose on action runtime."
        });
        yargs.option("C", {
            alias: "debug-command",
            type: "string",
            describe: "Advanced: Debug-enabling command for the runtime."
        });
        yargs.option("t", {
            alias: "agent-timeout",
            type: "number",
            describe: "Advanced: Debugging agent timeout in seconds. Set to maximum available OpenWhisk system. Defaults to 5 min."
        });
        yargs.option("v", {
            alias: "verbose",
            type: "boolean",
            describe: "Verbose output"
        });
        yargs.version();
    },
    async argv => {
        // console.log(argv);

        try {
            await new Debugger(argv).run();
        } catch (e) {
            console.log();
            if (argv.verbose) {
                console.error(e);
            } else {
                console.error("Error:", e.message);
            }
            yargs.exit(1);
        }
    }
)
.parse(process.argv.slice(2), {}, (_, __, output) => {
    if (output) {
        // Remove types (e.g. [string], [boolean]) from the output
        output = output.replace(/\[\w+\]/g, '');

        // Show the modified output
        console.log(output);
    }
});