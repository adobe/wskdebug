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

// based on from serverless-openwhisk, MIT licensed
// but changed to drop usage of async Promises and some renaming
// https://github.com/serverless/serverless-openwhisk/blob/master/provider/credentials.js

'use strict';

const path = require('path');
const fs = require('fs-extra');

const ENV_PARAMS = ['OW_APIHOST', 'OW_AUTH', 'OW_NAMESPACE', 'OW_APIGW_ACCESS_TOKEN'];

function getWskPropsFile() {
  const Home = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  return process.env.WSK_CONFIG_FILE || path.format({ dir: Home, base: '.wskprops' });
}

function readWskPropsFile() {
  const wskFilePath = getWskPropsFile();

  if (fs.existsSync(wskFilePath)) {
    return fs.readFileSync(wskFilePath, 'utf8');
  } else {
    return null;
  }
}

function getWskProps() {
  const data = readWskPropsFile();
  if (!data) return {};

  const wskProps = data.trim().split('\n')
  .map(line => line.split('='))
  .reduce((params, keyValue) => {
    params[keyValue[0].toLowerCase()] = keyValue[1]; // eslint-disable-line no-param-reassign
    return params;
  }, {});

  return wskProps;
}

function getWskEnvProps() {
  const envProps = {};
  ENV_PARAMS.forEach((envName) => {
    if (process.env[envName]) envProps[envName.slice(3).toLowerCase()] = process.env[envName];
  });
  return envProps;
}

module.exports = {
  get() {
    const props = Object.assign(getWskProps(), getWskEnvProps());
    if (props.auth) {
      props.api_key = props.auth;
      delete props.auth;
    }
    return props;
  },
  ENV_PARAMS,
};