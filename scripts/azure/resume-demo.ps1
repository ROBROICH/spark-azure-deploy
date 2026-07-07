<#
.SYNOPSIS
  Resume the SPARK demo after a pause: start the stores, rehydrate them, then start everything else.

.DESCRIPTION
  Reverses pause-demo.ps1. The four ephemeral stores come back EMPTY (ephemeral filesystem), so they
  are rehydrated from the durable `snapshots` share before any writer connects. Order matters:

    1. Start the 4 stateful stores (postgresql, qdrant, minio, spicedb) at their saved scale.
    2. restore-all.ps1 — rehydrate them from the last snapshot. Temporal is still DOWN here, so
       pg_restore --clean rewrites Temporal's DBs without a live connection fighting it.
    3. Start the platform tier (temporal, keycloak). Temporal now reads the restored Postgres.
    4. temporal-init — re-assert search attributes / retention (idempotent; self-waits for SERVING).
    5. Start the remaining app tier (HTTP services, workers, frontend, proxies).

  The rehydrate Jobs and temporal-init self-wait for their store to be reachable, so no extra
  readiness polling is needed here.

  Scale is restored from the state file written by pause-demo.ps1 (defaults to min-replicas 1 if the
  file is missing — which also makes this a valid recovery path after an unplanned replica move).

  Strategy + rationale: analysis/10-ephemeral-state-snapshots.md

.EXAMPLE
  ./scripts/azure/resume-demo.ps1
.EXAMPLE
  ./scripts/azure/resume-demo.ps1 -SkipRehydrate      # start everything WITHOUT restoring snapshots
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$Subscription,
  [switch]$SkipRehydrate,
  [switch]$SkipTemporalInit,
  [int]$ThrottleLimit = 10,
  [string]$StateFile = (Join-Path $PSScriptRoot '.demo-scale-state.json')
)

$ErrorActionPreference = 'Stop'
if (-not $Subscription) { $Subscription = az account show --query id -o tsv }
az account set --subscription $Subscription | Out-Null

$storesTier   = @('postgresql', 'qdrant', 'minio', 'spicedb')
$platformTier = @('temporal', 'keycloak')

# ---- saved scale (min/max per app); default 1 when unknown -------------------
$saved = @{}
if (Test-Path $StateFile) {
  $st = Get-Content $StateFile -Raw | ConvertFrom-Json
  foreach ($p in $st.apps.PSObject.Properties) { $saved[$p.Name] = @{ min = [int]$p.Value.min; max = [int]$p.Value.max } }
  Write-Host "   loaded saved scale from $StateFile" -ForegroundColor DarkGray
}
else {
  Write-Warning "no state file ($StateFile) — resuming all apps to min-replicas 1 / max-replicas 1"
}
function Get-TargetMin([string]$app) {
  if ($saved.ContainsKey($app) -and [int]$saved[$app].min -ge 1) { return [int]$saved[$app].min } else { return 1 }
}
function Get-TargetMax([string]$app) {
  if ($saved.ContainsKey($app) -and [int]$saved[$app].max -ge 1) { return [int]$saved[$app].max } else { return 1 }
}

# ---- scale helper (parallel on PowerShell 7+); min- and max-replicas set explicitly ----
function Set-AppsScale {
  param([string[]]$Apps, [hashtable]$MinByApp, [hashtable]$MaxByApp, [int]$Throttle = 10)
  $Apps = @($Apps | Where-Object { $_ })
  if ($Apps.Count -eq 0) { return }
  $rg = $ResourceGroup
  if ($PSVersionTable.PSVersion.Major -ge 7 -and $Throttle -gt 1 -and $Apps.Count -gt 1) {
    $results = $Apps | ForEach-Object -ThrottleLimit $Throttle -Parallel {
      $app = $_; $rg = $using:rg; $min = ($using:MinByApp)[$app]; $max = ($using:MaxByApp)[$app]
      az containerapp update -n $app -g $rg --min-replicas $min --max-replicas $max --output none 2>$null | Out-Null
      [pscustomobject]@{ App = $app; Min = $min; Max = $max; Ok = ($LASTEXITCODE -eq 0) }
    }
  }
  else {
    $results = foreach ($app in $Apps) {
      $min = $MinByApp[$app]; $max = $MaxByApp[$app]
      az containerapp update -n $app -g $rg --min-replicas $min --max-replicas $max --output none 2>$null | Out-Null
      [pscustomobject]@{ App = $app; Min = $min; Max = $max; Ok = ($LASTEXITCODE -eq 0) }
    }
  }
  foreach ($r in ($results | Sort-Object App)) {
    if ($r.Ok) { Write-Host ("   {0,-26} min={1} max={2}" -f $r.App, $r.Min, $r.Max) -ForegroundColor DarkGray }
    else { Write-Warning ("   {0,-26} FAILED (min={1} max={2})" -f $r.App, $r.Min, $r.Max) }
  }
  $bad = @($results | Where-Object { -not $_.Ok })
  if ($bad.Count -gt 0) { throw "scale update failed: $($bad.App -join ', ')" }
}

