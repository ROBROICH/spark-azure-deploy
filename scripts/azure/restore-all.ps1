<#
.SYNOPSIS
  Restore the ephemeral stores from the durable `snapshots` share after an autopause / replica move.

.DESCRIPTION
  Triggers the *-rehydrate ACA Jobs IN ORDER (pg -> qdrant -> minio -> spicedb) via the ARM REST API,
  waiting for each to succeed before starting the next. Run this AFTER waking the stores (min-1) and
  BEFORE reopening the app, so services reconnect to fully-restored stores.

  The SpiceDB backup contains the schema, so `spicedb-rehydrate` also re-writes it (no separate schema
  job needed on restore). Pass -RunTemporalInit to re-assert Temporal search attributes / retention.

  Strategy + rationale: analysis/10-ephemeral-state-snapshots.md
  Jobs are defined in: infra/snapshot-jobs.bicep

.EXAMPLE
  ./scripts/azure/restore-all.ps1 -RunTemporalInit
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$Subscription,
  [switch]$RunTemporalInit
)

$ErrorActionPreference = 'Stop'
if (-not $Subscription) { $Subscription = az account show --query id -o tsv }
az account set --subscription $Subscription | Out-Null

# Use the `az containerapp job` CLI rather than `az rest --url "...?api-version=..."`: a `?api-version=`
# placed immediately after a PowerShell variable in the URL gets mangled and Azure returns
# MissingApiVersionParameter, which made the status poll never resolve and spin forever.
function Get-LatestExec([string]$job) {
  for ($i = 0; $i -lt 15; $i++) {
    $list = az containerapp job execution list -n $job -g $ResourceGroup -o json 2>$null | ConvertFrom-Json
    if ($list) {
      $latest = $list | Sort-Object { $_.properties.startTime } -Descending | Select-Object -First 1
      if ($latest) { return $latest.name }
    }
    Start-Sleep -Seconds 2
  }
  return $null
}

function Start-AcaJob([string]$job) {
  Write-Host "-> starting $job" -ForegroundColor Cyan
  $raw = az containerapp job start -n $job -g $ResourceGroup -o json 2>$null
  $name = $null
  if ($raw) { try { $name = ($raw | ConvertFrom-Json).name } catch { $name = $null } }
  if (-not $name) { $name = Get-LatestExec $job }
  return $name
}

function Wait-AcaJob([string]$job, [string]$exec) {
  if (-not $exec) { Write-Warning "no execution id returned for $job"; return 'Unknown' }
  while ($true) {
    $e = az containerapp job execution show -n $job -g $ResourceGroup --job-execution-name $exec -o json 2>$null | ConvertFrom-Json
    $status = $e.properties.status
    Write-Host ("   {0}/{1} : {2}" -f $job, $exec, $status)
    if ($status -in @('Succeeded', 'Failed', 'Cancelled', 'Degraded')) { return $status }
    Start-Sleep -Seconds 5
  }
}

# Order matters: Postgres (app + Temporal state) first, authz (SpiceDB) last.
$order = @('pg-rehydrate', 'qdrant-rehydrate', 'minio-rehydrate', 'spicedb-rehydrate')

foreach ($job in $order) {
  $exec = Start-AcaJob $job
  $status = Wait-AcaJob $job $exec
  if ($status -ne 'Succeeded') { throw "restore-all: $job => $status (stopping; stores may be partially restored)" }
}

if ($RunTemporalInit) {
  $exec = Start-AcaJob 'temporal-init'
  $status = Wait-AcaJob 'temporal-init' $exec
  if ($status -ne 'Succeeded') { Write-Warning "temporal-init => $status" }
}

Write-Host 'restore-all complete' -ForegroundColor Green
