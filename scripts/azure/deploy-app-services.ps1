# Deploys the SPARK app-tier to Azure Container Apps.
# Regenerates infra/app-env.json from process-compose + service .env files, then deploys
# infra/app-services.bicep with the 6 secrets sourced from Key Vault.
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$KeyVault = 'kv-sparkdemo',
    [string]$DeploymentName = 'app-services'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    # LLM / embedding config - deploy-time overridable; defaults preserve the OpenAI demo.
    # Point SPARK_LLM_BASE_URL at Azure OpenAI (.../openai/v1/) or OpenAI (api.openai.com).
    $llmBaseUrl = if ($env:SPARK_LLM_BASE_URL) { $env:SPARK_LLM_BASE_URL } else { 'https://api.openai.com/v1' }
    $llmTextModel = if ($env:SPARK_TEXT_MODEL) { $env:SPARK_TEXT_MODEL } else { 'gpt-5.4-mini' }
    $llmEmbeddingModel = if ($env:SPARK_EMBEDDING_MODEL) { $env:SPARK_EMBEDDING_MODEL } else { 'text-embedding-3-small' }
    # Make gen-app-env.py use the SAME values (it reads these env vars).
    $env:SPARK_LLM_BASE_URL = $llmBaseUrl
    $env:SPARK_TEXT_MODEL = $llmTextModel
    $env:SPARK_EMBEDDING_MODEL = $llmEmbeddingModel
    Write-Host "== LLM endpoint: $llmBaseUrl  (text=$llmTextModel, embed=$llmEmbeddingModel) =="

    # Optionally push a deploy-time API key into Key Vault; else the existing secret is used.
    if ($env:SPARK_LLM_API_KEY) {
        Write-Host "== Upserting openai-api-key in Key Vault from SPARK_LLM_API_KEY =="
        az keyvault secret set --vault-name $KeyVault -n openai-api-key --value $env:SPARK_LLM_API_KEY --output none
    }

    Write-Host "== Regenerating infra/app-env.json =="
    & .\.venv\Scripts\python.exe scripts\azure\gen-app-env.py

    function S($n) { az keyvault secret show --vault-name $KeyVault -n $n --query value -o tsv }

    Write-Host "== Reading secrets from Key Vault =="
    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{
            dbPassword           = @{ value = (S 'db-password') }
            s3AccessKey          = @{ value = (S 's3-access-key') }
            s3SecretKey          = @{ value = (S 's3-secret-key') }
            openaiApiKey         = @{ value = (S 'openai-api-key') }
            spiceDbToken         = @{ value = (S 'spicedb-token') }
            keycloakClientSecret = @{ value = (S 'keycloak-client-secret') }
            litellmBaseUrl        = @{ value = $llmBaseUrl }
            litellmTextModel      = @{ value = $llmTextModel }
            litellmEmbeddingModel = @{ value = $llmEmbeddingModel }
        }
    }
    $pf = Join-Path $env:TEMP 'app-services-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8

    Write-Host "== Deploying app-services =="
    az deployment group create -g $ResourceGroup -n $DeploymentName `
        --template-file infra/app-services.bicep --parameters "@$pf" `
        --query "properties.provisioningState" -o tsv
    Remove-Item $pf -Force
}
finally {
    Pop-Location
}
