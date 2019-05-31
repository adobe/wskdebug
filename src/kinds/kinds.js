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
    "nodejs"         : { // deprecated, image no longer available
        image: "openwhisk/nodejsaction:latest"
    },
    "nodejs:6"       : {
        image: "openwhisk/nodejs6action:latest"
        // can reference a different DEBUG below if necessary
        // debug: "nodejsLegacy"
    },
    "nodejs:8"       : {
        image: "openwhisk/action-nodejs-v8:latest"
    },
    "nodejs:10"      : { // Adobe I/O Runtime specific
        image: "adobeapiplatform/adobe-action-nodejs-v10:3.0.13"
    },
    "nodejs:12"      : {
        image: "openwhisk/action-nodejs-v12:latest"
    },
    "nodejs:default" : { // Adobe I/O Runtime specific
        image: "adobeapiplatform/adobe-action-nodejs-v10:3.0.13"
    },
    "python"         : {
        image: "openwhisk/python2action:latest"
    },
    "python:2"       : {
        image: "openwhisk/python2action:latest"
    },
    "python:3"       : {
        image: "openwhisk/python3action:latest"
    },
    "swift"          : { // deprecated, image no longer available
        image: "openwhisk/swiftaction:latest"
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
    "java"           : {
        image: "openwhisk/java8action:latest"
    },
    "php:7.1"        : {
        image: "openwhisk/action-php-v7.1:latest"
    },
    "php:7.2"        : {
        image: "openwhisk/action-php-v7.2:latest"
    },
    "native"         : {
        image: "openwhisk/dockerskeleton:latest"
    }
}