# ---- ACA Job trigger helpers (temporal-init) --------------------------------
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

# ---- current apps -----------------------------------------------------------
$allNames = @(az containerapp list -g $ResourceGroup --query "[].name" -o tsv)
if (-not $allNames) { throw "no container apps found in resource group '$ResourceGroup'" }

# ---------------------------------------------------------------------------
# 1. Start the stateful stores (they come up EMPTY; the rehydrate jobs repopulate them).
# ---------------------------------------------------------------------------
$storeNames = @($allNames | Where-Object { $_ -in $storesTier })
Write-Host "== resume-demo :: starting stateful stores ($($storeNames.Count)) ==" -ForegroundColor Cyan
$mn = @{}; $mx = @{}; $storeNames | ForEach-Object { $mn[$_] = Get-TargetMin $_; $mx[$_] = Get-TargetMax $_ }
Set-AppsScale -Apps $storeNames -MinByApp $mn -MaxByApp $mx -Throttle $ThrottleLimit

# ---------------------------------------------------------------------------
# 2. Rehydrate from the last snapshot (jobs self-wait for each store; Temporal is still down).
# ---------------------------------------------------------------------------
if (-not $SkipRehydrate) {
  Write-Host '== resume-demo :: rehydrating stores from snapshots ==' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'restore-all.ps1') -ResourceGroup $ResourceGroup -Subscription $Subscription
}
else {
  Write-Warning '-SkipRehydrate set: stores started EMPTY — no snapshot data restored.'
}

# ---------------------------------------------------------------------------
# 3. Start the platform tier (temporal now reads the restored Postgres; keycloak re-imports its realm).
# ---------------------------------------------------------------------------
$platNames = @($allNames | Where-Object { $_ -in $platformTier })
Write-Host "== resume-demo :: starting platform tier ($($platNames -join ', ')) ==" -ForegroundColor Cyan
$mn = @{}; $mx = @{}; $platNames | ForEach-Object { $mn[$_] = Get-TargetMin $_; $mx[$_] = Get-TargetMax $_ }
Set-AppsScale -Apps $platNames -MinByApp $mn -MaxByApp $mx -Throttle $ThrottleLimit

# ---------------------------------------------------------------------------
# 4. Re-assert Temporal search attributes / retention (idempotent; self-waits for SERVING).
# ---------------------------------------------------------------------------
if (-not $SkipTemporalInit -and ($platNames -contains 'temporal')) {
  Write-Host '== resume-demo :: temporal-init ==' -ForegroundColor Cyan
  $exec = Start-AcaJob 'temporal-init'
  $status = Wait-AcaJob 'temporal-init' $exec
  if ($status -ne 'Succeeded') { Write-Warning "temporal-init => $status" }
}

# ---------------------------------------------------------------------------
# 5. Start the remaining app tier (HTTP services, workers, frontend, proxies).
# ---------------------------------------------------------------------------
$appNames = @($allNames | Where-Object { $_ -notin $storesTier -and $_ -notin $platformTier })
Write-Host "== resume-demo :: starting app tier ($($appNames.Count)) ==" -ForegroundColor Cyan
$mn = @{}; $mx = @{}; $appNames | ForEach-Object { $mn[$_] = Get-TargetMin $_; $mx[$_] = Get-TargetMax $_ }
Set-AppsScale -Apps $appNames -MinByApp $mn -MaxByApp $mx -Throttle $ThrottleLimit

# ---------------------------------------------------------------------------
# 6. Report.
# ---------------------------------------------------------------------------
$fqdn = az containerapp show -n frontend -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv 2>$null
Write-Host ''
Write-Host 'resume-demo complete.' -ForegroundColor Green
if ($fqdn) { Write-Host "  App:  https://$fqdn/app/" -ForegroundColor Green }
Write-Host '  Give the app tier a minute to finish starting, then verify the last demo state is present.' -ForegroundColor Green
