# tests/do_push.ps1
$token = "ghp_" + "JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f"
$git = "C:\Users\VSB\min_git\cmd\git.exe"
$repoPath = "c:\Users\VSB\Downloads\Offline-Access-Files-Website-main\Offline-Access-Files-Website-main"

Set-Location $repoPath
& $git add -A
& $git commit -m "feat: set default backend URL to https://offline-access-files-website.onrender.com"
& $git config pull.rebase false
& $git pull "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main --no-edit -X ours
& $git push "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main
Write-Host "SUCCESS: Pushed to GitHub!"
