try {
    $boundary = [System.Guid]::NewGuid().ToString()
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test_movie.txt`"",
        "Content-Type: text/plain",
        "",
        "Hello from File.io Cloud Storage!",
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"
    $headers = @{
        "Content-Type" = "multipart/form-data; boundary=$boundary"
        "User-Agent" = "Mozilla/5.0"
        "Origin" = "https://offline-access-files-website.vercel.app"
    }
    $res = Invoke-RestMethod -Uri "https://file.io" -Method Post -Headers $headers -Body $body
    Write-Host "FILE.IO SUCCESS:"
    $res | ConvertTo-Json
    Write-Host "DOWNLOAD LINK: $($res.link)"
} catch {
    Write-Host "File.io error: $($_.Exception.Message)"
}
