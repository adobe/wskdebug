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

// https://github.com/apache/incubator-openwhisk/blob/master/ansible/files/runtimes.json
// note: openwhisk deployments might have their own versions
module.exports = {
    "nodejs"         : { // deprecated (no version)
        image: "openwhisk/action-nodejs-v10:latest"
    },
    "nodejs:default" : {
        image: "openwhisk/action-nodejs-v10:latest"
    },
    "nodejs:6"       : {
        image: "openwhisk/nodejs6action:latest"
        // can reference a different DEBUG below if necessary
        // debug: "nodejsLegacy"
    },
    "nodejs:8"       : {
        image: "openwhisk/action-nodejs-v8:latest"
    },
    "nodejs:10"      : {
        image: "openwhisk/action-nodejs-v10:latest"
    },
    "nodejs:12"      : {
        image: "openwhisk/action-nodejs-v12:latest"
    },
    "python"         : { // deprecated (no version)
        image: "openwhisk/python2action:latest"
    },
    "python:2"       : {
        image: "openwhisk/python2action:latest"
    },
    "python:3"       : {
        image: "openwhisk/python3action:latest"
    },
    "swift"          : { // deprecated (no version)
        image: "openwhisk/action-swift-v4.1:latest"
    },
    "swift:3"        : { // deprecated, but still available
        image: "openwhisk/swift3action:latest"
    },
    "swift:3.1.1"    : {
        image: "openwhisk/action-swift-v3.1.1:latest"
    },
    "swift:4.1"      : {
        image: "openwhisk/action-swift-v4.1:latest"
    },
    "swift:4.2"      : {
        image: "openwhisk/action-swift-v4.2:latest"
    },
    "java"           : {
        image: "openwhisk/java8action:latest"
    },
    "php:7.1"        : {
        image: "openwhisk/action-php-v7.1:latest"
    },
    "php:7.2"        : {
        image: "openwhisk/action-php-v7.2:latest"
    },
    "php:7.3"        : {
        image: "openwhisk/action-php-v7.3:latest"
    },
    "ruby:2.5"       : {
        image: "openwhisk/action-ruby-v2.5:latest"
    },
    "go:1.11"        : {
        image: "openwhisk/actionloop-golang-v1.11:latest"
    },
    "dotnet:2.2"     : {
        image: "openwhisk/action-dotnet-v2.2:latest"
    },
    "ballerina:0.990": {
        image: "openwhisk/action-ballerina-v0.990.2:latest"
    },
    "native"         : {
        image: "openwhisk/dockerskeleton:latest"
    }
}
