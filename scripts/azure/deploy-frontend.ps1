# Builds and deploys the SPARK demo frontend (SPA + /api gateway) to Azure Container Apps.
# Injects the gateway auth token (test-user Keycloak bearer) from Key Vault so backend
# calls carry a real identity under optional_verify_dry_run.
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$KeyVault = 'kv-sparkdemo',
    [string]$Acr = 'acrsparkdemo',
    [string]$ImageTag = '0.2'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    $img = "$Acr.azurecr.io/frontend:$ImageTag"
    Write-Host "== Building $img =="
    docker build --provenance=false -t $img -f 01-frontend/frontend/Dockerfile.azure 01-frontend/frontend | Select-Object -Last 1

    Write-Host "== Pushing =="
    az acr login -n $Acr | Out-Null
    docker push $img | Select-Object -Last 1

    Write-Host "== Deploying frontend =="
    $token = az keyvault secret show --vault-name $KeyVault -n gateway-auth-token --query value -o tsv
    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{
            imageTag         = @{ value = $ImageTag }
            revisionSuffix   = @{ value = ("r" + (Get-Date -Format 'MMddHHmmss')) }
            gatewayAuthToken = @{ value = $token }
        }
    }
    $pf = Join-Path $env:TEMP 'frontend-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8
    $url = az deployment group create -g $ResourceGroup -n frontend `
        --template-file infra/frontend.bicep --parameters "@$pf" `
        --query "properties.outputs.url.value" -o tsv
    Remove-Item $pf -Force
    Write-Host "Frontend URL: $url/app/"
}
finally {
    Pop-Location
}
