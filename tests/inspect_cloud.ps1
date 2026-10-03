$owner = "Bharath-0018"
$repo = "Offline-Access-Files-Website"
$t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$regUrl = "https://raw.githubusercontent.com/$owner/$repo/main/data/cloud_registry.json?t=$t"
$reg = Invoke-RestMethod -Uri $regUrl
Write-Host "--- DELETED NAMES ON GITHUB ---"
$reg.deleted_names | ConvertTo-Json
Write-Host "--- DELETED IDS ON GITHUB ---"
$reg.deleted_ids | ConvertTo-Json
