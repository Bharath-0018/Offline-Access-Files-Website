$token = "ghp_" + "JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f"
$git = "C:\Users\VSB\min_git\cmd\git.exe"
$repoPath = "c:\Users\VSB\Downloads\Offline-Access-Files-Website-main\Offline-Access-Files-Website-main"

Set-Location $repoPath
& $git add data/cloud_registry.json
$env:GIT_EDITOR = "true"
& $git rebase --continue
& $git push "https://$($token)@github.com/Bharath-0018/Offline-Access-Files-Website.git" main
Write-Host "Rebase and push finished successfully!"
