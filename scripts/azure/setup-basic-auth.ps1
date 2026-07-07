# Generates the demo Basic Auth credential and stores it in Key Vault (idempotent).
# The frontend and minio-public gateways gate public access behind this credential;
# pull it from Key Vault to access the demo:
#   az keyvault secret show --vault-name kv-sparkdemo -n basic-auth-password --query value -o tsv
param(
    [string]$KeyVault = 'kv-sparkdemo',
    [string]$User = 'spark'
)
$ErrorActionPreference = 'Stop'

$existing = az keyvault secret show --vault-name $KeyVault -n basic-auth-password --query value -o tsv 2>$null
if (-not $existing) {
    $bytes = New-Object 'byte[]' 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = ([Convert]::ToBase64String($bytes)) -replace '[^A-Za-z0-9]', ''
    while ($pw.Length -lt 24) { $pw += 'x' }
    $pw = $pw.Substring(0, 24)
    az keyvault secret set --vault-name $KeyVault -n basic-auth-password --value $pw --only-show-errors --query name -o tsv | Out-Null
    Write-Host "generated basic-auth-password"
}
else {
    Write-Host "basic-auth-password already exists (kept)"
}
az keyvault secret set --vault-name $KeyVault -n basic-auth-user --value $User --only-show-errors --query name -o tsv | Out-Null

$pw = az keyvault secret show --vault-name $KeyVault -n basic-auth-password --query value -o tsv
Write-Host ""
Write-Host "Basic Auth credential (stored in Key Vault '$KeyVault'):"
Write-Host "  user     = $User"
Write-Host "  password = $pw"
