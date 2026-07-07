<#
.SYNOPSIS
  Capture the CURRENT LIVE state of the ephemeral stores to the durable `snapshots` Azure Files share.

.DESCRIPTION
  Triggers the *-snapshot ACA Jobs (pg / qdrant / minio / spicedb) via the ARM REST API and waits for
  them to finish. Snapshots must be taken while the stores are running (min-1) — run this BEFORE you
  autopause (scale the stores to zero). Restore later with restore-all.ps1.

  Strategy + rationale: analysis/10-ephemeral-state-snapshots.md
  Jobs are defined in: infra/snapshot-jobs.bicep  (deploy after infra/snapshots-storage.bicep)

.EXAMPLE
  ./scripts/azure/snapshot-all.ps1
.EXAMPLE
  ./scripts/azure/snapshot-all.ps1 -Stores pg,qdrant -NoWait
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$Subscription,
  [ValidateSet('pg', 'qdrant', 'minio', 'spicedb')]
  [string[]]$Stores = @('pg', 'qdrant', 'minio', 'spicedb'),
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
if (-not $Subscription) { $Subscription = az account show --query id -o tsv }
$api = '2023-05-01'
$base = "https://management.azure.com/subscriptions/$Subscription/resourceGroups/$ResourceGroup/providers/Microsoft.App/jobs"

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

# ---------------------------------------------------------------------------
# Snapshots-share helpers. Resolve the Azure Files share behind the `snapshots` ACA env storage so the
# SpiceDB backup can be pre-cleaned and then verified by file (see the SpiceDB note below). Assumes the
# storage account lives in the same resource group as the environment (true for the demo and the QA
# clone); on any lookup miss we return $null and fall back to the job's exit status.
# ---------------------------------------------------------------------------
function Get-SnapshotShare([string]$rg) {
  # A resource group may hold more than one ACA environment (e.g. a failed/orphaned one alongside the
  # live one), so scan them all and pick whichever actually has the `snapshots` storage registered.
  $envNames = @(az containerapp env list -g $rg --query "[].name" -o tsv 2>$null)
  if (-not $envNames) { Write-Warning "Get-SnapshotShare: no ACA environment found in $rg"; return $null }
  foreach ($envName in $envNames) {
    $sj = az containerapp env storage show -n $envName -g $rg --storage-name snapshots -o json 2>$null | ConvertFrom-Json
    $acct = $sj.properties.azureFile.accountName; $share = $sj.properties.azureFile.shareName
    if (-not $acct -or -not $share) { continue }
    $key = az storage account keys list -g $rg -n $acct --query "[0].value" -o tsv 2>$null
    if (-not $key) { Write-Warning "Get-SnapshotShare: could not read key for storage account $acct"; continue }
    return [pscustomobject]@{ Account = $acct; Share = $share; Key = $key }
  }
  Write-Warning "Get-SnapshotShare: no ACA environment in $rg has a 'snapshots' storage"
  return $null
}
function Remove-SnapshotFile($ctx, [string]$path) {
  if (-not $ctx) { return }
  az storage file delete --account-name $ctx.Account --account-key $ctx.Key --share-name $ctx.Share --path $path -o none 2>$null | Out-Null
}
function Get-SnapshotFileSize($ctx, [string]$path) {
  if (-not $ctx) { return -1 }
  $sz = az storage file show --account-name $ctx.Account --account-key $ctx.Key --share-name $ctx.Share --path $path --query "properties.contentLength" -o tsv 2>$null
  if ($LASTEXITCODE -eq 0 -and $sz) { return [int64]$sz } else { return -1 }
}

$jobMap = @{ pg = 'pg-snapshot'; qdrant = 'qdrant-snapshot'; minio = 'minio-snapshot'; spicedb = 'spicedb-snapshot' }
$spicedbBackupName = 'spicedb-relationships.zedbackup'

# SpiceDB quirk: `zed backup create` on an Azure Files share reliably writes a valid, complete backup
# but then exits NON-ZERO on a benign lock-cleanup step ("remove ...zedbackup.lock: no such file"),
# and its retries refuse to overwrite ("completed backup file already exists"). The job's exit status
# is therefore an unreliable failure signal. We (1) delete any stale backup + lock BEFORE the run —
# both so `zed` writes fresh (it will NOT overwrite an existing file) and so a present file proves
# THIS run produced it — and (2) verify success by that fresh, non-empty file rather than the status.
$spicedbCtx = $null
if ('spicedb' -in $Stores) {
  $spicedbCtx = Get-SnapshotShare $ResourceGroup
  Remove-SnapshotFile $spicedbCtx $spicedbBackupName
  Remove-SnapshotFile $spicedbCtx "$spicedbBackupName.lock"
}

# Snapshots are independent — start them all, then wait.
$started = [ordered]@{}
foreach ($s in $Stores) { $started[$jobMap[$s]] = Start-AcaJob $jobMap[$s] }

if ($NoWait) { Write-Host 'snapshot jobs started (not waiting)' -ForegroundColor Green; return }

$failed = @()
foreach ($kv in $started.GetEnumerator()) {
  $status = Wait-AcaJob $kv.Key $kv.Value
  if ($status -eq 'Succeeded') { continue }
  # SpiceDB: trust the freshly-written backup file over the (unreliable) job exit status.
  if ($kv.Key -eq 'spicedb-snapshot') {
    $sz = Get-SnapshotFileSize $spicedbCtx $spicedbBackupName
    if ($sz -gt 0) {
      Write-Host ("   spicedb-snapshot reported {0}, but a fresh backup is present ({1} bytes) -> OK" -f $status, $sz) -ForegroundColor Yellow
      continue
    }
  }
  $failed += "$($kv.Key) => $status"
}

if ($failed.Count -gt 0) { throw "snapshot-all: job(s) did not succeed: $($failed -join '; ')" }
Write-Host 'snapshot-all complete' -ForegroundColor Green
