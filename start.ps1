param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$port = 8766
$url = "http://127.0.0.1:$port"
$alreadyRunning = $false
try {
    $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
    $alreadyRunning = $health.ok -eq $true -and $health.app -eq 'wordroom'
} catch {}
if (-not $alreadyRunning) {
    $pythonExecutable = (Get-Command python -ErrorAction Stop).Source
    Start-Process -FilePath $pythonExecutable -ArgumentList @('-X', 'utf8', 'app.py', '--port', "$port") -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'data\server.log') -RedirectStandardError (Join-Path $projectDirectory 'data\server-error.log')
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 1
            if ($health.ok -and $health.app -eq 'wordroom') { $alreadyRunning = $true; break }
        } catch {}
    }
}
if (-not $alreadyRunning) { throw 'The dictionary could not start. Please check data\server-error.log.' }
if (-not $NoBrowser) { Start-Process $url }
