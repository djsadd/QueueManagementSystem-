@echo off
setlocal

if not exist "%~dp0bin\QueueTerminal.exe" call "%~dp0build.cmd"
if errorlevel 1 exit /b 1

start "" "%~dp0bin\QueueTerminal.exe"
