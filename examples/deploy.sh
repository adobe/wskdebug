#!/bin/bash

PKG=wskdebug-examples

wsk package update $PKG
wsk action update $PKG/webaction webaction.js --web true
url=$(wsk action get $PKG/webaction --url | tail -n1)
open -a "Google Chrome" $url
