@echo off
title Velora - Personal Cloud & Pendrive-Style File System
echo ====================================================================
echo        VELORA - PERSONAL CLOUD & PENDRIVE-STYLE FILE SYSTEM
echo ====================================================================
echo  Persistent Server Storage & Multi-Device Sync + LAN Offline Mode
echo ====================================================================
echo.

WHERE agy-node >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    agy-node server.js
) ELSE (
    node server.js
)

pause
