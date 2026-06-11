# Electron desktop ticket terminal

Touch kiosk client for issuing queue tickets through the existing public backend
API. It loads active services, optionally asks for an educational program,
creates a ticket with `POST /public/tickets`, and sends an 80 mm receipt to a
Windows printer without a browser print dialog.

## Windows 7 note

The app is pinned to Electron `22.3.27` because Electron 22 is the last major
line that can run on Windows 7/8/8.1. Electron 23 and newer require Windows 10+.
Build the portable executable on a modern development PC, then copy the output
to the Windows 7 terminal.

## Build

```cmd
cd terminal-desktop
build.cmd
```

Portable executables are created in `bin-electron` for `x64` and `ia32`.
`build.cmd` also copies an editable `terminal.config` file next to them.

## Configure

Edit `bin-electron\terminal.config` after building:

```ini
ApiBaseUrl=http://192.168.115.12:8000
PrinterName=Custom VKP 80
FullScreen=true
ReceiptWidthMm=80
ReceiptBottomFeedMm=5
AutoResetSeconds=10
```

Leave `PrinterName` empty to use the default Windows printer. `ApiBaseUrl` must
point to the FastAPI backend, not to the React frontend.

## Run

```cmd
start.cmd
```

For development:

```cmd
npm install
npm run dev
```

Use `Alt+F4` to close the kiosk window. The previous C# WinForms source remains
in `QueueTerminal.cs` as a legacy fallback, but the default build is now the
Electron kiosk.
