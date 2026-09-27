@echo off
title AetherDrop - Offline Personal Cloud & Local File Sharing
echo ====================================================================
echo        AETHERDROP - OFFLINE PERSONAL CLOUD & FILE SHARING
echo ====================================================================
echo  Zero-Internet Local Network Storage and P2P Streaming Engine
echo ====================================================================
echo.

WHERE agy-node >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    agy-node server.js
) ELSE (
    node server.js
)

pause
