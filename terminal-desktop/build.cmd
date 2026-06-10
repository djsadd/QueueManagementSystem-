@echo off
setlocal

set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if not exist "%CSC%" (
  echo .NET Framework 4.x was not found. Install .NET Framework 4.6.2 for Windows 7 SP1.
  exit /b 1
)

if not exist "%~dp0bin" mkdir "%~dp0bin"

"%CSC%" /nologo /target:winexe /optimize+ /out:"%~dp0bin\QueueTerminal.exe" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "%~dp0QueueTerminal.cs"
if errorlevel 1 exit /b 1

if not exist "%~dp0bin\terminal.config" copy /Y "%~dp0terminal.config.example" "%~dp0bin\terminal.config" >nul
copy /Y "%~dp0..\frontend\src\assets\Logo+RGB.png" "%~dp0bin\logo.png" >nul

echo Built: %~dp0bin\QueueTerminal.exe
