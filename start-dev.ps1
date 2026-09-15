param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173,
    [string]$MaterialDatabase = $env:RUIWARE_MATERIAL_DB
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExecutable = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $PythonExecutable)) {
    throw 'Missing .venv. Install the Python dependencies described in README.md first.'
}

if (-not $MaterialDatabase) {
    $materialCandidates = @(
        (Join-Path $ProjectRoot 'ruiware.db'),
        (Join-Path (Split-Path -Parent $ProjectRoot) 'debug\debug\ruiware.db'),
        (Join-Path (Split-Path -Parent (Split-Path -Parent $ProjectRoot)) 'debug\debug\ruiware.db')
    )
    $MaterialDatabase = $materialCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}
if ($MaterialDatabase) {
    $env:RUIWARE_MATERIAL_DB = (Resolve-Path -LiteralPath $MaterialDatabase).Path
}

$BunExecutable = $null
$bunCandidates = @(
    (Get-Command bun.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe'),
    (Join-Path $env:USERPROFILE '.bun\bin\bun.exe')
)
foreach ($candidate in $bunCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $BunExecutable = $candidate
        break
    }
}
$NodeExecutable = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if (-not $NodeExecutable) {
    $runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $runtimeNode) { $NodeExecutable = $runtimeNode }
}
$ViteCli = Get-ChildItem (Join-Path $ProjectRoot 'apps\studio-web\node_modules\.pnpm') -Directory -Filter 'vite@*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'node_modules\vite\bin\vite.js' } |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $BunExecutable -and -not ($NodeExecutable -and $ViteCli)) {
    throw 'Missing Bun/Node/Vite. Install Bun or Node dependencies first.'
}

$apiCommand = '"{0}" -m uvicorn app.main:app --app-dir services/template-api --host 127.0.0.1 --port {1} 1>"{2}" 2>"{3}"' -f `
    $PythonExecutable, $ApiPort, (Join-Path $ProjectRoot 'api.out.log'), (Join-Path $ProjectRoot 'api.err.log')
cmd.exe /d /c "cd /d `"$ProjectRoot`" && start `"RuiWare Template API`" /b $apiCommand"

if ($BunExecutable -and (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    $WebWorkingDirectory = $ProjectRoot
} else {
    $WebWorkingDirectory = Join-Path $ProjectRoot 'apps\studio-web'
}
$webCommand = if ($BunExecutable) {
    '"{0}" --cwd apps/studio-web dev --host 127.0.0.1 --port {1}' -f $BunExecutable, $WebPort
} else {
    '"{0}" "{1}" dev --host 127.0.0.1 --port {2}' -f $NodeExecutable, $ViteCli, $WebPort
}
$webCommand = '{0} 1>"{1}" 2>"{2}"' -f $webCommand, (Join-Path $ProjectRoot 'web.out.log'), (Join-Path $ProjectRoot 'web.err.log')
cmd.exe /d /c "cd /d `"$WebWorkingDirectory`" && start `"RuiWare Template Studio`" /b $webCommand"

Write-Host "Template API: http://127.0.0.1:$ApiPort"
Write-Host "Template Studio: http://127.0.0.1:$WebPort"
Write-Host "Material database: $($env:RUIWARE_MATERIAL_DB)"
