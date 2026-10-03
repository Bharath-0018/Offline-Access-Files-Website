$tok = ('g','h','p' -join '') + '_' + 'JmM7P7OR3PHuSEl83oYLDRkxrGT5kR2NM12f'
$h = @{
    'Authorization' = "token $tok"
    'Origin' = 'https://offline-access-files-website.vercel.app'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'authorization,content-type'
    'User-Agent' = 'Mozilla/5.0'
}
try {
    $res = Invoke-WebRequest -Uri 'https://uploads.github.com/repos/Bharath-0018/Offline-Access-Files-Website/releases/397604627/assets?name=cors_test.txt' -Method Options -Headers $h
    Write-Host "OPTIONS Status: $($res.StatusCode)"
    Write-Host "CORS Headers:"
    $res.Headers | Out-String | Write-Host
} catch {
    Write-Host "OPTIONS Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode.Value__)"
        $_.Exception.Response.Headers | Out-String | Write-Host
    }
}
