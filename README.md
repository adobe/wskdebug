<!--- when a new release happens, the VERSION and URL in the badge have to be manually updated because it's a private registry --->
[![npm version](https://img.shields.io/badge/%40nui%2Fwskdebug-0.0.2-blue.svg)](https://artifactory.corp.adobe.com/artifactory/npm-nui-release/@nui/wskdebug/-/@nui/wskdebug-0.0.2.tgz)

wskdebug
========

_Debugger and live development tool for Apache OpenWhisk_

`wskdebug` is a command line tool to debug and faster develop OpenWhisk actions in your favorite IDE or debugger. Supports:

* full debugging of actions of the respective language runtime
* automatic code reloading
* LiveReload for web actions
* auto-invoking of actions on code changes
* or running any shell command such as a curl request on code changes

for a fast feedback loop during development.

Requires [Node.js](https://nodejs.org) and a local [Docker](https://www.docker.com/products/docker-desktop) environment.

Currently, only Node.js runtimes are supported out of the box. To enable debugging for other languages, you can specify `--port` (and/or `--internal-port`) and `--command` arguments, and possibly `--image`. For automatic code reloading for other languages, `wskdebug` needs to be extended to [support these kinds](https://git.corp.adobe.com/nui/wskdebug/tree/master/src/kinds).

Please note: Web actions or other blocking invocations time out after **1 minute in OpenWhisk**. This limit cannot be configured. This means that if the debugging session (stepping through code) takes longer than 1 minute, any web action will return an error and any blocking invocations will just get the activation id, which most callers of a blocking invocation do not expect. However, there is no time limit on stepping through the code itself if you do not care about the result of the action being handled synchronously.


**Note: Currently under the Adobe internal @nui npm scope, but planning to open source.**

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

### Visual Studio Code - Node.js

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

### Plain usage
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

#### Node.js: Chrome DevTools

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

#### Node.js: node-inspect command line
Use the command line Node debugger [node-inspect](https://github.com/nodejs/node-inspect):

```
node-inspect 127.0.0.1:9229
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

## Help

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
