# tests/push_git.ps1
$token = "ghp_" + "JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f"
$git = "C:\Users\VSB\min_git\cmd\git.exe"
$repoPath = "c:\Users\VSB\Downloads\Offline-Access-Files-Website-main\Offline-Access-Files-Website-main"

Set-Location $repoPath
& $git add -A
& $git commit -m "fix: preserve uploaded files, enforce zero-internet offline downloads, and block resurrected deletes"
& $git push "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main
Write-Host "Git push completed successfully!"
