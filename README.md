wskdebug - Apache OpenWhisk debugger
====================================

Command line tool to debug OpenWhisk actions in your favorite IDE or debugger. Requires a local [Docker](https://www.docker.com/products/docker-desktop) environment.

**Note: This is a prerelease version. Currently under the Adobe internal @nui npm scope, but planning to open source. The next todos are tracked in [TODO.md](TODO.md).**

## About

`wskdebug` supports debugging of an action by forwarding it from the OpenWhisk system to a local container on your desktop and executing it there. The local container will have debugging enabled with the necessary debug port open, depending on the specific language runtime. This works with any invocations, including web actions. The solution is based only on custom actions and does not require anything special in the OpenWhisk system. `wskdebug` was inspired by the now defunct [wskdb](https://github.com/apache/incubator-openwhisk-debugger).

One caveat: web actions or other blocking invocations time out after 1 minute in OpenWhisk. This means that if the debugging session (stepping through code) takes longer than 1 minute, any web action will return an error and any blocking invocations will just get the activation id, which most callers of a blocking invocation will not expect. However, there is no time limit on stepping through the code itself.

Node.js runtimes are supported out of the box. For other languages, you need to specify `--port` (and/or `--internal-port`) and `--command` arguments, and possibly `--image`.

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
            "args": [ "MYACTION", "${workspaceFolder}/ACTION.js", "-p", "9229", "-v" ],
            "port": 9229,
            "localRoot": "${workspaceFolder}",
            "remoteRoot": "/code",
            "outputCapture": "std"
        }
    ]
```

Stop the debugger in VS Code to end the debugging session and `wskdebug`.

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

Debug an OpenWhisk <action> by forwarding its activations to a local docker
container with debugging enabled and debug port exposed to the host.

If only <action> is specified, the deployed action code is used.

Specify [source-path] pointing to the local sources of the action to dynamically
mount them in the debug container. Sources will be automatically reloaded on
each new activation (might depend on the kind).

Supported kinds:

- nodejs: Node.js V8 inspect debugger on port 9229. Supports source mount


Arguments:
  action       Name of action to debug
  source-path  Path to local action sources, file or folder (optional)

Action options:
  -m, --main   Name of action entry point
  -k, --kind   Action kind override, needed for blackbox images
  -i, --image  Docker image to use as action container

Debugging options:
  -p, --port           Debug port exposed from action container that debugging
                       clients connect to. Defaults to -P/--internal-port if set
                       or standard debug port of the respective kind
  -P, --debug-port     Debug port opened by language framework inside the
                       container. Must match the port that is opened by
                       -C/--command. Defaults to standard debug port
  -C, --command        Container command override that enables debugging
  -t, --agent-timeout  Debugging agent timeout (seconds). Default: 5 min

Options:
  -v, --verbose  Verbose output. Logs activation parameters and result
  --version      Show version number
  -h, --help     Show help
  ```