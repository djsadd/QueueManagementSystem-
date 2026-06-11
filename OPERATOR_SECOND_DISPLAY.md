# Operator second display launcher

This launcher opens the operator display page on the second monitor in fullscreen
or kiosk mode. It is intended for the operator workstation.

## Configure

Copy the example config:

```cmd
copy operator-display.config.example operator-display.config
```

Edit `operator-display.config`:

```ini
Url=http://192.168.115.12:5173/ru/admin/operator-display?fullscreen=1
Browser=Auto
MonitorIndex=2
Mode=Kiosk
ProfilePath=
```

Use the frontend address in `Url`, not the FastAPI backend address.

`MonitorIndex=2` selects the first non-primary display. If Windows reports the
monitors in a different order, set it to `1`, `2`, `3`, etc.

`Mode=Kiosk` hides browser UI. Use `Mode=Fullscreen` during setup if you need
normal browser controls.

The launcher uses a dedicated browser profile by default:

```text
%LOCALAPPDATA%\QueueOperatorDisplay\BrowserProfile
```

The operator may need to sign in once in that profile. The login then persists.

## Run

```cmd
start-operator-display.cmd
```

## Start with Windows

Press `Win + R`, open:

```text
shell:startup
```

Create a shortcut to `start-operator-display.cmd` in that folder.

## Notes

Browser security rules do not allow a normal web page to open and place a window
on a second monitor without user interaction. This launcher runs locally on
Windows and can pass the monitor coordinates directly to Edge or Chrome.
