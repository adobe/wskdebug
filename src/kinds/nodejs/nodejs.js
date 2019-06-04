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

const fs = require('fs-extra');

// path inside docker container where action code is mounted
const CODE_MOUNT = "/code";

module.exports = {
    description: "Node.js V8 inspect debugger on port 9229. Supports source mount",

    // additional debug port to expose
    port: 9229,

    // modified docker image command/entrypoint to enable debugging
    command: function(invoker) {
        return `node --expose-gc --inspect=0.0.0.0:${invoker.debug.internalPort} app.js`
    },

    // return extra docker arguments such as mounting the source path
    dockerArgs: function(invoker) {
        return `-v ${invoker.sourceDir}:${CODE_MOUNT}`;
    },

    // return action for /init that mounts the sources specified by invoker.sourcePath
    mountAction: function(invoker) {
        // bridge that mounts local source path
        let code = fs.readFileSync(`${__dirname}/mount.js`, {encoding: 'utf8'});
        code = code.replace("$$main$$",        invoker.main || "main");
        code = code.replace("$$requirePath$$", `${CODE_MOUNT}/${invoker.sourceFile}`);
        code = code.replace("$$moduleFile$$",  invoker.sourceFile);

        return {
            binary: false,
            main:   "main",
            code:   code,
        };
    }
}
