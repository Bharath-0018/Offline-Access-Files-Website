@echo off
title Velora Cloud - 5 Friends Worldwide Access (Dindigul ^<--^> Coimbatore)
color 0b
cls
echo ===============================================================================
echo       VELORA PERSONAL CLOUD - LONG DISTANCE ACCESS (5 FRIENDS SYNC)
echo ===============================================================================
echo.
echo  Location 1: Dindigul (Your PC)
echo  Location 2: Coimbatore (Your 5 Friends' PCs / Mobiles)
echo.
echo  Step 1: Starting local Velora Cloud Server on Port 3000...
start /b "" agy-node server.js 2>nul || start /b "" node server.js 2>nul
timeout /t 3 >nul

echo  Step 2: Connecting to Worldwide HTTPS Tunnel (pinggy.io / localhost.run)...
echo.
echo  ===============================================================================
echo   SHARE THE HTTPS URL SHOWN BELOW WITH UP TO 5 FRIENDS IN COIMBATORE:
echo   Your friends just need to open that link and login with your Email ^& Password!
echo  ===============================================================================
echo.

ssh -p 443 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R0:localhost:3000 a.pinggy.io
if errorlevel 1 (
    echo.
    echo Pinggy tunnel ended. Trying backup tunnel (localhost.run)...
    ssh -R 80:localhost:3000 -o StrictHostKeyChecking=no nokey@localhost.run
)

pause
