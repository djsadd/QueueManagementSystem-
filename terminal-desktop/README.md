# Desktop ticket terminal for Windows 7

This is a lightweight Windows Forms terminal client. It calls the existing
public backend API and prints a newly registered ticket directly through the
Windows printer driver, without a browser or a print dialog.

## Requirements

- Windows 7 SP1.
- .NET Framework 4.6.2 installed on the terminal computer.
- A thermal printer installed in Windows, preferably configured as the default
  printer with 80 mm paper.
- Network access from the terminal computer to the FastAPI backend.

.NET Framework 4.6.2 is selected because it is compatible with Windows 7 SP1
and provides the old Windows Forms runtime needed by this client.

## Build

On a Windows computer with .NET Framework installed:

```cmd
cd terminal-desktop
build.cmd
```

The output is `bin\QueueTerminal.exe`. It is a small standalone application;
the target terminal only needs .NET Framework and its printer driver.

## Configure

Edit `bin\terminal.config` after building:

```ini
ApiBaseUrl=http://192.168.1.20:8000
PrinterName=Custom VKP 80
FullScreen=true
ReceiptWidthMm=80
ReceiptBottomFeedMm=5
```

`ApiBaseUrl` must point to the backend rather than the React frontend. Leave
`PrinterName` empty to use the default Windows printer. The receipt height is
calculated from its content; `ReceiptBottomFeedMm` leaves only the small tail
needed before the printer cutter.

## Run

```cmd
start.cmd
```

The application loads active services, registers a ticket through
`POST /public/tickets` with the desktop terminal header, and immediately
submits an 80 mm receipt to the printer. The issued number remains on screen
for 10 seconds and can be printed again with `Повторить печать` during that
time; it does not create a second ticket.

The desktop header includes the university logo, current local time, and a
`Қазақша` / `Русский` / `English` interface switch.

For initial setup set `FullScreen=false`, verify the server address and print
one ticket. Switch it back to `true` for kiosk operation. Use `Alt+F4` to close
the terminal.
