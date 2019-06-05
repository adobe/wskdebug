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

// Variables will be replaced before the code is loaded

// path to actual action sources
const path = "$$sourcePath$$";
// main function
const mainFn = "$$main$$";
// name of module file (for helpful errors)
const sourceFile = "$$sourceFile$$";

// load and validate on /init for quick feedback
try {
    require(path);
} catch (e) {
    throw `Cannot load module '${sourceFile}': ${e}`;
}
if (typeof require(path)[mainFn] !== "function") {
    throw `'${mainFn}' is not a function in '${sourceFile}'. Specify the right function in wskdebug using --main.`;
}

// eslint-disable-next-line no-unused-vars
function main(args) {
    // force reload of mounted action on every invocation
    delete require.cache[require.resolve(path)];

    // require and invoke main function
    return require(path)[mainFn](args);
}