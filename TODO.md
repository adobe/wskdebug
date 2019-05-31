TODO List
=========

* [x] source path mounting
* [x] short hand cli args
* [ ] check if action is agent in case previous restore failed
* [ ] extra docker args
* [ ] custom command to run when debugger is ready, with $args
* [ ] support plain JS actions (no require)
* [ ] live reload
* [ ] support openwhisk without concurrency (agent-no-concurrency.js)
* [ ] only allow a single debugger by registering with uuid (agent.js)
* [ ] abortPendingActivations (debugger.js)
* [ ] opensource - submission form + add license, code of conduct etc.

## Command line Ideas

```
wskdebug <action> [--kind nodejs]

wskdebug <action> --kind nodejs --port 9229

wskdebug <action> -- <custom docker args>

possible <custom docker args>:

    -e env:var
    -p port
    <command> <args>
```
