@echo off
setlocal

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js on the build computer.
  exit /b 1
)

pushd "%~dp0"

if not exist "node_modules" call npm install
if errorlevel 1 exit /b 1

call npm run package
if errorlevel 1 exit /b 1

if not exist "bin-electron\terminal.config" copy /Y "terminal.config.example" "bin-electron\terminal.config" >nul

popd

echo Built: %~dp0bin-electron\Queue Terminal Kiosk*.exe
