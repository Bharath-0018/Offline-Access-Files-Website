# PowerShell launcher for AetherDrop
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "       AETHERDROP - OFFLINE PERSONAL CLOUD & FILE SHARING" -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Zero-Internet Local Network Storage and P2P Streaming Engine" -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

if (Get-Command agy-node -ErrorAction SilentlyContinue) {
    agy-node server.js
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    node server.js
} else {
    Write-Host "Node.js executable not found in PATH." -ForegroundColor Red
}
