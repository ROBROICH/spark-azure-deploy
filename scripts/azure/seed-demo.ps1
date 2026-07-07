#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Seed a fresh SPARK environment with the golden demo content by rehydrating a
  published "seed pack" into the env's snapshots share.

.DESCRIPTION
  Called by deploy-all.ps1 AFTER the stores, the `snapshots` share, and the
  *-rehydrate ACA Jobs are provisioned. It:
    1. Acquires the seed pack (a copy of a golden `snapshots` share) from either
       SPARK_SEED_PACK_PATH (a local directory) or SPARK_SEED_PACK_URL (a
       .tar.gz/.zip produced by the sync-and-build pipeline, e.g. a GitHub
       Release asset).
    2. Uploads it into THIS environment's `snapshots` Azure Files share.
    3. Runs restore-all.ps1 to rehydrate pg -> qdrant -> minio -> spicedb.

  The pack carries case B247, the legal corpus + synthetic embeddings, the
  extraction vectors, the document blobs, and the SpiceDB authorization data.
  Temporal search-attribute init is NOT run here — deploy-all.ps1 runs
  `temporal-init` in the temporal stage, right after this, once the Temporal
  server is up against the restored databases.

  Produce the pack once from the live golden env with make-seed-pack.ps1. If no
  seed pack is configured, seeding is skipped so a bare `azd up` still completes
  (with empty stores).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ResourceGroup,
  [string]$KeyVault,
  [string]$EnvironmentName,
  [string]$Location,
  [Parameter(Mandatory)][string]$StorageAccount,
  [string]$ShareName = 'snapshots',
  [string]$SeedPackPath = $env:SPARK_SEED_PACK_PATH,
  [string]$SeedPackUrl = $env:SPARK_SEED_PACK_URL
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

# --- 1) acquire the seed pack ------------------------------------------------
$packDir = $null
$tempRoot = $null
if ($SeedPackPath -and (Test-Path $SeedPackPath)) {
  $packDir = (Resolve-Path $SeedPackPath).Path
  Write-Host "seed-demo: using local seed pack $packDir"
}
elseif ($SeedPackUrl) {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('spark-seed-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $archive = Join-Path $tempRoot ([System.IO.Path]::GetFileName($SeedPackUrl.Split('?')[0]))
  Write-Host "seed-demo: downloading seed pack $SeedPackUrl"
  Invoke-WebRequest -Uri $SeedPackUrl -OutFile $archive -UseBasicParsing
  $packDir = Join-Path $tempRoot 'pack'
  New-Item -ItemType Directory -Path $packDir -Force | Out-Null
  if ($archive -match '\.zip$') { Expand-Archive -Path $archive -DestinationPath $packDir -Force }
  else { tar -xzf $archive -C $packDir }
}
else {
  Write-Warning 'seed-demo: no seed pack configured (set SPARK_SEED_PACK_PATH or SPARK_SEED_PACK_URL). Skipping seed; stores remain EMPTY.'
  return
}

# If the pack unpacked into a single wrapper folder, descend into it.
$entries = @(Get-ChildItem -Path $packDir)
if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) { $packDir = $entries[0].FullName }

# --- 2) upload into this env's snapshots share -------------------------------
$key = az storage account keys list -g $ResourceGroup -n $StorageAccount --query "[0].value" -o tsv
if (-not $key) { throw "seed-demo: could not read storage key for $StorageAccount" }
az storage share create --account-name $StorageAccount --account-key $key --name $ShareName --only-show-errors | Out-Null
Write-Host "seed-demo: uploading seed pack -> $StorageAccount/$ShareName"
az storage file upload-batch --account-name $StorageAccount --account-key $key --destination $ShareName --source $packDir --only-show-errors | Out-Null

# --- 3) rehydrate the stores from the share ----------------------------------
Write-Host 'seed-demo: rehydrating stores (restore-all.ps1)'
& (Join-Path $here 'restore-all.ps1') -ResourceGroup $ResourceGroup

if ($tempRoot -and (Test-Path $tempRoot)) { Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host 'seed-demo: done' -ForegroundColor Green
