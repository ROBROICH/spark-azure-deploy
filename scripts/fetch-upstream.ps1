#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Populate this deploy repo with the upstream openCode SPARK Workflow source, then
  apply the overlay files and patches. Run before `azd up` or image builds.

.DESCRIPTION
  This repository holds ONLY the delta needed to run SPARK as an Azure demo
  (patches, Azure infra/scripts, demo data). The ~30-service application source is
  NOT vendored here; it is fetched from openCode on demand:

    1. shallow-clone openCode at -Ref into a temp dir;
    2. copy it into the repo root WITHOUT overwriting any delta file;
    3. copy overlay/* into the tree (new Azure files, e.g. Dockerfile.azure);
    4. apply patches/ (the source modifications).

  Fetch-only: openCode is never written to. The fetched source is gitignored.
#>
[CmdletBinding()]
param(
  [string]$Ref = 'spark-workflow-0.2',
  [string]$Upstream = 'https://gitlab.opencode.de/bmds/planungs-und-genehmigungsbeschleunigung/spark-workflow.git'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('opencode-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

Write-Host "Fetching openCode SPARK Workflow @ $Ref (read-only)..." -ForegroundColor Cyan
git clone --depth 1 --branch $Ref $Upstream $tmp
if ($LASTEXITCODE -ne 0) { throw "git clone of $Upstream failed" }

Write-Host 'Merging upstream into repo root (delta files preserved)...' -ForegroundColor Cyan
$tmpLen = (Resolve-Path $tmp).Path.Length
Get-ChildItem $tmp -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' -and $_.FullName -notmatch '[\\/]\.github[\\/]' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($tmpLen).TrimStart('\', '/')
    $target = Join-Path $root $rel
    if (-not (Test-Path -LiteralPath $target)) {
      $dir = Split-Path -Parent $target
      if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
      Copy-Item -LiteralPath $_.FullName -Destination $target
    }
  }
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host 'Applying overlay files...' -ForegroundColor Cyan
$overlay = Join-Path $root 'overlay'
$ovLen = (Resolve-Path $overlay).Path.Length
Get-ChildItem $overlay -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($ovLen).TrimStart('\', '/')
  $target = Join-Path $root $rel
  $dir = Split-Path -Parent $target
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Copy-Item -LiteralPath $_.FullName -Destination $target -Force
}

Write-Host 'Applying patches...' -ForegroundColor Cyan
& (Join-Path $root 'patches/apply-patches.ps1')
Write-Host "Upstream $Ref fetched, overlaid and patched. Ready for build / azd up." -ForegroundColor Green
