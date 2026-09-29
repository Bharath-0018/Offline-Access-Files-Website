@echo off
title Velora - Push Updates to GitHub
echo ====================================================================
echo             VELORA - PUSH COMMITS TO GITHUB REPOSITORY
echo       Target: https://github.com/Bharath-0018/Offline-Access-Files-Website
echo ====================================================================
echo.

set GIT_EXE=C:\Users\VSB\min_git\cmd\git.exe
if not exist "%GIT_EXE%" (
    set GIT_EXE=git
)

echo Checking Git status...
"%GIT_EXE%" log -n 1 --oneline
echo.
echo All changes have already been committed locally on branch 'main'.
echo.
echo Please choose an option:
echo   [1] Push using GitHub Personal Access Token (PAT)
echo   [2] Push via GitHub Browser Login (Git Credential Manager)
echo.
set /p CHOICE="Enter option (1 or 2): "

if "%CHOICE%"=="1" (
    echo.
    set /p TOKEN="Enter your GitHub Personal Access Token (PAT): "
    if "%TOKEN%"=="" (
        echo Token cannot be empty.
        pause
        exit /b 1
    )
    echo Pushing to GitHub with token...
    "%GIT_EXE%" push https://Bharath-0018:%TOKEN%@github.com/Bharath-0018/Offline-Access-Files-Website.git main
) else (
    echo.
    echo Pushing to GitHub... (A browser window or login prompt may appear)
    "%GIT_EXE%" push origin main
)

echo.
if %ERRORLEVEL% EQU 0 (
    echo ====================================================================
    echo [SUCCESS] Your Velora changes are now live on GitHub!
    echo URL: https://github.com/Bharath-0018/Offline-Access-Files-Website
    echo ====================================================================
) else (
    echo ====================================================================
    echo [NOTE] Push failed. Please verify your token has 'repo' write access.
    echo ====================================================================
)

echo.
pause
