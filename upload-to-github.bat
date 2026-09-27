@echo off
title Velora GitHub Publisher
echo ====================================================================
echo             VELORA GITHUB REPOSITORY AUTO-PUBLISHER
echo ====================================================================
echo  Target: https://github.com/Bharath-0018/Velora
echo ====================================================================
echo.
echo If you don't have a GitHub Personal Access Token yet:
echo 1. Open: https://github.com/settings/tokens/new
echo 2. Set Note: "Velora Deploy"
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
