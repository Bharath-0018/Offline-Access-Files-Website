# tests/push_git.ps1
$token = "ghp_" + "JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f"
$git = "C:\Users\VSB\min_git\cmd\git.exe"
$repoPath = "c:\Users\VSB\Downloads\Offline-Access-Files-Website-main\Offline-Access-Files-Website-main"

Set-Location $repoPath
& $git add -A
& $git commit -m "chore: include push script"
& $git pull --rebase "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main
& $git push "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main
Write-Host "Git rebase & push completed successfully!"
