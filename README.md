<!--- when a new release happens, the VERSION and URL in the badge have to be manually updated because it's a private registry --->
[![npm version](https://img.shields.io/badge/%40nui%2Fwskdebug-0.0.3-blue.svg)](https://artifactory.corp.adobe.com/artifactory/npm-nui-release/@nui/wskdebug/-/@nui/wskdebug-0.0.3.tgz)
**Currently under the Adobe internal @nui npm scope, but planning to open source.**


wskdebug
========

_Debugging and live development tool for [Apache OpenWhisk](https://openwhisk.apache.org)_

`wskdebug` is a command line tool to **develop and debug** [OpenWhisk actions](https://openwhisk.apache.org/documentation.html#programming-model-actions) in your favorite IDE or debugger with a **fast feedback loop**. It features:

* full debugging of actions of the respective language runtime
* automatic code reloading
* LiveReload for web actions
* auto-invoking of actions on code changes
* or running any shell command such as a curl request on code changes

Requires [Node.js](https://nodejs.org) (version 10+) and a local [Docker](https://www.docker.com/products/docker-desktop) environment.

Currently, only Node.js runtimes are supported out of the box. For others, basic debugging can usually be [configured on the command line](#other-action-kinds), while automatic code reloading needs an [extension in `wskdebug`](#extending-wskdebug-for-other-kinds).

_Please note: Web actions or other blocking invocations time out after **1 minute in OpenWhisk**. This limit cannot be configured. This means that if the debugging session (stepping through code) takes longer than 1 minute, any web action will return an error and any blocking invocations will just get the activation id, which most callers of a blocking invocation do not expect. However, there is no time limit on stepping through the code itself if you do not care about the result of the action being handled synchronously._

## Table of contents

  * [How it works](#how-it-works)
  * [Installation](#installation)
  * [Usage](#usage)
  * [Troubleshooting](#troubleshooting)
  * [Development](#development)

## How it works

`wskdebug` supports debugging of an action by forwarding it from the OpenWhisk system to a local container on your desktop and executing it there. By overriding the command to run in the container and other docker run configurations, the local container or better the action/language runtime inside the container is run in debug mode and the respective debug port is opened and exposed to the local desktop.

Furthermore, the local container can mount the local source files and automatically reload them on every invocation. `wskdebug` can also listen for changes to the source files and trigger an automatic reload of a web action or direct invocation of the action or just any shell command, e.g. if you need to make more nuanced curl requests to trigger your API.

The debugger works with all normal actions, including web actions. Sequences or compositions itself (not the component actions) are not supported. The solution is only based on custom actions and works with any OpenWhisk system. `wskdebug` was inspired by the now defunct [wskdb](https://github.com/apache/incubator-openwhisk-debugger).

## Installation

```
npm install -g @nui/wskdebug
```

## Usage

The action to debug (e.g. `myaction`) must already be deployed.

+ [Node.js: Visual Studio Code](#nodejs-visual-studio-code)
+ [Node.js: Visual Studio Code - Multiple actions](#nodejs-visual-studio-code-multiple-actions)
+ [Node.js: Plain usage](#nodejs-plain-usage)
+ [Node.js: Chrome DevTools](#nodejs-chrome-devtools)
+ [Node.js: node-inspect command line](#nodejs-node-inspect-command-line)
+ [Help output](#help-output)

### Node.js: Visual Studio Code

Add the configuration below to your [launch.json](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations). Replace `MYACTION` with the name of your action and `ACTION.js` with the source file containing the action. When you run this, it will start wskdebug and should automatically connect the debugger.

```
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "wskdebug MYACTION",
            "runtimeExecutable": "wskdebug",
            "args": [ "MYACTION", "${workspaceFolder}/ACTION.js", "-l" ],
            "localRoot": "${workspaceFolder}",
            "remoteRoot": "/code",
            "outputCapture": "std"
        }
    ]
```

Stop the debugger in VS Code to end the debugging session and `wskdebug`.

For troubleshooting, you can run the debugger in verbose mode by adding `"-v"` to the `args` array.

### Node.js: Multiple actions

Each `wskdebug` process can debug and live reload exactly a single action. To debug multiple actions, run `wskdebug` for each. If all of them are using the same kind/language, where the default debug port is the same, different ports need to be used. 

This is automatic if you use the VS code approach above using `launch`, because VS Code will automatically pick an unused debug port (and pass it as `--inspect=port` param to `wskdebug` as if it were `node`, and `wskdebug` understands this as alias for its `--port` argument).

Otherwise you have to 

### Node.js: Plain usage

Run `wskdebug` and specify the action

```
wskdebug myaction
```

This will output (in case of a nodejs action):

```
Debug type: nodejs
Debug port: localhost:9229
Ready, waiting for activations of myaction
Use CTRL+C to exit
```

You can then use a debugger to connect to the debug port, in this case `localhost:9229`. See below.

When done, terminate `wskdebug` (not kill!) using CTRL+C. It will cleanup and remove the forwarding agent and restore the original action.

### Node.js: Chrome DevTools

Run [Node.js: Plain usage](#nodejs-plain-usage) and then:

1. Open Chrome
2. Enter `about:inspect`
3. You should see a remote target `app.js`
4. Click on "Open dedicated DevTools for Node" (but not on "inspect" under Target)
5. This should open a new window
6. Go to Sources > Node
7. Find the `runner.js`
8. Set a breakpoint on the line `thisRunner.userScriptMain(args)` inside `this.run()` (around line 97)
9. Invoke the action
10. Debugger should hit the breakpoint
11. Then step into the function, it should now show the action sources in a tab named like `VM201` (the openwhisk nodejs runtime evals() the script, hence it's not directly listed as source file)

See also this [article](https://medium.com/@paul_irish/debugging-node-js-nightlies-with-chrome-devtools-7c4a1b95ae27).

### Node.js: node-inspect command line

Run [Node.js: Plain usage](#nodejs-plain-usage) and then:

Use the command line Node debugger [node-inspect](https://github.com/nodejs/node-inspect):

```
node-inspect 127.0.0.1:9229
```

### Unsupported action kinds

To enable debugging for kinds/languages not supported out of the box, you can specify these cli arguments manually:

* `--internal-port` the actual language debug port inside the container
* `--command` override the docker run command for the image to e.g. pass a debug flag to the language enviroment
* `--port` (optional) the port as it will be exposed from the container to the host, i.e. to what clients will connect to. defaults to `--internal-port` if set
* `--image` (optional) control the docker image used as runtime for the action

Once you found a working configuration, feel encouraged to open a pull request to [add support for this out of the box](#default-debug-ports-and-commands)!

For automatic code reloading for other languages, `wskdebug` needs to be [extended](#extending-wskdebug-for-other-kinds).


### Help output

```
wskdebug <action> [source-path]

Debug an OpenWhisk <action> by forwarding its activations to a local docker container that
has debugging enabled and its debug port exposed to the host.

If only <action> is specified, the deployed action code is debugged.

If [source-path] is set, it must point to the local action sources which will be mounted
into the debug container. Sources will be automatically reloaded on each new activation.
This feature depends on the kind.

Supported kinds:
- nodejs: Node.js V8 inspect debugger on port 9229. Supports source mount


Arguments:
  action       Name of action to debug                                            [string]
  source-path  Path to local action sources, file or folder (optional)            [string]

Action options:
  -m, --main   Name of action entry point                                         [string]
  -k, --kind   Action kind override, needed for blackbox images                   [string]
  -i, --image  Docker image to use as action container                            [string]

LiveReload options:
  -l         Enable browser LiveReload on [source-path]
  --lr-port  Port for browser LiveReload (defaults to 35729)                      [number]
  -P         Invoke action with these parameters on changes to [source-path].
             Argument can be json string or name of json file.                    [string]
  -a         Name of custom action to invoke upon changes to [source-path].
             Defaults to <action> if -P is set.                                   [string]
  -r         Shell command to run upon changes to [source-path]                   [string]

Debugging options:
  -p, --port       Debug port exposed from container that debugging clients connect to.
                   Defaults to --internal-port if set or standard debug port of the kind.
                   Node.js arguments --inspect and co. can be used too.           [number]
  --internal-port  Actual debug port inside the container. Must match port opened by
                   --command. Defaults to standard debug port of kind.            [number]
  --command        Custom container command that enables debugging                [string]
  --docker-args    Additional docker run arguments for container. Must be quoted and start
                   with space: 'wskdebug --docker-args " -e key=var" myaction'    [string]
  --agent-timeout  Debugging agent timeout (seconds). Default: 5 min              [number]
  --on-start       Shell command to run when debugger is up                       [string]

Options:
  -v, --verbose  Verbose output. Logs activation parameters and result
  --version      Show version number
  -h, --help     Show help
```

## Troubleshooting

### Port is already allocated

You can only run one `wskdebug` aka one action for the same runtime (debug port) at a time.

If you get an error like this:

```
docker: Error response from daemon: driver failed programming external connectivity on endpoint wskdebug-webaction-1559204115390 (3919892fab2981bf9feab0b6ba3fc256676de59d1a6ab67519295757313e8ac3): Bind for 0.0.0.0:9229 failed: port is already allocated.
```

it means that there is another `wskdebug` already running or that its container was left over, blocking the debug port.

Either quit the other `wskdebug` or if its an unexpected left over, terminate the docker container using:

```
docker rm -f wskdebug-webaction-1559204115390
```

The containers are named `wskdebug-ACTION-TIMESTAMP`.

### Restore action

If `wskdebug` fails unexpectedly or gets killed, it might leave the forwarding agent behind in place of the action. You should be able to restore the original action using the copied action named `*_wskdebug_original`.

```
wsk action delete myaction
wsk action create --copy myaction myaction_wskdebug_original
wsk action delete myaction_wskdebug_original
```

Alternatively you could also redeploy your action and then delete the backup:

```
# deploy command might vary
wsk action update myaction myaction.js

wsk action delete myaction_wskdebug_original
```

## Development

### Extending wskdebug for other kinds

For automatic code reloading for other languages, `wskdebug` needs to be extended to support these kinds. This happens inside [src/kinds](https://git.corp.adobe.com/nui/wskdebug/tree/master/src/kinds).

- [Mapping of kinds to docker images](#mapping-of-kinds-to-docker-images)
- [Custom debug kind](#custom-debug-kind)
- [Default debug ports and commands](#default-debug-ports-and-commands)
- [Support code reloading](#support-code-reloading)
- [Available variables](#available-variables)


#### Mapping of kinds to docker images

To change the mapping of kinds to docker images (based on [runtimes.json](https://github.com/apache/incubator-openwhisk/blob/master/ansible/files/runtimes.json) from OpenWhisk), change [src/kinds/kinds.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/kinds.js).

#### Custom debug kind

For default debug instructions and live code reloading, a custom "debug kind js" needs to be provided at `src/kinds/<debugKind>/<debugKind>.js`.

`<debugKind>` must be without the version, i.e. the part before the `:` in a kind. For example for `nodejs:8` it will be `nodejs`, for `nodejs:default` it will be `nodejs` as well. This is because normally the debug mechanism is the same across language versions. To define a different debug kind, add a `debug` field in [src/kinds/kinds.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/kinds.js) for the particular kind, e.g. for `nodejs:6`set `debug: "nodejsLegacy"` and then it must be under `src/kinds/nodejsLegacy/nodejsLegacy.js`.

This js module needs to export an object with different fields. These can be either a literal value (for simple fixed things such as a port) or a function (allowing for dynamic logic based on cli arguments etc.). These functions get the `invoker` passed as argument, which provides [certain variables](#available-variables) such as cli arguments.

A complete example is the [src/kinds/nodejs/nodejs.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/nodejs/nodejs.js).

See below for the different items to do.

#### Default debug ports and commands

To just add default debug ports and docker command for a kind, add a custom debug kind and export an object with  `description`, `port` and `command` fields. Optionally `dockerArgs` for extra docker arguments (such as passing in environment variables using `-e` if necessary).

#### Support code reloading

To support live code reloading/mounting, add a custom debug kind and export an object with a `mountAction` function. This has to return an action that dynamically loads the code at the start of each activation. A typical approach is to mount the `<source-path>` (folder) passed on the cli as `/code` inside the docker container, from where the mount action can reload it. The exact mechanism will depend on the language - in node.js for example, `eval()` is [used for plain actions](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/nodejs/mount-plain.js#L30). The docker mounting can be specified in `dockerArgs`.

The `mountAction(invoker)` must return an object that is an openwhisk action `/init` definition, which consists of:

* `binary`: true if zip or binary distribution (depends on kind), false if plain code (for scripting languages)
* `main`: name of the entry function
* `code`: string with source code or base64 encoded if binary for the live mount

Example mounting actions from nodejs are [mount-plain.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/nodejs/mount-plain.js) (for plain node.js actions) and [mount-require.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/kinds/nodejs/mount-require.js) (for action zips expecting node modules using `require()`).

#### Available variables

See also [invoker.js](https://git.corp.adobe.com/nui/wskdebug/blob/master/src/invoker.js). Note that some of these might not be set yet, for example `invoker.debug.port` is not yet available when `port()` is invoked. The raw cli args are usually available as `invoker.<cli-arg>`.

| Variable | Type | Description |
|----------|------|-------------|
| `invoker.main` | `string` | name of the `main` entry point (from cli args) |
| `invoker.sourceFile` | `string` | absolute path to the `<source-file>` from the cli args if it's a file |
| `invoker.sourceDir` | `string` | absolute path to `<source-file>` from the cli args if it's a directory, or the containing directory if it's a file |
| `invoker.action` | `object` | the object representing the debugged action, as specified as `Action` model in the [openwhisk REST API spec](http://petstore.swagger.io/?url=https://raw.githubusercontent.com/openwhisk/openwhisk/master/core/controller/src/main/resources/apiv1swagger.json) |
| `invoker.debug.port` | `number` | `--port` from cli args or `--internal-port` or the `port` from the debug kind js (in that preference) |
| `invoker.debug.internalPort` | `number` | `--internal-port` from cli args or if not specified, the `port` from the debug kind js |
| `invoker.debug.command` | `string` | `--command` from cli args or the `command` from the debug kind js (in that preference) |

