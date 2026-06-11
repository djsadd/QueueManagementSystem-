# Queue Operator CRM Desktop

Electron + React + Tailwind CSS desktop app for the operator workstation. The
React UI talks to FastAPI through Electron IPC, so it works with the current
backend without browser CORS changes.

## Install

```cmd
cd operator-desktop
npm install
```

## Develop

```cmd
npm run dev
```

## Configure

Edit `operator-desktop\bin\operator.config`:

```ini
ApiBaseUrl=http://192.168.115.12/api
DisplayUrl=http://192.168.115.12/ru/admin/operator-display?fullscreen=1
MonitorIndex=2
DisplayMode=Kiosk
DisplayScale=0.9
DisplayAutoFit=true
FullScreen=false
RefreshSeconds=5
Browser=Auto
RememberEmail=true
```

`ApiBaseUrl` points to FastAPI. `DisplayUrl` points to the frontend operator
display page used on the customer monitor.

`DisplayScale` controls the second monitor zoom. `DisplayAutoFit=true` lowers
that zoom automatically on smaller screens so the ticket page does not crop.

If `bin\operator.config` does not exist, `build.cmd` creates it from
`operator.config.example`.

## Build

```cmd
cd operator-desktop
build.cmd
```

Output:

```text
operator-desktop\dist
operator-desktop\dist-electron
```

To create a portable Windows package:

```cmd
npm run package
```

## Run

From the repository root:

```cmd
start-operator-crm.cmd
```

The app opens login, "Мое окно", "Профиль", and a button to launch the second
display on the configured monitor.
