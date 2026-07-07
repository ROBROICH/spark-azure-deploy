<#
.SYNOPSIS
  Pause the whole SPARK demo: snapshot the stateful stores, then scale every container app to zero.

.DESCRIPTION
  "Everything having a state" — the four ephemeral stores (postgresql, qdrant, minio, spicedb) — is
  captured to the durable `snapshots` Azure Files share BEFORE anything is scaled down, so no data is
  lost when the ephemeral replicas are recycled. Then every container app in the resource group is set
  to `min-replicas 0` and idles down to €0 compute within the ACA scale-to-zero cooldown.

  Order (so the snapshot is taken against quiesced writers, stores still running):
    1. Persist each app's current scale to a state file (reversible resume).
    2. Scale the app + platform tier (everything except the 4 stores) to 0.
    3. snapshot-all.ps1  — capture the live store state (stores are still at min-1).
    4. Scale the 4 stateful stores to 0.

  Resume later with resume-demo.ps1 (starts the stores, rehydrates them, then starts the rest).

  Strategy + rationale: analysis/10-ephemeral-state-snapshots.md

.EXAMPLE
  ./scripts/azure/pause-demo.ps1
.EXAMPLE
  ./scripts/azure/pause-demo.ps1 -SkipSnapshot        # scale down WITHOUT capturing (data will be lost)
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$Subscription,
  [ValidateSet('pg', 'qdrant', 'minio', 'spicedb')]
  [string[]]$Stores = @('pg', 'qdrant', 'minio', 'spicedb'),
  [switch]$SkipSnapshot,
  [int]$ThrottleLimit = 10,
  [string]$StateFile = (Join-Path $PSScriptRoot '.demo-scale-state.json')
)

$ErrorActionPreference = 'Stop'
if (-not $Subscription) { $Subscription = az account show --query id -o tsv }
az account set --subscription $Subscription | Out-Null

# The four ephemeral stateful stores (must be snapshotted before they are scaled to zero).
$storesTier = @('postgresql', 'qdrant', 'minio', 'spicedb')

# ---------------------------------------------------------------------------
# Scale a set of apps (parallel on PowerShell 7+). Both min- and max-replicas are set explicitly
# (max from the captured state) so the change is exactly reversible and the CLI can't reset max.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 1. Snapshot current scale of every app for a reversible resume.
# ---------------------------------------------------------------------------
Write-Host '== pause-demo :: capturing current scale ==' -ForegroundColor Cyan
$apps = az containerapp list -g $ResourceGroup `
  --query "[].{name:name,min:properties.template.scale.minReplicas,max:properties.template.scale.maxReplicas}" `
  -o json | ConvertFrom-Json
if (-not $apps) { throw "no container apps found in resource group '$ResourceGroup'" }

$state = [ordered]@{
  capturedAt    = (Get-Date).ToUniversalTime().ToString('o')
  resourceGroup = $ResourceGroup
  apps          = [ordered]@{}
}
foreach ($a in ($apps | Sort-Object name)) {
  $min = if ($null -ne $a.min) { [int]$a.min } else { 1 }
  $max = if ($null -ne $a.max) { [int]$a.max } else { 1 }
  $state.apps[$a.name] = [ordered]@{ min = $min; max = $max }
}
$state | ConvertTo-Json -Depth 5 | Set-Content -Path $StateFile -Encoding utf8
Write-Host "   saved scale of $($apps.Count) apps -> $StateFile" -ForegroundColor DarkGray

$allNames   = @($apps.name)
$storeNames = @($allNames | Where-Object { $_ -in $storesTier })
$nonStore   = @($allNames | Where-Object { $_ -notin $storesTier })

# max-replicas is preserved from the captured state (all apps are max=1 in this demo).
$maxByApp = @{}
foreach ($n in $allNames) { $maxByApp[$n] = $state.apps[$n].max }

# ---------------------------------------------------------------------------
# 2. Scale everything EXCEPT the stateful stores to zero (quiesce the writers).
# ---------------------------------------------------------------------------
Write-Host "== pause-demo :: scaling app + platform tier to 0 ($($nonStore.Count) apps) ==" -ForegroundColor Cyan
$zero = @{}; $nonStore | ForEach-Object { $zero[$_] = 0 }
Set-AppsScale -Apps $nonStore -MinByApp $zero -MaxByApp $maxByApp -Throttle $ThrottleLimit

# ---------------------------------------------------------------------------
# 3. Capture the live store state (stores are still running at min-1).
# ---------------------------------------------------------------------------
if (-not $SkipSnapshot) {
  Write-Host '== pause-demo :: snapshotting stateful stores ==' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'snapshot-all.ps1') -ResourceGroup $ResourceGroup -Subscription $Subscription -Stores $Stores
}
else {
  Write-Warning '-SkipSnapshot set: NOT capturing store state — data WILL be lost when the stores scale to zero.'
}

# ---------------------------------------------------------------------------
# 4. Scale the stateful stores to zero.
# ---------------------------------------------------------------------------
Write-Host "== pause-demo :: scaling stateful stores to 0 ($($storeNames.Count)) ==" -ForegroundColor Cyan
$zeroS = @{}; $storeNames | ForEach-Object { $zeroS[$_] = 0 }
Set-AppsScale -Apps $storeNames -MinByApp $zeroS -MaxByApp $maxByApp -Throttle $ThrottleLimit

Write-Host ''
Write-Host 'pause-demo complete.' -ForegroundColor Green
Write-Host '  All apps set to min-replicas 0; they idle down to zero within the ACA cooldown (~a few min).' -ForegroundColor Green
Write-Host '  Resume with:  ./scripts/azure/resume-demo.ps1' -ForegroundColor Green
