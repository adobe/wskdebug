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

// our principles:
// - only problems, no syntax/stylistic related rules (done by extending from "eslint-config-problems")
// - do not force new EcmaScript features
//     + warn instead of error for improvements like "prefer-template"
//     + ignore if they depend on the situation or can make readability harder like "prefer-arrow-callback" or "object-shorthand"

module.exports = {
    "extends": "problems",
    "env": {
        "node": true
    },
    "parserOptions": {
        "ecmaVersion": 2018
    },
    "plugins": [
        "mocha"
    ],
    "rules": {
        "prefer-arrow-callback": "off",
        "prefer-template": "off",
        "object-shorthand": "off",

        // console.* is wanted in OpenWhisk actions
        "no-console": ["off", {"allow": true}],

        "template-curly-spacing": ["warn", "never"],

        "no-else-return": "off",

        // mocha rules intended to catch common problems:
        // - tests marked with .only() is usually only during development
        // - tests with identical titles are confusing
        // - tests defined using () => {} notation do not have access to globals
        // - tests nested in tests is confusing
        // - empty tests point to incomplete code
        // - mocha allows for synch tests, async tests using 'done' callback,
        //   async tests using Promise. Combining callback and a return of some value
        //   indicates mixing up the test types
        // - multiple before/after hooks in a single test suite/test is confusing
        // - passing async functions to describe() is usually wrong, the individual tests
        //   can be async however
        "mocha/no-exclusive-tests": "error",
        "mocha/no-identical-title": "error",
        "mocha/no-mocha-arrows": "error",
        "mocha/no-nested-tests": "error",
        "mocha/no-pending-tests": "error",
        "mocha/no-return-and-callback": "error",
        "mocha/no-sibling-hooks": "error",
        "mocha/no-async-describe": "error",
        "indent": ["error", 4],
        "keyword-spacing": [2]
    }
};
