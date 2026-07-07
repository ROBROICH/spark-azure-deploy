<#
.SYNOPSIS
  Stand up a full, throwaway QA clone of the SPARK demo in a NEW resource group (rg-spark-qa),
  reusing the EXISTING ACR images (no rebuild) and the live `migration` seed share (read-only).

.DESCRIPTION
  Builds a complete parallel environment (all ~40 container apps + jobs + auth + frontend) so the
  pause/resume feature can be exercised end-to-end without ever mutating the live rg-spark-demo.
  Everything lands in ONE resource group so teardown is a single `az group delete` (see qa-teardown.ps1).

  What it reuses from live (READ-ONLY): the ACR images (acrsparkdemo), the 8 Key Vault secrets
  (copied into the QA vault), and the `migration` file share on the live storage account (mounted
  read-only to seed Postgres/Qdrant/MinIO exactly as the live env was originally seeded).

  Staged and idempotent-ish: re-run a single stage with -FromStage N -ToStage N. State (the QA ACA
  domain + Log Analytics customerId, discovered after stage 3) is cached in .qa-clone-state.json.

  Stages:
    0  preflight (login, containerapp extension, .env)
    1  foundations: RG + storage account + Key Vault (+ self access policy)
    2  copy the 8 secrets live -> QA vault
    3  ACA environment + Log Analytics  (captures QA defaultDomain + LA customerId)
    4  stores: postgresql + qdrant + minio + spicedb
    5  seed: register `migration` storage (read-only) + init/migration jobs; run minio-init,
       pg-restore, qdrant-restore, minio-restore
    6  temporal + temporal-init
    7  auth: setup-auth.ps1 (keycloak + 10y token -> gateway-auth-token)  [uses QA LA workspace]
    8  spicedb schema
    9  app-services (app-env.json regenerated with the QA domain, then restored)
    10 minio-public
    11 frontend (deployed directly against the existing image; QA minioPublicOrigin)
    12 temporal-ui
    13 snapshots share + snapshot/rehydrate jobs (QA storage account)
    14 report URLs

  After provisioning, TEST with:  ./pause-demo.ps1 -ResourceGroup rg-spark-qa ; ./resume-demo.ps1 -ResourceGroup rg-spark-qa
  Then DECOMMISSION with:         ./qa-teardown.ps1 -Suffix <suffix> -Yes

.EXAMPLE
  ./scripts/azure/qa-provision.ps1
.EXAMPLE
  ./scripts/azure/qa-provision.ps1 -FromStage 9 -ToStage 9      # re-run just the app-services stage
#>
[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9]{3,10}$')]
  [string]$Suffix = ("qa" + (Get-Random -Minimum 10000 -Maximum 99999)),
  [string]$Location = 'westeurope',
  [int]$FromStage = 0,
  [int]$ToStage = 14,
  [string]$LiveResourceGroup = 'rg-spark-demo',
  [string]$LiveKeyVault = 'kv-sparkdemo',
  [string]$LiveStorage = 'stsparkdemo',
  [string]$Acr = 'acrsparkdemo',
  [string]$ImageTag = '0.2',
  [string]$StateFile = (Join-Path $PSScriptRoot '.qa-clone-state.json')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Re-runs (separate -FromStage invocations) reuse the suffix + region captured on the first run,
# so the QA Key Vault / storage-account names and the compute region stay stable across stages.
if (Test-Path $StateFile) {
  $prev = Get-Content $StateFile -Raw | ConvertFrom-Json
  if (-not $PSBoundParameters.ContainsKey('Suffix') -and $prev.suffix) { $Suffix = $prev.suffix }
  if (-not $PSBoundParameters.ContainsKey('Location') -and $prev.location) { $Location = $prev.location }
}

# ---- derived QA coordinates -------------------------------------------------
$RG   = 'rg-spark-qa'
$ENVN = "cae-spark-$Suffix"
$LOGN = "log-spark-$Suffix"
$KV   = "kv-spark-$Suffix"        # <=24 chars, globally unique
$SA   = "stspark$Suffix"          # <=24 chars, lowercase alnum, globally unique
$sub  = az account show --query id -o tsv
if (-not $sub) { throw 'not logged into Azure (az account show returned nothing)' }

