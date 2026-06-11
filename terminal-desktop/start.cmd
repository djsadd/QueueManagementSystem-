@echo off
setlocal

set "APP="
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" (
  if not defined PROCESSOR_ARCHITEW6432 set "APP=Queue Terminal Kiosk-1.0.0-ia32.exe"
)
if not defined APP set "APP=Queue Terminal Kiosk-1.0.0-x64.exe"

if exist "%~dp0bin-electron\%APP%" (
  start "" "%~dp0bin-electron\%APP%"
  exit /b 0
)

pushd "%~dp0"
if not exist "node_modules" call npm install
if errorlevel 1 exit /b 1

call npm run start
popd
