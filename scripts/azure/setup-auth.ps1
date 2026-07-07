#Requires -Version 7
<#
  setup-auth.ps1 - Enable "lighter" auth for the Azure demo.

  Deploys Keycloak (which imports the `local` realm — roles/client/audience-mapper/test user — at
  startup via --import-realm), runs the token job (password grant -> long-lived access token),
  extracts the token from the job logs, and stores it in Key Vault as `gateway-auth-token`.

  The frontend gateway injects that token as `Authorization: Bearer` on every /api call and the
  backends run AUTH_MODE=optional_verify_dry_run, so JWTs are validated + logged but never hard
  rejected. No login page.

  Prereqs: az logged in (management scope), .env present, KV secrets keycloak-admin-password,
  keycloak-client-secret, local-user-password already set.
#>
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$KeyVault      = 'kv-sparkdemo',
  [string]$EnvironmentName = 'cae-spark-demo',
  [string]$Location      = '',
  [string]$Workspace     = 'cf6383c1-0fe7-4d93-9dc1-b7135ebcfd44'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location $root

function Get-Secret([string]$name) {
  az keyvault secret show --vault-name $KeyVault --name $name --query value -o tsv
}

# --- .env ---
$envMap = @{}
Get-Content "$root/.env" | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2; $envMap[$k.Trim()] = $v.Trim()
}

Write-Host '== 1/4 Render local realm import (roles, client, audience mapper, test user) =='
# Escape each injected value for embedding inside the realm JSON string fields.
function JsonEsc([string]$s) { ($s | ConvertTo-Json -Compress).Trim('"') }
$realmJson = Get-Content -Raw "$root/infra/keycloak-realm.template.json"
$realmJson = $realmJson.Replace('__CLIENT_SECRET__', (JsonEsc (Get-Secret 'keycloak-client-secret')))
$realmJson = $realmJson.Replace('__USER_ID__',       (JsonEsc $envMap['LOCAL_USER_ID']))
$realmJson = $realmJson.Replace('__USER_EMAIL__',    (JsonEsc $envMap['LOCAL_USER_EMAIL']))
$realmJson = $realmJson.Replace('__USER_FIRST__',    (JsonEsc $envMap['LOCAL_USER_FIRST_NAME']))
$realmJson = $realmJson.Replace('__USER_LAST__',     (JsonEsc $envMap['LOCAL_USER_LAST_NAME']))
$realmJson = $realmJson.Replace('__USER_PASSWORD__', (JsonEsc (Get-Secret 'local-user-password')))

Write-Host '== 2/4 Deploy Keycloak (imports the local realm on startup) =='
# The realm JSON is large and contains quotes/newlines, so pass it via a parameters file
# (inline --parameters would be mangled by PowerShell/az argument parsing).
$kp = @{
  '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
  contentVersion = '1.0.0.0'
  parameters     = @{
    environmentName       = @{ value = $EnvironmentName }
    keycloakAdminPassword = @{ value = (Get-Secret 'keycloak-admin-password') }
    keycloakRealmJson     = @{ value = $realmJson }
  }
}
if ($Location) { $kp.parameters.location = @{ value = $Location } }
$kpf = Join-Path $env:TEMP 'kc-params.json'
$kp | ConvertTo-Json -Depth 8 | Set-Content -Path $kpf -Encoding utf8
az deployment group create -g $ResourceGroup -n keycloak `
  --template-file infra/keycloak.bicep --parameters "@$kpf" `
  --query "properties.provisioningState" -o tsv

function Invoke-JobAndWait([string]$job) {
  az containerapp job start -n $job -g $ResourceGroup -o none
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 10
    $st = az containerapp job execution list -n $job -g $ResourceGroup --query "[0].properties.status" -o tsv 2>$null
    Write-Host "  [$job] $st"
    if ($st -eq 'Succeeded') { return $true }
    if ($st -eq 'Failed')    { return $false }
  }
  return $false
}

Write-Host '== 3/4 Deploy + run Keycloak token job =='
$tp = @{
  '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
  contentVersion = '1.0.0.0'
  parameters     = @{
    environmentName      = @{ value = $EnvironmentName }
    keycloakClientSecret = @{ value = (Get-Secret 'keycloak-client-secret') }
    localUserPassword    = @{ value = (Get-Secret 'local-user-password') }
    localUserEmail       = @{ value = $envMap['LOCAL_USER_EMAIL'] }
  }
}
if ($Location) { $tp.parameters.location = @{ value = $Location } }
$tpf = Join-Path $env:TEMP 'kc-token-params.json'
$tp | ConvertTo-Json -Depth 6 | Set-Content -Path $tpf -Encoding utf8
az deployment group create -g $ResourceGroup -n keycloak-token-job `
  --template-file infra/keycloak-token-job.bicep --parameters "@$tpf" `
  --query "properties.provisioningState" -o tsv
if (-not (Invoke-JobAndWait 'keycloak-token')) { throw 'keycloak-token job did not succeed' }

Write-Host '== 4/4 Extract token from job logs (Log Analytics; allow for ingestion delay) =='
$token = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 20
  $q = "ContainerAppConsoleLogs_CL | where Log_s contains 'ACCESS_TOKEN_BEGIN' | project TimeGenerated, Log_s | order by TimeGenerated desc | take 1"
  $row = az monitor log-analytics query --workspace $Workspace --analytics-query $q --query "[0].Log_s" -o tsv 2>$null
  if ($row -and $row -match 'ACCESS_TOKEN_BEGIN(.+?)ACCESS_TOKEN_END') {
    $token = $Matches[1]
    if ($token.Length -gt 100) { break }
  }
  Write-Host "  waiting for token in logs ($i)"
}
if (-not $token -or $token.Length -lt 100) { throw 'Could not extract access token from job logs' }
Write-Host "  token length: $($token.Length)"

Write-Host '== Store token in Key Vault (gateway-auth-token) =='
$token | Set-Content -Path (Join-Path $env:TEMP 'gw-token.txt') -NoNewline -Encoding ascii
az keyvault secret set --vault-name $KeyVault --name gateway-auth-token --file (Join-Path $env:TEMP 'gw-token.txt') --query name -o tsv
Remove-Item (Join-Path $env:TEMP 'gw-token.txt') -Force -ErrorAction SilentlyContinue
Write-Host 'DONE: auth infrastructure ready. Next: rebuild frontend + redeploy app-services.'
