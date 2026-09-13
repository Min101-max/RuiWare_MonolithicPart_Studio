@echo off
setlocal

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
if errorlevel 1 (
    echo RuiWare 启动失败，请查看 api.err.log 或 web.err.log
    pause
    exit /b 1
)
start "" "http://127.0.0.1:5173"

endlocal
