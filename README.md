wskdebug - Apache OpenWhisk debugger
====================================

Command line tool to debug OpenWhisk actions in your favorite IDE or debugger. Requires a local [Docker](https://www.docker.com/products/docker-desktop) environment.

**Note: This is a prerelease version. Currently under the Adobe internal @nui npm scope, but planning to open source. The next todos are tracked in [TODO.md](TODO.md).**

## About

`wskdebug` supports debugging of an action by forwarding it from the OpenWhisk system to a local container on your desktop and executing it there. The local container will have debugging enabled with the necessary debug port open, depending on the specific language runtime. This works with any invocations, including web actions. The solution is based only on custom actions and does not require anything special in the OpenWhisk system. `wskdebug` was inspired by the now defunct [wskdb](https://github.com/apache/incubator-openwhisk-debugger).

One caveat: web actions or other blocking invocations time out after 1 minute in OpenWhisk. This means that if the debugging session (stepping through code) takes longer than 1 minute, any web action will return an error and any blocking invocations will just get the activation id, which most callers of a blocking invocation will not expect. However, there is no time limit on stepping through the code itself.

Node JS runtimes are supported out of the box. For other languages, you need to specify `--debug-port` and `--debug-command` arguments, and possibly `--image`.

## Installation

```
npm install -g @nui/wskdebug
```


## Usage

The action to debug (e.g. `myaction`) must already be deployed.

### Raw
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

You can then use a debugger to connect to the debug port, in this case `localhost:9229`. For example, using the command line Node debugger [node-inspect](https://github.com/nodejs/node-inspect):

```
node-inspect 127.0.0.1:9229
```

When done, terminate `wskdebug` (not kill!) using CTRL+C. It will cleanup and remove the forwarding agent and restore the original action.

### Visual Studio Code

Add the configuration below to your [launch.json](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations). Replace `myaction` with the name of your action. When you run this, it will start wskdebug and should automatically connect the debugger.

Currently, to find the code to debug, you will have to look in the debug panel on the left side under "Loaded Scripts" &gt; "&lt;eval&gt;", and find the eval snippet that is your action code. You can then set breakpoints. This will be improved in future versions.

```
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Debug myaction",
            "program": "wskdebug",
            "args": ["myaction"],
            "port": 9229
        }
    ]
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
wskdebug <action>

Apache OpenWhisk debugger

Arguments:
  action  Name of action to debug (required).                           

Options:
  --version            Print the wskdebug version                      
  --kind               Action kind. Required for blackbox images.       
  --image              Docker image to use as action runtime.           
  --debug-port         Debugging port to expose on action runtime.      
  --debug-command      Debugging command to run in docker image.        
  -t, --agent-timeout  Debugging agent timeout in seconds. Use maximum available
                       timeout in OpenWhisk system. Defaults to 5 min.  
  -v, --verbose        Verbose output                                  
  -h, --help           Show help                                       
```