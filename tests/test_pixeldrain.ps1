try {
    $res = Invoke-RestMethod -Uri 'https://pixeldrain.com/api/file/test_movie.txt' -Method Put -Body 'Hello Velora Cloud!'
    Write-Host "Pixeldrain response: $($res | ConvertTo-Json)"
    $id = $res.id
    Write-Host "Download URL: https://pixeldrain.com/api/file/$id"
} catch {
    Write-Host "Pixeldrain error: $($_.Exception.Message)"
}
