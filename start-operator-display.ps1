param(
    [string]$Url = "",
    [ValidateSet("Auto", "Edge", "Chrome")]
    [string]$Browser = "",
    [int]$MonitorIndex = 0,
    [ValidateSet("Kiosk", "Fullscreen")]
    [string]$Mode = "",
    [string]$ProfilePath = ""
)

$configPath = Join-Path $PSScriptRoot "operator-display.config"
$config = @{
    Url = "http://localhost:5173/ru/admin/operator-display?fullscreen=1"
    Browser = "Auto"
    MonitorIndex = "2"
    Mode = "Kiosk"
    ProfilePath = ""
}

if (Test-Path -LiteralPath $configPath) {
    foreach ($rawLine in Get-Content -LiteralPath $configPath -Encoding UTF8) {
        $line = $rawLine.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            continue
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }

        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($config.ContainsKey($key)) {
            $config[$key] = $value
        }
    }
}

if (-not $Url) {
    $Url = $config.Url
}

if (-not $Browser) {
    $Browser = $config.Browser
}

if ($MonitorIndex -le 0) {
    [int]$MonitorIndex = $config.MonitorIndex
}

if (-not $Mode) {
    $Mode = $config.Mode
}

if (-not $ProfilePath) {
    $ProfilePath = $config.ProfilePath
}

if (-not $ProfilePath) {
    $ProfilePath = Join-Path $env:LocalAppData "QueueOperatorDisplay\BrowserProfile"
}

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

Add-Type -AssemblyName System.Windows.Forms

$screens = [System.Windows.Forms.Screen]::AllScreens
if ($screens.Count -eq 0) {
    throw "No displays were detected."
}

$orderedScreens = @($screens | Sort-Object -Property @{ Expression = { if ($_.Primary) { 0 } else { 1 } } }, @{ Expression = { $_.Bounds.X } }, @{ Expression = { $_.Bounds.Y } })
$targetScreen = $null

if ($MonitorIndex -ge 1 -and $MonitorIndex -le $orderedScreens.Count) {
    $targetScreen = $orderedScreens[$MonitorIndex - 1]
}

if (-not $targetScreen) {
    $targetScreen = ($orderedScreens | Where-Object { -not $_.Primary } | Select-Object -First 1)
}

if (-not $targetScreen) {
    $targetScreen = [System.Windows.Forms.Screen]::PrimaryScreen
}

$bounds = $targetScreen.Bounds
New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null

$arguments = @(
    "--new-window",
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--window-position=$($bounds.X),$($bounds.Y)",
    "--window-size=$($bounds.Width),$($bounds.Height)",
    "--user-data-dir=$ProfilePath"
)

if ($Mode -eq "Kiosk") {
    $arguments += @(
        "--kiosk",
        "--edge-kiosk-type=fullscreen",
        $Url
    )
} else {
    $arguments += @(
        "--start-fullscreen",
        $Url
    )
}

Start-Process -FilePath $browserPath -ArgumentList $arguments
