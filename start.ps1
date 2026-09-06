$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$previewUrl = 'http://127.0.0.1:4318/'
try {
    $health = Invoke-RestMethod -Uri ($previewUrl + 'api/health') -TimeoutSec 2
    if ($health.status -eq 'ok') { Write-Output $previewUrl; exit 0 }
} catch { }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$arguments = @()
if (Test-Path (Join-Path $projectDirectory '.env')) { $arguments += '--env-file=.env' }
$arguments += 'server/index.mjs'
$serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $arguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'artifacts/server.log') -RedirectStandardError (Join-Path $projectDirectory 'artifacts/server-error.log') -PassThru
$serverProcess.Id | Set-Content -LiteralPath (Join-Path $projectDirectory 'artifacts/server.pid')
for ($attempt=0; $attempt -lt 20; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri ($previewUrl + 'api/health') -TimeoutSec 1
        if ($health.status -eq 'ok') { Write-Output $previewUrl; exit 0 }
    } catch { }
    Start-Sleep -Milliseconds 250
}
throw 'Preview server did not become ready. See artifacts/server-error.log.'
