@echo off
setlocal

pushd "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm were not found. Install Node.js 20+.
  exit /b 1
)

if not exist "node_modules" npm install
if errorlevel 1 exit /b 1

npm run build
if errorlevel 1 exit /b 1

if not exist "bin" mkdir "bin"
if not exist "bin\operator.config" copy /Y "operator.config.example" "bin\operator.config" >nul

echo Built: %~dp0dist and %~dp0dist-electron
echo Run:   %~dp0start.cmd

popd
