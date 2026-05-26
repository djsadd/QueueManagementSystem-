# Silent ticket printing on the terminal

The ticket page already calls `window.print()` immediately after a ticket is
created. A regular browser always shows its print dialog. For terminal use,
start Chromium in kiosk printing mode:

```powershell
.\start-terminal-printing.cmd
```

The launcher opens `http://localhost:5173/` in Microsoft Edge or Google Chrome
with:

- `--kiosk` for the full-screen terminal window;
- `--kiosk-printing` to send `window.print()` directly to printing;
- a separate browser profile so a normally opened browser does not discard
  the kiosk flags.

Before putting the terminal into service:

1. Install and set the `Custom VKP 80` printer as the Windows default printer.
2. Configure its 80 mm paper form in the Windows printer settings.
3. Start the website/backend, then run `start-terminal-printing.cmd`.
4. Print one test ticket and verify its size and paper feed.

To select a browser explicitly:

```powershell
.\start-terminal-printing.ps1 -Browser Edge
.\start-terminal-printing.ps1 -Browser Chrome
```

To use a different local URL:

```powershell
.\start-terminal-printing.ps1 -Url "http://localhost/"
```
