@echo off
:: ============================================
:: RemoteDesk - Quick Start Script
:: Run this to start the server + Cloudflare Tunnel
:: ============================================

title RemoteDesk Server

set NODE="C:\Program Files\nodejs\node.exe"
set CLOUDFLARED="C:\Program Files (x86)\cloudflared\cloudflared.exe"
set PROJECT=%~dp0

echo.
echo  ============================================
echo   RemoteDesk - Starting...
echo  ============================================
echo.

:: Start Node.js server in background
echo [1/2] Starting Node.js server on port 3000...
start "RemoteDesk Server" cmd /k "cd /d %PROJECT% && %NODE% server.js"
timeout /t 2 /nobreak >nul

:: Check if cloudflared is configured with a named tunnel
if exist "%APPDATA%\cloudflared\config.yml" (
    echo [2/2] Starting Cloudflare Tunnel with your domain...
    start "Cloudflare Tunnel" cmd /k "%CLOUDFLARED% tunnel run remotedesk"
) else (
    echo [2/2] Starting temporary Cloudflare Tunnel (no domain configured yet)...
    echo       Run setup-tunnel.bat first to link your domain!
    start "Cloudflare Tunnel" cmd /k "%CLOUDFLARED% tunnel --url http://localhost:3000"
)

echo.
echo  Server is running! Open:
echo    Local:  http://localhost:3000
echo    Remote: Check the Cloudflare Tunnel window for your public URL
echo.
pause
