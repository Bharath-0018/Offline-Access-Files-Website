try {
    $srvRes = Invoke-RestMethod -Uri "https://api.gofile.io/servers"
    $server = $srvRes.data.servers[0].name
    $uploadUri = "https://$server.gofile.io/contents/uploadfile"

    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.Text.Encoding]::UTF8.GetBytes("Test Movie Content from Velora Cloud!")
    $fileName = "velora_test.txt"

    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: text/plain",
        "",
        "Test Movie Content from Velora Cloud!",
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"

    $headers = @{
        "Content-Type" = "multipart/form-data; boundary=$boundary"
        "User-Agent" = "Mozilla/5.0"
        "Origin" = "https://offline-access-files-website.vercel.app"
    }

    $res = Invoke-RestMethod -Uri $uploadUri -Method Post -Headers $headers -Body $body
    Write-Host "GOFILE UPLOAD SUCCESS:"
    $res | ConvertTo-Json
    $downloadPage = $res.data.downloadPage
    Write-Host "Download Page: $downloadPage"
    Write-Host "Direct Link: $($res.data.directLink)"
} catch {
    Write-Host "Gofile upload error: $($_.Exception.Message)"
}