# ---- state (QA domain + LA customerId, discovered in stage 3) ---------------
function Save-State([hashtable]$h) { $h | ConvertTo-Json | Set-Content -Path $StateFile -Encoding utf8 }
function Load-State { if (Test-Path $StateFile) { Get-Content $StateFile -Raw | ConvertFrom-Json } else { $null } }
$st = Load-State
$qaDomain = if ($st) { $st.domain } else { $null }
$qaCustomerId = if ($st) { $st.customerId } else { $null }

# ---- helpers ----------------------------------------------------------------
function Get-Secret([string]$vault, [string]$name) { az keyvault secret show --vault-name $vault -n $name --query value -o tsv }

function Copy-Secret([string]$name) {
  $v = Get-Secret $LiveKeyVault $name
  if (-not $v) { throw "live secret '$name' is empty/missing in $LiveKeyVault" }
  az keyvault secret set --vault-name $KV -n $name --value $v --only-show-errors --query name -o tsv | Out-Null
  Write-Host "   copied $name" -ForegroundColor DarkGray
}

# Deploy a bicep with a generated (non-secure-leaking) parameters file.
function Invoke-Bicep([string]$name, [string]$template, [hashtable]$params) {
  $body = @{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = @{} }
  foreach ($k in $params.Keys) { $body.parameters[$k] = @{ value = $params[$k] } }
  $pf = Join-Path $env:TEMP "qa-$name.params.json"
  $body | ConvertTo-Json -Depth 10 | Set-Content -Path $pf -Encoding utf8
  Write-Host "-> deploy $name" -ForegroundColor Cyan
  $state = az deployment group create -g $RG -n $name --template-file (Join-Path $repo $template) --parameters "@$pf" --query "properties.provisioningState" -o tsv
  Remove-Item $pf -Force -ErrorAction SilentlyContinue
  if ($state -ne 'Succeeded') { throw "$name deployment => $state" }
}

