$token = "pVswVyzEUyE1JuHUhNoIzCRgPxAiuHMe"
$contentId = "3208b127-f16c-40e3-87f1-8faa7357073e"
$headers = @{
    "Authorization" = "Bearer $token"
}
try {
    $res = Invoke-RestMethod -Uri "https://api.gofile.io/contents/$contentId" -Headers $headers
    Write-Host "STATUS: $($res.status)"
    $res.data | ConvertTo-Json
    Write-Host "DIRECT LINK: $($res.data.link)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
