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

yargs
.help()
.alias("h", "help")
.option("version", {description: "Print the wskdebug version"})
.showHelpOnFail(true)
.updateStrings({ 'Positionals:': 'Arguments:' })
.command(
    "* <action>",
    "Apache OpenWhisk debugger",
    // "* <action> [source-path]",
    // "Apache OpenWhisk debugger and live reload tool",
    yargs => {
        yargs.positional('action', {
            describe: 'Name of action to debug (required).',
            type: 'string'
        });
        // yargs.positional('source-path', {
        //     describe: 'Path to action sources.',
        //     type: 'string'
        // });

        yargs.option("kind", {
            type: "string",
            describe: "Action kind. Required for blackbox images."
        });
        yargs.option("image", {
            type: "string",
            describe: "Docker image to use as action runtime."
        });
        yargs.option("debug-port", {
            type: "number",
            describe: "Debugging port to expose on action runtime."
        });
        yargs.option("debug-command", {
            type: "string",
            describe: "Debugging command to run in docker image."
        });
        yargs.option("t", {
            alias: "agent-timeout",
            type: "number",
            describe: "Debugging agent timeout in seconds. Use maximum available timeout in OpenWhisk system. Defaults to 5 min."
        });
        yargs.option("v", {
            alias: "verbose",
            type: "boolean",
            describe: "Verbose output"
        });

        // yargs.option("entry", {
        //     type: "string",
        //     describe: "Name of entry source file. Relative to [source-path]."
        // });
        // yargs.option("main", {
        //     type: "string",
        //     describe: "Name of main function."
        // });
    },
    async argv => {
        // console.log(argv);

        try {
            await new Debugger(argv).run();
        } catch (e) {
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