# Trigger + wait for a Manual ACA Job via the ARM REST API (no containerapp extension dependency).
function Start-JobWait([string]$job, [int]$timeoutSec = 1800) {
  $api = '2023-05-01'
  $base = "https://management.azure.com/subscriptions/$sub/resourceGroups/$RG/providers/Microsoft.App/jobs/$job"
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

# Register the live `migration` share as a READ-ONLY managed-environment storage in the QA env,
# so the migration/restore jobs can seed the QA stores from the same dumps live was built from.
function Register-MigrationStorage {
  $key = az storage account keys list -g $LiveResourceGroup -n $LiveStorage --query "[0].value" -o tsv
  $body = @{ properties = @{ azureFile = @{ accountName = $LiveStorage; accountKey = $key; shareName = 'migration'; accessMode = 'ReadOnly' } } }
  $bf = Join-Path $env:TEMP 'qa-migration-storage.json'
  $body | ConvertTo-Json -Depth 6 | Set-Content -Path $bf -Encoding utf8
  $url = "https://management.azure.com/subscriptions/$sub/resourceGroups/$RG/providers/Microsoft.App/managedEnvironments/$ENVN/storages/migration?api-version=2023-05-01"
  az rest --method put --url $url --body "@$bf" -o none
  Remove-Item $bf -Force -ErrorAction SilentlyContinue
  Write-Host "   registered 'migration' storage (ReadOnly -> $LiveStorage/migration)" -ForegroundColor DarkGray
}

Write-Host "==== QA clone provision ====" -ForegroundColor Green
Write-Host "  suffix=$Suffix  RG=$RG  ENV=$ENVN  KV=$KV  SA=$SA  stages=$FromStage..$ToStage" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Stage 0 — preflight
# ---------------------------------------------------------------------------
if ($FromStage -le 0 -and $ToStage -ge 0) {
  Write-Host '== Stage 0: preflight ==' -ForegroundColor Green
  $dom = az containerapp env show -n cae-spark-demo -g $LiveResourceGroup --query "properties.defaultDomain" -o tsv 2>$null
  if (-not $dom) { throw 'containerapp extension not working (could not read live env). Stage it (pyfix PYTHONPATH) and retry.' }
  if (-not (Test-Path (Join-Path $repo '.env'))) { Write-Warning '.env missing at repo root — setup-auth.ps1 (stage 7) needs LOCAL_USER_* from it.' }
  Write-Host "   OK (sub=$sub)"
}

# ---------------------------------------------------------------------------
# Stage 1 — foundations: RG + storage + Key Vault
# ---------------------------------------------------------------------------
if ($FromStage -le 1 -and $ToStage -ge 1) {
  Write-Host '== Stage 1: resource group + storage + key vault ==' -ForegroundColor Green
  az group create -n $RG -l $Location -o none
  az storage account create -n $SA -g $RG -l $Location --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --https-only true -o none
  az keyvault create -n $KV -g $RG -l $Location --enable-rbac-authorization false -o none
  $oid = az ad signed-in-user show --query id -o tsv
  if (-not $oid) { throw 'could not resolve signed-in user object id for KV access policy' }
  az keyvault set-policy -n $KV --object-id $oid --secret-permissions get list set delete -o none | Out-Null
  Write-Host '   foundations ready'
}

# ---------------------------------------------------------------------------
# Stage 2 — copy secrets live -> QA
# ---------------------------------------------------------------------------
if ($FromStage -le 2 -and $ToStage -ge 2) {
  Write-Host '== Stage 2: copy secrets from live vault ==' -ForegroundColor Green
  foreach ($s in @('db-password', 's3-access-key', 's3-secret-key', 'spicedb-token', 'openai-api-key', 'keycloak-client-secret', 'keycloak-admin-password', 'local-user-password')) { Copy-Secret $s }
}

# ---------------------------------------------------------------------------
# Stage 3 — ACA environment + Log Analytics  (discover QA domain + LA customerId)
# ---------------------------------------------------------------------------
if ($FromStage -le 3 -and $ToStage -ge 3) {
  Write-Host '== Stage 3: ACA environment + Log Analytics ==' -ForegroundColor Green
  Invoke-Bicep 'environment' 'infra/environment.bicep' @{ location = $Location; environmentName = $ENVN; logAnalyticsName = $LOGN }
  $qaDomain = az containerapp env show -n $ENVN -g $RG --query "properties.defaultDomain" -o tsv
  $qaCustomerId = az resource show -g $RG -n $LOGN --resource-type 'Microsoft.OperationalInsights/workspaces' --api-version 2022-10-01 --query "properties.customerId" -o tsv
  Save-State @{ suffix = $Suffix; rg = $RG; env = $ENVN; kv = $KV; storage = $SA; location = $Location; domain = $qaDomain; customerId = $qaCustomerId }
  Write-Host "   QA domain        : $qaDomain"
  Write-Host "   QA LA customerId : $qaCustomerId"
}

# ---------------------------------------------------------------------------
# Stage 4 — stores: postgresql, qdrant, minio, spicedb
# ---------------------------------------------------------------------------
if ($FromStage -le 4 -and $ToStage -ge 4) {
  Write-Host '== Stage 4: data stores ==' -ForegroundColor Green
  $dbp = Get-Secret $KV 'db-password'
  $s3a = Get-Secret $KV 's3-access-key'; $s3s = Get-Secret $KV 's3-secret-key'; $sdt = Get-Secret $KV 'spicedb-token'
  Invoke-Bicep 'postgres' 'infra/postgres.bicep' @{ location = $Location; environmentName = $ENVN; dbPassword = $dbp }
  Invoke-Bicep 'infra-services' 'infra/infra-services.bicep' @{ location = $Location; environmentName = $ENVN; s3AccessKey = $s3a; s3SecretKey = $s3s; spicedbToken = $sdt }
}

# ---------------------------------------------------------------------------
# Stage 5 — seed stores from the live `migration` share (read-only)
# ---------------------------------------------------------------------------
if ($FromStage -le 5 -and $ToStage -ge 5) {
  Write-Host '== Stage 5: seed stores (migration share, read-only) ==' -ForegroundColor Green
  Register-MigrationStorage
  $dbp = Get-Secret $KV 'db-password'; $s3a = Get-Secret $KV 's3-access-key'; $s3s = Get-Secret $KV 's3-secret-key'
  Invoke-Bicep 'init-jobs' 'infra/init-jobs.bicep' @{ location = $Location; environmentName = $ENVN; s3AccessKey = $s3a; s3SecretKey = $s3s }
  Invoke-Bicep 'migration-jobs' 'infra/migration-jobs.bicep' @{ location = $Location; environmentName = $ENVN; dbPassword = $dbp }
  Invoke-Bicep 'qdrant-restore-job' 'infra/qdrant-restore-job.bicep' @{ location = $Location; environmentName = $ENVN }
  Invoke-Bicep 'minio-restore-job' 'infra/minio-restore-job.bicep' @{ location = $Location; environmentName = $ENVN; s3AccessKey = $s3a; s3SecretKey = $s3s }
  if ((Start-JobWait 'minio-init' 600) -ne 'Succeeded') { Write-Warning 'minio-init did not succeed' }
  if ((Start-JobWait 'pg-restore' 1800) -ne 'Succeeded') { Write-Warning 'pg-restore did not succeed' }
  if ((Start-JobWait 'qdrant-restore' 1200) -ne 'Succeeded') { Write-Warning 'qdrant-restore did not succeed' }
  if ((Start-JobWait 'minio-restore' 1200) -ne 'Succeeded') { Write-Warning 'minio-restore did not succeed' }
}

# ---------------------------------------------------------------------------
# Stage 6 — temporal + temporal-init
# ---------------------------------------------------------------------------
if ($FromStage -le 6 -and $ToStage -ge 6) {
  Write-Host '== Stage 6: temporal ==' -ForegroundColor Green
  $dbp = Get-Secret $KV 'db-password'
  Invoke-Bicep 'temporal' 'infra/temporal.bicep' @{ location = $Location; environmentName = $ENVN; dbPassword = $dbp }
  if ((Start-JobWait 'temporal-init' 900) -ne 'Succeeded') { Write-Warning 'temporal-init did not succeed' }
}

# ---------------------------------------------------------------------------
# Stage 7 — auth (keycloak + gateway token). Uses the QA Log Analytics workspace.
# ---------------------------------------------------------------------------
if ($FromStage -le 7 -and $ToStage -ge 7) {
  Write-Host '== Stage 7: auth (setup-auth.ps1) ==' -ForegroundColor Green
  if (-not $qaCustomerId) { $qaCustomerId = (Load-State).customerId }
  if (-not $qaCustomerId) { throw 'QA Log Analytics customerId unknown — run stage 3 first' }
  & (Join-Path $PSScriptRoot 'setup-auth.ps1') -ResourceGroup $RG -KeyVault $KV -EnvironmentName $ENVN -Location $Location -Workspace $qaCustomerId
}

# ---------------------------------------------------------------------------
# Stage 8 — spicedb schema
# ---------------------------------------------------------------------------
if ($FromStage -le 8 -and $ToStage -ge 8) {
  Write-Host '== Stage 8: spicedb schema ==' -ForegroundColor Green
  & (Join-Path $PSScriptRoot 'apply-spicedb-schema.ps1') -ResourceGroup $RG -KeyVault $KV -EnvironmentName $ENVN -Location $Location
}

# ---------------------------------------------------------------------------
# Stage 9 — app-services (regenerate app-env.json with the QA domain, then restore it)
# ---------------------------------------------------------------------------
if ($FromStage -le 9 -and $ToStage -ge 9) {
  Write-Host '== Stage 9: app-services ==' -ForegroundColor Green
  if (-not $qaDomain) { $qaDomain = (Load-State).domain }
  if (-not $qaDomain) { throw 'QA domain unknown — run stage 3 first' }
  $appEnvPath = Join-Path $repo 'infra/app-env.json'
  $backup = "$appEnvPath.live.bak"
  Copy-Item $appEnvPath $backup -Force
  try {
    $env:SPARK_S3_EXTERNAL_URL = "https://minio-public.$qaDomain"
    & (Join-Path $repo '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'gen-app-env.py')
    Remove-Item Env:\SPARK_S3_EXTERNAL_URL -ErrorAction SilentlyContinue
    $p = @{
      location             = $Location; environmentName = $ENVN; acrName = $Acr; acrResourceGroup = $LiveResourceGroup; imageTag = $ImageTag
      dbPassword           = (Get-Secret $KV 'db-password')
      s3AccessKey          = (Get-Secret $KV 's3-access-key')
      s3SecretKey          = (Get-Secret $KV 's3-secret-key')
      openaiApiKey         = (Get-Secret $KV 'openai-api-key')
      spiceDbToken         = (Get-Secret $KV 'spicedb-token')
      keycloakClientSecret = (Get-Secret $KV 'keycloak-client-secret')
    }
    Invoke-Bicep 'app-services' 'infra/app-services.bicep' $p
  }
  finally {
    Copy-Item $backup $appEnvPath -Force
    Remove-Item $backup -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\SPARK_S3_EXTERNAL_URL -ErrorAction SilentlyContinue
    Write-Host '   restored infra/app-env.json (live values)' -ForegroundColor DarkGray
  }
}

# ---------------------------------------------------------------------------
# Stage 10 — minio-public
# ---------------------------------------------------------------------------
if ($FromStage -le 10 -and $ToStage -ge 10) {
  Write-Host '== Stage 10: minio-public ==' -ForegroundColor Green
  & (Join-Path $PSScriptRoot 'deploy-minio-public.ps1') -ResourceGroup $RG -EnvironmentName $ENVN -Location $Location
}

# ---------------------------------------------------------------------------
# Stage 11 — frontend (deploy directly against the existing image; QA CORS origin)
# ---------------------------------------------------------------------------
if ($FromStage -le 11 -and $ToStage -ge 11) {
  Write-Host '== Stage 11: frontend ==' -ForegroundColor Green
  if (-not $qaDomain) { $qaDomain = (Load-State).domain }
  $token = Get-Secret $KV 'gateway-auth-token'
  if (-not $token) { throw 'gateway-auth-token missing in QA vault — run stage 7 (auth) first' }
  Invoke-Bicep 'frontend' 'infra/frontend.bicep' @{
    location = $Location; environmentName = $ENVN; acrName = $Acr; acrResourceGroup = $LiveResourceGroup; imageTag = $ImageTag
    revisionSuffix = ("r" + (Get-Date -Format 'MMddHHmmss'))
    gatewayAuthToken = $token
    minioPublicOrigin = "https://minio-public.$qaDomain"
  }
}

# ---------------------------------------------------------------------------
# Stage 12 — temporal-ui
# ---------------------------------------------------------------------------
if ($FromStage -le 12 -and $ToStage -ge 12) {
  Write-Host '== Stage 12: temporal-ui ==' -ForegroundColor Green
  & (Join-Path $PSScriptRoot 'deploy-temporal-ui.ps1') -ResourceGroup $RG -KeyVault $KV -EnvironmentName $ENVN -Location $Location
}

# ---------------------------------------------------------------------------
# Stage 13 — snapshots share + snapshot/rehydrate jobs (QA storage account)
# ---------------------------------------------------------------------------
if ($FromStage -le 13 -and $ToStage -ge 13) {
  Write-Host '== Stage 13: snapshots share + jobs ==' -ForegroundColor Green
  $dbp = Get-Secret $KV 'db-password'; $s3a = Get-Secret $KV 's3-access-key'; $s3s = Get-Secret $KV 's3-secret-key'; $sdt = Get-Secret $KV 'spicedb-token'
  Invoke-Bicep 'snapshots-storage' 'infra/snapshots-storage.bicep' @{ environmentName = $ENVN; storageAccountName = $SA; shareName = 'snapshots'; shareQuotaGb = 100 }
  Invoke-Bicep 'snapshot-jobs' 'infra/snapshot-jobs.bicep' @{ location = $Location; environmentName = $ENVN; dbPassword = $dbp; s3AccessKey = $s3a; s3SecretKey = $s3s; spicedbToken = $sdt }
}

# ---------------------------------------------------------------------------
# Stage 14 — report
# ---------------------------------------------------------------------------
if ($FromStage -le 14 -and $ToStage -ge 14) {
  Write-Host '== Stage 14: report ==' -ForegroundColor Green
  $fe = az containerapp show -n frontend -g $RG --query "properties.configuration.ingress.fqdn" -o tsv 2>$null
  $tu = az containerapp show -n temporal-ui -g $RG --query "properties.configuration.ingress.fqdn" -o tsv 2>$null
  Write-Host ''
  Write-Host 'QA clone provisioned.' -ForegroundColor Green
  if ($fe) { Write-Host "  App:         https://$fe/app/" -ForegroundColor Green }
  if ($tu) { Write-Host "  Temporal UI: https://$tu" -ForegroundColor Green }
  Write-Host "  Basic-auth pw: az keyvault secret show --vault-name $KV -n basic-auth-password --query value -o tsv" -ForegroundColor Green
  Write-Host ''
  Write-Host '  TEST pause/resume:' -ForegroundColor Yellow
  Write-Host "    ./scripts/azure/pause-demo.ps1  -ResourceGroup $RG" -ForegroundColor Yellow
  Write-Host "    ./scripts/azure/resume-demo.ps1 -ResourceGroup $RG" -ForegroundColor Yellow
  Write-Host '  DECOMMISSION when done:' -ForegroundColor Yellow
  Write-Host "    ./scripts/azure/qa-teardown.ps1 -Suffix $Suffix -Yes" -ForegroundColor Yellow
}
