@echo off
setlocal

pushd "%~dp0"

if not exist "node_modules" npm install
if errorlevel 1 exit /b 1

if not exist "dist-electron\main.js" call "%~dp0build.cmd"
if errorlevel 1 exit /b 1

npm run start

popd
