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
const fs = require("fs");

const consoleError = console.error;
console.error = (...args) => {
    consoleError(...args.map(a => `\x1b[31m${a}\x1b[0m`) );
}

function getSupportedKinds() {
    const kinds = [];
    const basePath = path.resolve(__dirname, "src/kinds");
    // console.log("listing children of", basePath);
    fs.readdirSync(basePath).forEach(function(entry) {
        const p = path.resolve(basePath, entry);
        if (fs.statSync(p).isDirectory()) {
            // console.log("-", entry);
            const kind = require(path.resolve(p, entry));
            kinds.push(`${entry}: ${kind.description}`);
        }
    });
    return kinds;
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
    `Debug an OpenWhisk <action> by forwarding its activations to a local docker
    container with debugging enabled and debug port exposed to the host.

    If only <action> is specified, the deployed action code is used.

    Specify [source-path] pointing to the local sources of the action to dynamically
    mount them in the debug container. Sources will be automatically reloaded on
    each new activation (might depend on the kind).

    Supported kinds:
    - ${getSupportedKinds().join("\n")}
    `,
    yargs => {
        yargs.positional('action', {
            describe: 'Name of action to debug',
            type: 'string'
        });
        yargs.positional('source-path', {
            describe: 'Path to local action sources, file or folder (optional)',
            type: 'string',
            coerce: path.resolve // ensure absolute path
        });

        // action options
        yargs.option("m", {
            alias: "main",
            type: "string",
            group: "Action options:",
            describe: "Name of action entry point"
        });
        yargs.option("k", {
            alias: "kind",
            type: "string",
            group: "Action options:",
            describe: "Action kind override, needed for blackbox images"
        });
        yargs.option("i", {
            alias: "image",
            type: "string",
            group: "Action options:",
            describe: "Docker image to use as action container"
        });

        // debugging options
        yargs.option("p", {
            alias: "port",
            type: "number",
            group: "Debugging options:",
            describe: "Debug port exposed from action container that debugging clients connect to. Defaults to -P/--internal-port if set or standard debug port of the respective kind"
        });
        yargs.option("P", {
            alias: "debug-port",
            type: "number",
            group: "Debugging options:",
            describe: "Debug port opened by language framework inside the container. Must match the port that is opened by -C/--command. Defaults to standard debug port"
        });
        yargs.option("C", {
            alias: "command",
            type: "string",
            group: "Debugging options:",
            describe: "Container command override that enables debugging"
        });
        yargs.option("t", {
            alias: "agent-timeout",
            type: "number",
            group: "Debugging options:",
            describe: "Debugging agent timeout (seconds). Default: 5 min"
        });

        // general options
        yargs.option("v", {
            alias: "verbose",
            type: "boolean",
            describe: "Verbose output. Logs activation parameters and result"
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