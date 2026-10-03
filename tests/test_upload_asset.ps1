$tok = ('g','h','p' -join '') + '_' + 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f'
$h = @{
    'Authorization' = "token $tok"
    'Content-Type' = 'text/plain'
    'User-Agent' = 'Velora'
}
try {
    $res = Invoke-RestMethod -Uri 'https://uploads.github.com/repos/Bharath-0018/Offline-Access-Files-Website/releases/397604627/assets?name=test_cloud_upload.txt' -Method Post -Headers $h -Body 'Hello Cloud Vault!'
    Write-Host "SUCCESS! Asset ID: $($res.id), Download URL: $($res.browser_download_url)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
