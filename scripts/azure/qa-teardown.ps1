<#
.SYNOPSIS
  Decommission the throwaway QA clone: delete rg-spark-qa and clean up the few things that live
  outside it. Live rg-spark-demo is never touched.

.DESCRIPTION
  Because the entire QA clone lives in a single resource group (and only ever READ the shared ACR /
  live vault / live migration share), teardown is essentially one `az group delete`. This script also:
    - restores infra/app-env.json to the committed (live) values, in case a provision run was
      interrupted mid stage-9 and left it regenerated for the QA domain;
    - removes the local .qa-clone-state.json cache.

  Nothing the QA env created leaks outside rg-spark-qa (no AAD app regs, no cross-scope role
  assignments, no ACR webhooks), so no extra cleanup is required.

.EXAMPLE
  ./scripts/azure/qa-teardown.ps1 -Suffix qa12345           # dry run (shows what would be deleted)
.EXAMPLE
  ./scripts/azure/qa-teardown.ps1 -Suffix qa12345 -Yes      # actually delete
#>
[CmdletBinding()]
param(
  [string]$Suffix,
  [string]$ResourceGroup = 'rg-spark-qa',
  [switch]$Yes,
  [switch]$Wait,
  [string]$StateFile = (Join-Path $PSScriptRoot '.qa-clone-state.json')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Restore app-env.json (safety net if a provision run was interrupted mid stage-9).
$appEnv = Join-Path $repo 'infra/app-env.json'
if (Test-Path "$appEnv.live.bak") {
  Copy-Item "$appEnv.live.bak" $appEnv -Force
  Remove-Item "$appEnv.live.bak" -Force -ErrorAction SilentlyContinue
  Write-Host 'restored infra/app-env.json from .live.bak' -ForegroundColor DarkGray
}
elseif (Get-Command git -ErrorAction SilentlyContinue) {
  git -C $repo checkout -- infra/app-env.json 2>$null
  Write-Host 'restored infra/app-env.json from git (if it was modified)' -ForegroundColor DarkGray
}

$exists = az group exists -n $ResourceGroup -o tsv
if ($exists -ne 'true') {
  Write-Host "resource group '$ResourceGroup' does not exist — nothing to delete." -ForegroundColor Green
  Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
  return
}

Write-Host "Resources in '$ResourceGroup' to be DELETED:" -ForegroundColor Yellow
az resource list -g $ResourceGroup --query "[].{name:name,type:type}" -o table

if (-not $Yes) {
  Write-Host ''
  Write-Host "DRY RUN — nothing deleted. Re-run with -Yes to delete resource group '$ResourceGroup'." -ForegroundColor Cyan
  return
}

Write-Host ''
Write-Host "Deleting resource group '$ResourceGroup'..." -ForegroundColor Red
if ($Wait) {
  az group delete -n $ResourceGroup --yes -o none
  Write-Host "deleted '$ResourceGroup'." -ForegroundColor Green
}
else {
  az group delete -n $ResourceGroup --yes --no-wait -o none
  Write-Host "delete started (--no-wait) for '$ResourceGroup'." -ForegroundColor Green
}
Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
Write-Host 'QA clone decommissioned. Live rg-spark-demo untouched.' -ForegroundColor Green
