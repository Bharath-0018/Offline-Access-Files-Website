try {
    $boundary = [System.Guid]::NewGuid().ToString()
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"reqtype`"",
        "",
        "fileupload",
        "--$boundary",
        "Content-Disposition: form-data; name=`"time`"",
        "",
        "72h",
        "--$boundary",
        "Content-Disposition: form-data; name=`"fileToUpload`"; filename=`"test_movie.txt`"",
        "Content-Type: text/plain",
        "",
        "Hello from Litterbox Cloud!",
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"
    $headers = @{
        "Content-Type" = "multipart/form-data; boundary=$boundary"
        "User-Agent" = "Mozilla/5.0"
        "Origin" = "https://offline-access-files-website.vercel.app"
    }
    $res = Invoke-RestMethod -Uri "https://litterbox.catbox.moe/resources/internals/api.php" -Method Post -Headers $headers -Body $body
    Write-Host "LITTERBOX DIRECT URL: $res"
} catch {
    Write-Host "Litterbox error: $($_.Exception.Message)"
}
