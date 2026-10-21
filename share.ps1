param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$tunnelExecutable = Join-Path $projectDirectory 'tools\cloudflared.exe'
$tunnelPidFile = Join-Path $projectDirectory 'data\tunnel.pid'
$tunnelLogFile = Join-Path $projectDirectory 'data\tunnel-stderr.log'
$shareUrlFile = Join-Path $projectDirectory 'data\share-url.txt'

& (Join-Path $projectDirectory 'start.ps1') -NoBrowser
if (-not (Test-Path -LiteralPath $tunnelExecutable)) {
    throw 'Missing tools\cloudflared.exe. See SHARING.md.'
}

$existingTunnel = $null
if (Test-Path -LiteralPath $tunnelPidFile) {
    $savedTunnelId = 0
    if ([int]::TryParse((Get-Content -LiteralPath $tunnelPidFile -Raw).Trim(), [ref]$savedTunnelId)) {
        $candidateProcess = Get-Process -Id $savedTunnelId -ErrorAction SilentlyContinue
        if ($candidateProcess -and $candidateProcess.Path -eq $tunnelExecutable) {
            $existingTunnel = $candidateProcess
        }
    }
}

if (-not $existingTunnel) {
    $existingTunnel = Start-Process -FilePath $tunnelExecutable -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:8766', '--protocol', 'http2', '--no-autoupdate') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'data\tunnel-stdout.log') -RedirectStandardError $tunnelLogFile -PassThru
    $existingTunnel.Id | Set-Content -LiteralPath $tunnelPidFile
    # Clear an expired address before waiting for this tunnel's new address.
    Set-Content -LiteralPath $shareUrlFile -Value ''
}

$shareUrl = ''
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($existingTunnel.HasExited) {
        throw 'The sharing connection stopped. Check data\tunnel-stderr.log.'
    }
    if (Test-Path -LiteralPath $tunnelLogFile) {
        $tunnelLog = Get-Content -LiteralPath $tunnelLogFile -Raw
        $shareUrl = [regex]::Match([string]$tunnelLog, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
        if ($shareUrl) { break }
    }
    Start-Sleep -Milliseconds 500
}
if (-not $shareUrl) { throw 'No sharing URL received yet. Try again shortly or check data\tunnel-stderr.log.' }
$shareUrl | Set-Content -LiteralPath $shareUrlFile
Write-Output "Share this address: $shareUrl"
Write-Output 'Keep this computer awake and online. A new tunnel receives a new address.'
if (-not $NoBrowser) { Start-Process $shareUrl }
