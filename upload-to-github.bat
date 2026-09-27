@echo off
title GitHub Clean & Sync
echo ====================================================================
echo             GITHUB REPOSITORY CLEAN & SYNC
echo ====================================================================
echo  Target: https://github.com/Bharath-0018/Offline-Access-Files-Website
echo  Action: Removes Vercel/Render files & updates clean project files
echo ====================================================================
echo.
echo If you need a GitHub Personal Access Token:
echo 1. Open: https://github.com/settings/tokens/new
echo 2. Set Note: "Clean Sync"
echo 3. Check the "repo" box
echo 4. Click "Generate token" and copy it
echo.
set /p GITHUB_TOKEN="Paste your GitHub Personal Access Token here: "

if "%GITHUB_TOKEN%"=="" (
    echo Token cannot be empty.
    pause
    exit /b
)

agy-node push_to_github.js %GITHUB_TOKEN%

pause
