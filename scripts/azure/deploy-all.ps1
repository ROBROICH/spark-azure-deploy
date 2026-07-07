#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Orchestrate the SPARK demo app tier on top of azd-provisioned foundations.

.DESCRIPTION
  Run by azd as a `postprovision` hook (and standalone for re-runs). Reads the
  foundation coordinates from the azd environment (infra/main.bicep outputs) and
  the LLM config from SPARK_* env vars, generates the store secrets into Key
  Vault, then deploys, in order:

    stores (postgres, qdrant, minio, spicedb) -> seed (golden snapshot) ->
    temporal -> auth (keycloak + gateway token) -> spicedb schema ->
    app-services (~28 Container Apps) -> minio-public -> frontend -> temporal-ui
    -> snapshots share + jobs.

  It reuses the same per-component Bicep the live/QA environments use; only the
  coordinates differ (they come from azd, not hardcoded live names).

  Image source: the app-services/frontend Bicep pull from $AcrName (maintainer
  build path). Customer deployments use pre-built PUBLIC GHCR images — wired in a
  later step (TODO P5). Seeding uses the golden snapshot (TODO P3: seed-demo.ps1).
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup   = $env:AZURE_RESOURCE_GROUP,
  [string]$KeyVault        = $env:SPARK_KEY_VAULT_NAME,
  [string]$EnvironmentName = $env:SPARK_ENVIRONMENT_NAME,
  [string]$Location        = $env:AZURE_LOCATION,
  [string]$Domain          = $env:SPARK_ENVIRONMENT_DOMAIN,
  [string]$CustomerId      = $env:SPARK_LOG_ANALYTICS_CUSTOMER_ID,
  [string]$StorageAccount  = $env:SPARK_STORAGE_ACCOUNT,
  [string]$AcrName         = $env:SPARK_ACR_NAME,
  [string]$ImageTag        = $(if ($env:SPARK_IMAGE_TAG) { $env:SPARK_IMAGE_TAG } else { '0.2' })
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = Split-Path -Parent (Split-Path -Parent $here)
# Cross-platform: this runs on Windows locally and on Linux in CI / azd posix hooks.
if (-not $env:TEMP) { $env:TEMP = [System.IO.Path]::GetTempPath() }
$python = if ($env:SPARK_PYTHON) { $env:SPARK_PYTHON }
elseif (Test-Path (Join-Path $repo '.venv/Scripts/python.exe')) { Join-Path $repo '.venv/Scripts/python.exe' }
elseif (Test-Path (Join-Path $repo '.venv/bin/python')) { Join-Path $repo '.venv/bin/python' }
elseif (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' }
else { 'python' }
$sub = az account show --query id -o tsv
if (-not $sub) { throw 'Not logged into Azure (az account show returned nothing).' }

foreach ($p in @{ ResourceGroup = $ResourceGroup; KeyVault = $KeyVault; EnvironmentName = $EnvironmentName; Location = $Location; Domain = $Domain; CustomerId = $CustomerId; StorageAccount = $StorageAccount }.GetEnumerator()) {
  if (-not $p.Value) { throw "Missing required coordinate '$($p.Key)'. Run ``azd provision`` first (it sets the SPARK_*/AZURE_* env), or pass -$($p.Key)." }
}

# ---- helpers ----------------------------------------------------------------
function Get-Secret([string]$name) { az keyvault secret show --vault-name $KeyVault -n $name --query value -o tsv 2>$null }

function New-Password([int]$len = 32) {
  $chars = (48..57) + (65..90) + (97..122)
  -join ($chars | Get-Random -Count $len | ForEach-Object { [char]$_ })
}

function Ensure-Secret([string]$name, [scriptblock]$generator) {
  $existing = Get-Secret $name
  if ($existing) { return $existing }
  $val = & $generator
  az keyvault secret set --vault-name $KeyVault -n $name --value $val --only-show-errors --query name -o tsv | Out-Null
  Write-Host "   generated secret $name" -ForegroundColor DarkGray
  return $val
}

function Invoke-Bicep([string]$name, [string]$template, [hashtable]$params) {
  $body = @{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = @{} }
  foreach ($k in $params.Keys) { $body.parameters[$k] = @{ value = $params[$k] } }
  $pf = Join-Path $env:TEMP "spark-$name.params.json"
  $body | ConvertTo-Json -Depth 10 | Set-Content -Path $pf -Encoding utf8
  Write-Host "-> deploy $name" -ForegroundColor Cyan
  $state = az deployment group create -g $ResourceGroup -n $name --template-file (Join-Path $repo $template) --parameters "@$pf" --query "properties.provisioningState" -o tsv
  Remove-Item $pf -Force -ErrorAction SilentlyContinue
  if ($state -ne 'Succeeded') { throw "$name deployment => $state" }
}

# Trigger + wait for a Manual ACA Job via the ARM REST API (no containerapp extension dependency).
function Start-JobWait([string]$job, [int]$timeoutSec = 1800) {
  $api = '2023-05-01'
  $base = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.App/jobs/$job"
  Write-Host "-> start job $job" -ForegroundColor Cyan
  az rest --method post --url "$base/start?api-version=$api" -o none 2>$null
  Start-Sleep -Seconds 4
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $last = ''
  while ((Get-Date) -lt $deadline) {
    $exs = az rest --method get --url "$base/executions?api-version=$api" 2>$null | ConvertFrom-Json
    $latest = $exs.value | Sort-Object { $_.properties.startTime } -Descending | Select-Object -First 1
    $status = if ($latest) { $latest.properties.status } else { 'Pending' }
    if ($status -ne $last) { Write-Host "   $job : $status"; $last = $status }
    if ($status -in @('Succeeded', 'Failed', 'Degraded', 'Cancelled')) { return $status }
    Start-Sleep -Seconds 6
  }
  return 'Timeout'
}

Write-Host '==== SPARK deploy-all ====' -ForegroundColor Green
Write-Host "  RG=$ResourceGroup ENV=$EnvironmentName KV=$KeyVault domain=$Domain acr=$AcrName" -ForegroundColor Green

# ---- LLM config (P1 contract; defaults preserve the OpenAI demo) ------------
$llmBaseUrl = if ($env:SPARK_LLM_BASE_URL) { $env:SPARK_LLM_BASE_URL } else { 'https://api.openai.com/v1' }
$llmTextModel = if ($env:SPARK_TEXT_MODEL) { $env:SPARK_TEXT_MODEL } else { 'gpt-5.4-mini' }
$llmEmbeddingModel = if ($env:SPARK_EMBEDDING_MODEL) { $env:SPARK_EMBEDDING_MODEL } else { 'text-embedding-3-small' }
if ($env:SPARK_LLM_API_KEY) {
  az keyvault secret set --vault-name $KeyVault -n openai-api-key --value $env:SPARK_LLM_API_KEY --only-show-errors --query name -o tsv | Out-Null
}
if (-not (Get-Secret 'openai-api-key')) {
  throw 'No LLM API key present. Set SPARK_LLM_API_KEY (an OpenAI or Azure OpenAI key) before deploying.'
}
Write-Host "  LLM endpoint: $llmBaseUrl (text=$llmTextModel, embed=$llmEmbeddingModel)" -ForegroundColor Green
$imageRegistry = if ($env:SPARK_IMAGE_REGISTRY) { $env:SPARK_IMAGE_REGISTRY } else { '' }
if ($imageRegistry) { Write-Host "  Image registry: $imageRegistry" -ForegroundColor Green }

# ---- generate store secrets (idempotent) -----------------------------------
Write-Host '== ensuring secrets ==' -ForegroundColor Green
$dbp = Ensure-Secret 'db-password' { New-Password 32 }
$s3a = Ensure-Secret 's3-access-key' { 'spark' + (New-Password 12) }
$s3s = Ensure-Secret 's3-secret-key' { New-Password 40 }
$sdt = Ensure-Secret 'spicedb-token' { New-Password 40 }
$null = Ensure-Secret 'keycloak-client-secret' { New-Password 40 }
$null = Ensure-Secret 'keycloak-admin-password' { New-Password 24 }
$null = Ensure-Secret 'local-user-password' { New-Password 20 }

# ---- stores ----------------------------------------------------------------
Write-Host '== stores (postgres, qdrant, minio, spicedb) ==' -ForegroundColor Green
Invoke-Bicep 'postgres' 'infra/postgres.bicep' @{ location = $Location; environmentName = $EnvironmentName; dbPassword = $dbp }
Invoke-Bicep 'infra-services' 'infra/infra-services.bicep' @{ location = $Location; environmentName = $EnvironmentName; s3AccessKey = $s3a; s3SecretKey = $s3s; spicedbToken = $sdt }

# ---- snapshots share + jobs (deploy BEFORE seed: the share + rehydrate jobs must exist to seed) ----
Write-Host '== snapshots share + jobs ==' -ForegroundColor Green
Invoke-Bicep 'snapshots-storage' 'infra/snapshots-storage.bicep' @{ environmentName = $EnvironmentName; storageAccountName = $StorageAccount; shareName = 'snapshots'; shareQuotaGb = 100 }
Invoke-Bicep 'snapshot-jobs' 'infra/snapshot-jobs.bicep' @{ location = $Location; environmentName = $EnvironmentName; dbPassword = $dbp; s3AccessKey = $s3a; s3SecretKey = $s3s; spicedbToken = $sdt }

# ---- seed demo content (golden snapshot -> restore-all) --------------------
Write-Host '== seed demo content ==' -ForegroundColor Green
$seedScript = Join-Path $here 'seed-demo.ps1'
if (Test-Path $seedScript) {
  & $seedScript -ResourceGroup $ResourceGroup -KeyVault $KeyVault -EnvironmentName $EnvironmentName -Location $Location -StorageAccount $StorageAccount
}
else {
  Write-Warning 'seed-demo.ps1 missing; skipping seed. Stores start EMPTY (app runs but shows no demo case/embeddings).'
}

# ---- temporal --------------------------------------------------------------
Write-Host '== temporal ==' -ForegroundColor Green
Invoke-Bicep 'temporal' 'infra/temporal.bicep' @{ location = $Location; environmentName = $EnvironmentName; dbPassword = $dbp }
if ((Start-JobWait 'temporal-init' 900) -ne 'Succeeded') { Write-Warning 'temporal-init did not succeed' }

# ---- auth (keycloak realm + 10y gateway token) -----------------------------
# NOTE: setup-auth.ps1 seeds the Keycloak test user from repo-root .env LOCAL_USER_*
# (or the local-user-password secret). For a keyless customer deploy, confirm those
# inputs are present on the first real run.
Write-Host '== auth ==' -ForegroundColor Green
& (Join-Path $here 'setup-auth.ps1') -ResourceGroup $ResourceGroup -KeyVault $KeyVault -EnvironmentName $EnvironmentName -Location $Location -Workspace $CustomerId

# ---- spicedb schema --------------------------------------------------------
Write-Host '== spicedb schema ==' -ForegroundColor Green
& (Join-Path $here 'apply-spicedb-schema.ps1') -ResourceGroup $ResourceGroup -KeyVault $KeyVault -EnvironmentName $EnvironmentName -Location $Location

# ---- app-services (~28 Container Apps) -------------------------------------
# Regenerate app-env.json for THIS env's public domain + LLM config, deploy, restore.
Write-Host '== app-services ==' -ForegroundColor Green
if (-not $AcrName) { Write-Warning 'SPARK_ACR_NAME empty: app images must resolve from a public registry (GHCR). TODO(P5) wires the GHCR image source into app-services.bicep / frontend.bicep.' }
$appEnvPath = Join-Path $repo 'infra/app-env.json'
$backup = "$appEnvPath.deployall.bak"
Copy-Item $appEnvPath $backup -Force
try {
  $env:SPARK_S3_EXTERNAL_URL = "https://minio-public.$Domain"
  $env:SPARK_LLM_BASE_URL = $llmBaseUrl; $env:SPARK_TEXT_MODEL = $llmTextModel; $env:SPARK_EMBEDDING_MODEL = $llmEmbeddingModel
  & $python (Join-Path $here 'gen-app-env.py')
  $p = @{
    location             = $Location; environmentName = $EnvironmentName; acrName = $AcrName; acrResourceGroup = $ResourceGroup; imageTag = $ImageTag; imageRegistry = $imageRegistry
    litellmBaseUrl       = $llmBaseUrl; litellmTextModel = $llmTextModel; litellmEmbeddingModel = $llmEmbeddingModel
    dbPassword           = $dbp; s3AccessKey = $s3a; s3SecretKey = $s3s
    openaiApiKey         = (Get-Secret 'openai-api-key'); spiceDbToken = $sdt; keycloakClientSecret = (Get-Secret 'keycloak-client-secret')
  }
  Invoke-Bicep 'app-services' 'infra/app-services.bicep' $p
}
finally {
  Copy-Item $backup $appEnvPath -Force
  Remove-Item $backup -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\SPARK_S3_EXTERNAL_URL -ErrorAction SilentlyContinue
  Write-Host '   restored infra/app-env.json' -ForegroundColor DarkGray
}

# ---- minio-public ----------------------------------------------------------
Write-Host '== minio-public ==' -ForegroundColor Green
& (Join-Path $here 'deploy-minio-public.ps1') -ResourceGroup $ResourceGroup -EnvironmentName $EnvironmentName -Location $Location

# ---- frontend (SPA + /api gateway; injects the gateway auth token) ---------
Write-Host '== frontend ==' -ForegroundColor Green
$token = Get-Secret 'gateway-auth-token'
if (-not $token) { throw 'gateway-auth-token missing - the auth stage (setup-auth.ps1) must run first.' }
$allowedIps = if ($env:SPARK_ALLOWED_IPS) { @($env:SPARK_ALLOWED_IPS -split '[,; ]+' | Where-Object { $_ }) } else { @() }
Invoke-Bicep 'frontend' 'infra/frontend.bicep' @{
  location          = $Location; environmentName = $EnvironmentName; acrName = $AcrName; acrResourceGroup = $ResourceGroup; imageTag = $ImageTag; imageRegistry = $imageRegistry
  revisionSuffix    = ('r' + (Get-Date -Format 'MMddHHmmss'))
  gatewayAuthToken  = $token
  minioPublicOrigin = "https://minio-public.$Domain"
  allowedClientIps  = $allowedIps
}

# ---- temporal-ui (Basic-Auth gated) ----------------------------------------
Write-Host '== temporal-ui ==' -ForegroundColor Green
& (Join-Path $here 'setup-basic-auth.ps1') -KeyVault $KeyVault
& (Join-Path $here 'deploy-temporal-ui.ps1') -ResourceGroup $ResourceGroup -KeyVault $KeyVault -EnvironmentName $EnvironmentName -Location $Location

# ---- report ----------------------------------------------------------------
$fe = az containerapp show -n frontend -g $ResourceGroup --query 'properties.configuration.ingress.fqdn' -o tsv 2>$null
Write-Host ''
Write-Host 'SPARK demo deployed.' -ForegroundColor Green
if ($fe) { Write-Host "  App: https://$fe/app/" -ForegroundColor Green }
Write-Host "  Temporal UI basic-auth pw: az keyvault secret show --vault-name $KeyVault -n basic-auth-password --query value -o tsv" -ForegroundColor Green
