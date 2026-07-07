# Deploys the Temporal Web UI behind an nginx Basic-Auth sidecar. The Basic Auth credential is
# pulled from Key Vault (basic-auth-user / basic-auth-password, created by setup-basic-auth.ps1)
# and injected into the nginx config as the expected "Basic <base64>" header.
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$KeyVault = 'kv-sparkdemo',
    [string]$EnvironmentName = 'cae-spark-demo',
    [string]$Location = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    # Ensure the credential exists.
    & "$PSScriptRoot\setup-basic-auth.ps1" -KeyVault $KeyVault | Out-Null

    $user = az keyvault secret show --vault-name $KeyVault -n basic-auth-user --query value -o tsv
    $pass = az keyvault secret show --vault-name $KeyVault -n basic-auth-password --query value -o tsv
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${pass}"))
    $expected = "Basic $b64"

    $conf = (Get-Content -Raw infra/temporal-ui.nginx.conf.template).Replace('__BASIC_AUTH_EXPECTED__', $expected)

    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{ nginxConf = @{ value = $conf }; environmentName = @{ value = $EnvironmentName } }
    }
    if ($Location) { $p.parameters.location = @{ value = $Location } }
    $pf = Join-Path $env:TEMP 'temporal-ui-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8

    Write-Host "== Deploying temporal-ui (Basic Auth) =="
    $url = az deployment group create -g $ResourceGroup -n temporal-ui `
        --template-file infra/temporal-ui.bicep --parameters "@$pf" `
        --query "properties.outputs.url.value" -o tsv
    Remove-Item $pf -Force

    Write-Host ""
    Write-Host "Temporal Web UI (Basic Auth):"
    Write-Host "  URL      = $url"
    Write-Host "  user     = $user"
    Write-Host "  password : az keyvault secret show --vault-name $KeyVault -n basic-auth-password --query value -o tsv"
}
finally {
    Pop-Location
}
