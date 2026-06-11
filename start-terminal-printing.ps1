param(
    [string]$Url = "http://192.168.115.12:5173/",
    [ValidateSet("Auto", "Edge", "Chrome")]
    [string]$Browser = "Auto"
)

$browserCandidates = @()

if ($Browser -eq "Auto" -or $Browser -eq "Edge") {
    $browserCandidates += @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
    )
}

if ($Browser -eq "Auto" -or $Browser -eq "Chrome") {
    $browserCandidates += @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    )
}

$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $browserPath) {
    throw "Microsoft Edge or Google Chrome was not found. Install one of these browsers and try again."
}

$profilePath = Join-Path $env:LocalAppData "QueueTerminal\BrowserProfile"
$arguments = @(
    "--kiosk",
    "--kiosk-printing",
    "--edge-kiosk-type=fullscreen",
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--user-data-dir=$profilePath",
    $Url
)

Start-Process -FilePath $browserPath -ArgumentList $arguments
