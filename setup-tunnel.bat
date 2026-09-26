@echo off
:: ============================================
:: RemoteDesk - Cloudflare Tunnel Setup
:: Run this ONCE to link your custom domain
:: ============================================
title Cloudflare Tunnel Setup

set CLOUDFLARED="C:\Program Files (x86)\cloudflared\cloudflared.exe"

echo.
echo  ============================================
echo   RemoteDesk - Cloudflare Tunnel Setup
echo  ============================================
echo.
echo  This will link your custom domain to RemoteDesk.
echo  You need a Cloudflare account with your domain added.
echo.

:: Step 1: Login to Cloudflare
echo [Step 1] Logging in to Cloudflare...
echo  A browser window will open. Login and authorize the tunnel.
echo.
%CLOUDFLARED% tunnel login
echo.

:: Step 2: Create a named tunnel
echo [Step 2] Creating tunnel named "remotedesk"...
%CLOUDFLARED% tunnel create remotedesk
echo.

:: Step 3: Ask for domain
echo [Step 3] Enter your subdomain (e.g. rs.yourdomain.com):
set /p DOMAIN="Domain: "
echo.

:: Step 4: Create DNS route
echo [Step 4] Creating DNS CNAME for %DOMAIN%...
%CLOUDFLARED% tunnel route dns remotedesk %DOMAIN%
echo.

:: Step 5: Create config file
echo [Step 5] Writing tunnel config...
if not exist "%APPDATA%\cloudflared" mkdir "%APPDATA%\cloudflared"

for /f "tokens=1" %%i in ('%CLOUDFLARED% tunnel list ^| findstr remotedesk') do set TUNNEL_ID=%%i

(
echo tunnel: %TUNNEL_ID%
echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json
echo.
echo ingress:
echo   - hostname: %DOMAIN%
echo     service: http://localhost:3000
echo   - service: http_status:404
) > "%APPDATA%\cloudflared\config.yml"

echo.
echo  ============================================
echo   Setup complete!
echo   Your domain: https://%DOMAIN%
echo   Now run start.bat to launch RemoteDesk
echo  ============================================
echo.
pause
