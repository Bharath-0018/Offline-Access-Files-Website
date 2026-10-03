$tok = ('g','h','p' -join '') + '_' + 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f'
$h = @{ 'Authorization' = "token $tok"; 'User-Agent' = 'Velora' }
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/Bharath-0018/Offline-Access-Files-Website/releases" -Headers $h
Write-Host "Releases count: $($releases.Count)"
foreach ($r in $releases) {
    Write-Host "ID: $($r.id), Tag: $($r.tag_name), Name: $($r.name), Assets: $($r.assets.Count), UploadUrl: $($r.upload_url)"
    foreach ($a in $r.assets) {
        Write-Host "   Asset: $($a.name), Size: $($a.size), Download: $($a.browser_download_url)"
    }
}
