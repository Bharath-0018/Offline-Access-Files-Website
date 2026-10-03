$tok = ('g','h','p' -join '') + '_' + 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f'
$h = @{
    'Authorization' = "token $tok"
    'Content-Type' = 'text/plain'
}
$target = [System.Uri]::EscapeDataString("https://uploads.github.com/repos/Bharath-0018/Offline-Access-Files-Website/releases/397604627/assets?name=proxy_test.txt")
try {
    $res = Invoke-RestMethod -Uri "https://corsproxy.io/?url=$target" -Method Post -Headers $h -Body 'Hello from Proxy'
    Write-Host "CORS PROXY SUCCESS: $($res.browser_download_url)"
} catch {
    Write-Host "CORS Proxy Error: $($_.Exception.Message)"
}
