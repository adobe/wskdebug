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

function enableConsoleColors() {
    // colorful console.error() and co
    let originalConsole = null;
    if (!console._logToFile) {
        originalConsole = {
            log: console.log,
            error: console.error,
            info: console.info,
            debug: console.debug
        };
        // overwrites console.log and co
        require('manakin').global;
    }
    return originalConsole;
}

function resetConsoleColors(originalConsole) {
    if (originalConsole) {
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
    }
}

function getSupportedKinds() {
    const kinds = [];
    const basePath = path.resolve(__dirname, "src/kinds");
    fs.readdirSync(basePath).forEach(function(entry) {
        const p = path.resolve(basePath, entry);
        if (fs.statSync(p).isDirectory()) {
            const kind = require(path.resolve(p, entry));
            kinds.push(`${entry}: ${kind.description}`);
        }
    });
    return kinds;
}

function yargsOptions(yargs) {
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
    yargs.option("on-build", {
        type: "string",
        group: "Action options:",
        describe: "Shell command for custom action build step"
    });
    yargs.option("build-path", {
        type: "string",
        group: "Action options:",
        describe: "Path to built action, result of --on-build command",
        coerce: path.resolve // ensure absolute path
    });

    // livereload
    yargs.option("l", {
        type: "boolean",
        implies: "source-path",
        group: "LiveReload options:",
        describe: "Enable browser LiveReload on [source-path]"
    });
    yargs.option("lr-port", {
        type: "number",
        implies: "l",
        group: "LiveReload options:",
        describe: "Port for browser LiveReload (defaults to 35729)"
    });
    yargs.option("P", {
        type: "string",
        group: "LiveReload options:",
        describe: "Invoke action with these parameters on changes to [source-path].\nArgument can be json string or name of json file."
    });
    yargs.option("a", {
        type: "string",
        group: "LiveReload options:",
        describe: "Name of custom action to invoke upon changes to [source-path].\nDefaults to <action> if -P is set."
    });
    yargs.option("r", {
        type: "string",
        group: "LiveReload options:",
        describe: "Shell command to run upon changes to [source-path]"
    });

    // Debugger options
    yargs.option("p", {
        alias: "port",
        type: "number",
        group: "Debugger options:",
        describe: "Debug port exposed from container that debugging clients connect to. Defaults to --internal-port if set or standard debug port of the kind. Node.js arguments --inspect and co. can be used too."
    });
    yargs.option("internal-port", {
        type: "number",
        group: "Debugger options:",
        describe: "Actual debug port inside the container. Must match port opened by --command. Defaults to standard debug port of kind."
    });
    yargs.option("command", {
        type: "string",
        group: "Debugger options:",
        describe: "Custom container command that enables debugging"
    });
    yargs.option("docker-args", {
        type: "string",
        group: "Debugger options:",
        describe: "Additional docker run arguments for container. Must be quoted and start with space: 'wskdebug --docker-args \" -e key=var\" myaction'"
    });
    yargs.option("on-start", {
        type: "string",
        group: "Debugger options:",
        describe: "Shell command to run when debugger is up"
    });

    // Agent options
    yargs.option("c", {
        alias: "condition",
        type: "string",
        group: "Agent options:",
        describe: "Hit condition to trigger debugger. Javascript expression evaluated against input parameters. Example: 'debug == 'true'"
    });
    yargs.option("agent-timeout", {
        type: "number",
        group: "Agent options:",
        describe: "Debugging agent timeout (seconds). Default: 5 min"
    });
    yargs.option("ngrok", {
        type: "boolean",
        group: "Agent options:",
        describe: "Use ngrok.com for agent forwarding."
    });
    yargs.option("ngrok-region", {
        type: "string",
        group: "Agent options:",
        describe: "Ngrok region to use. Defaults to 'us'."
    });

    // nodejs options
    yargs.option("inspect", {
        alias: ["inspect-brk", "inspect-port", "debug", "debug-brk", "debug-port"],
        hidden: true,
        type: "number"
    });

    // general options
    yargs.option("v", {
        alias: "verbose",
        type: "boolean",
        describe: "Verbose output. Logs activation parameters and result"
    });
    yargs.version(require("./package.json").version);
}

function getYargsParser() {
    return yargs
        .help()
        .alias("h", "help")
        .updateStrings({
            'Positionals:': 'Arguments:',
            'Not enough non-option arguments: got %s, need at least %s': "Error: Missing argument <action> (%s/%s)"
        })
        .version(false)
        .wrap(90)
        .command(
            "* <action> [source-path]",
            `Debug an OpenWhisk <action> by forwarding its activations to a local docker container that
            has debugging enabled and its debug port exposed to the host.

            If only <action> is specified, the deployed action code is debugged.

            If [source-path] is set, it must point to the local action sources which will be mounted
            into the debug container. Sources will be automatically reloaded on each new activation.
            This feature depends on the kind.

            Supported kinds:
            - ${getSupportedKinds().join("\n")}
            `,
            yargsOptions
        );
}

function normalizeArgs(argv) {
    // pass hidden node.js arg aliases to port option
    argv.port = argv.inspect || argv.p;
    // more readable internal argument names
    argv.livereload = argv.l;
    argv.livereloadPort = argv.lrPort;
    argv.invokeParams = argv.P;
    argv.invokeAction = argv.a;
    argv.onChange = argv.r;
}

function printErrorAndExit(err, argv) {
    console.log();
    if (argv.verbose) {
        console.error(err);
    } else {
        console.error("Error:", err.message);
    }
    process.exit(1);
}

function registerExitHandler(dbg) {
    // ensure we remove the agent when this app gets terminated
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, async () => {
            await dbg.kill();

            process.exit();
        });
    });
}

async function wskdebug(args, isCommandLine=false) {
    const originalConsole = enableConsoleColors();

    try {
        const parser = getYargsParser();

        // if cli mode, we want to exit the process, otherwise throw an error
        parser.showHelpOnFail(isCommandLine);
        parser.exitProcess(isCommandLine);

        const argv = parser.parse(args);
        normalizeArgs(argv);

        if (argv.help || argv.version) {
            // do nothing
            return;
        }

        try {
            const dbg = new Debugger(argv);
            if (isCommandLine) {
                registerExitHandler(dbg);
            }
            await dbg.start();
            await dbg.run();

        } catch (e) {
            if (isCommandLine) {
                printErrorAndExit(e, argv);
            } else {
                throw e;
            }
        }

    } finally {
        resetConsoleColors(originalConsole);
    }
}

// exporting the resulting promise for unit tests
module.exports = wskdebug;