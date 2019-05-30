TODO List
=========

* [ ] support openwhisk without concurrency (agent-no-concurrency.js)
* [ ] live reload
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

## Original notes
```
    1.
    -> get action, see that it is nodejs:* (or from args)
    -> determine the right image
    -> start with command `node --expose-gc --inspect app.js`
    ->       and port 9229 exposed

    => debugger can connect now

    2.
    -> get action code
    -> deploy action on container
    -> copy action to *_wskdebug_original
    -> overwrite action with agent.js
    -> invoke agent-action with $waitForInvocation (and retry)

    => action is invoked for real

    3.
    -> success response: pass invocation to local container, wait for result
    -> should trigger debugger

    => user steps through code

    4.
    -> debugging done, local invocation finishes
    -> local result sent in agent-action invocation with $activationId

    => real invocation completes

    5.
    -> (repeat) invoke agent-action with $waitForInvocation (and retry)

    => user kills wskdebug

    6.
    -> restore action, copy *_wskdebug_original back to *
    -> stop waitForInvocation
    -> kill and remove local container (abort debugging)

    wskdebug <action> --livereload <path>

    in 2.
    -> container mount /code to <path>
    -> deploy bridge action that just reloads /code every time
```