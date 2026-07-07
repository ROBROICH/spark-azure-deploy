#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Produce the golden "seed pack" from a live SPARK environment so a fresh
  deployment can be seeded with the same demo content (seed-demo.ps1).

.DESCRIPTION
  One-time / per-release maintainer action. Steps:
    1. (unless -SkipSnapshot) run snapshot-all.ps1 to capture the CURRENT live
       state (case B247, legal corpus + synthetic embeddings, extraction
       vectors, document blobs, SpiceDB data) into the live `snapshots` share.
       This READS the live stores and WRITES the live snapshots share; it does
       NOT modify live application data.
    2. download the `snapshots` share to -OutDir.
    3. (with -Compress) pack -OutDir into <OutDir>.tar.gz for publishing. The
       sync-and-build pipeline attaches this to the release; seed-demo.ps1 then
       consumes it via SPARK_SEED_PACK_URL.

  RUN THIS ONLY when refreshing the golden demo content — it triggers snapshot
  jobs against the live environment.

.EXAMPLE
  ./scripts/azure/make-seed-pack.ps1 -Compress
.EXAMPLE
  ./scripts/azure/make-seed-pack.ps1 -SkipSnapshot            # reuse the last live snapshot
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-spark-demo',
  [string]$OutDir = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'seed-pack'),
  [string]$ShareName = 'snapshots',
  [switch]$SkipSnapshot,
  [switch]$Compress
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

if (-not $SkipSnapshot) {
  Write-Host '== capturing live snapshot (snapshot-all.ps1) ==' -ForegroundColor Cyan
  & (Join-Path $here 'snapshot-all.ps1') -ResourceGroup $ResourceGroup
}

# Resolve the `snapshots` share on whichever ACA env in the RG has it registered.
$acct = $null; $share = $ShareName
$envNames = @(az containerapp env list -g $ResourceGroup --query "[].name" -o tsv)
foreach ($envName in $envNames) {
  $sj = az containerapp env storage show -n $envName -g $ResourceGroup --storage-name $ShareName -o json 2>$null | ConvertFrom-Json
  if ($sj.properties.azureFile.accountName) { $acct = $sj.properties.azureFile.accountName; $share = $sj.properties.azureFile.shareName; break }
}
if (-not $acct) { throw "make-seed-pack: no '$ShareName' storage registered on any ACA env in $ResourceGroup" }
$key = az storage account keys list -g $ResourceGroup -n $acct --query "[0].value" -o tsv
if (-not $key) { throw "make-seed-pack: could not read storage key for $acct" }

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Write-Host "== downloading $acct/$share -> $OutDir ==" -ForegroundColor Cyan
az storage file download-batch --account-name $acct --account-key $key --source $share --destination $OutDir --only-show-errors | Out-Null

$size = (Get-ChildItem -Recurse -File $OutDir | Measure-Object -Property Length -Sum).Sum
Write-Host ("   seed pack: {0:N1} MB in {1}" -f ($size / 1MB), $OutDir) -ForegroundColor Green

if ($Compress) {
  $tar = "$OutDir.tar.gz"
  if (Test-Path $tar) { Remove-Item $tar -Force }
  Write-Host "== compressing -> $tar ==" -ForegroundColor Cyan
  tar -czf $tar -C $OutDir .
  Write-Host ("   {0:N1} MB" -f ((Get-Item $tar).Length / 1MB)) -ForegroundColor Green
  Write-Host 'Publish this .tar.gz as the seed pack; the pipeline (P5) attaches it to the release and seed-demo.ps1 reads SPARK_SEED_PACK_URL.' -ForegroundColor Yellow
}
