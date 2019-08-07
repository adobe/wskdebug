#!/bin/bash

PKG=wskdebug-examples

wsk action list | grep wskdebug-examples

wsk action delete $PKG/webaction
wsk action create --copy $PKG/webaction $PKG/webaction_wskdebug_original
wsk action delete $PKG/webaction_wskdebug_original

wsk action list | grep wskdebug-examples
