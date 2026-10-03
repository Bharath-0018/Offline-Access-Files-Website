try {
    $res = Invoke-RestMethod -Uri "https://transfer.sh/velora_test.txt" -Method Put -Body "Hello from Velora Transfer.sh Cloud!"
    Write-Host "TRANSFER.SH URL: $res"
} catch {
    Write-Host "Transfer.sh error: $($_.Exception.Message)"
}
