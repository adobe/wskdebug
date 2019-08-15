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

module.exports = {
    //  map to a shared debug kind, otherwise uses the kind name itself
    debugKinds: {
        // "nodejs:6": "nodejsLegacy"
    },
    // fallback in case the openwhisk api doesn't work or doesn't return runtimes
    // list taken from: https://github.com/apache/incubator-openwhisk/blob/master/ansible/files/runtimes.json
    images: {
        "nodejs": "openwhisk/action-nodejs-v10:latest", // deprecated (no version)
        "nodejs:default": "openwhisk/action-nodejs-v10:latest",
        "nodejs:6": "openwhisk/nodejs6action:latest",
        "nodejs:8": "openwhisk/action-nodejs-v8:latest",
        "nodejs:10": "openwhisk/action-nodejs-v10:latest",
        "nodejs:12": "openwhisk/action-nodejs-v12:latest",
        "python": "openwhisk/python2action:latest", // deprecated (no version)
        "python:2": "openwhisk/python2action:latest",
        "python:3": "openwhisk/python3action:latest",
        "swift": "openwhisk/action-swift-v4.1:latest", // deprecated (no version)
        "swift:3": "openwhisk/swift3action:latest", // deprecated, but still available
        "swift:3.1.1": "openwhisk/action-swift-v3.1.1:latest",
        "swift:4.1": "openwhisk/action-swift-v4.1:latest",
        "swift:4.2": "openwhisk/action-swift-v4.2:latest",
        "java": "openwhisk/java8action:latest",
        "php:7.1": "openwhisk/action-php-v7.1:latest",
        "php:7.2": "openwhisk/action-php-v7.2:latest",
        "php:7.3": "openwhisk/action-php-v7.3:latest",
        "ruby:2.5": "openwhisk/action-ruby-v2.5:latest",
        "go:1.11": "openwhisk/actionloop-golang-v1.11:latest",
        "dotnet:2.2": "openwhisk/action-dotnet-v2.2:latest",
        "ballerina:0.990": "openwhisk/action-ballerina-v0.990.2:latest",
        "native": "openwhisk/dockerskeleton:latest"
    }
}
