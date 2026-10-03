try {
    # 1. Get best server
    $srvRes = Invoke-RestMethod -Uri "https://api.gofile.io/servers"
    Write-Host "Server status: $($srvRes.status)"
    $server = $srvRes.data.servers[0].name
    Write-Host "Best server: $server"

    # 2. Test upload
    $uploadUri = "https://$server.gofile.io/contents/uploadfile"
    Write-Host "Upload URI: $uploadUri"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
