#!/usr/bin/env pwsh
# Re-apply the Azure demo overlay patches onto an openCode source tree.
# See patches/README.md. Idempotent: already-applied patches are skipped.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$failed = $false
Get-ChildItem -Path 'patches' -Filter '*.patch' | Where-Object { $_.Name -match '^\d' } | Sort-Object Name | ForEach-Object {
    $p = "patches/$($_.Name)"
    & git apply --reverse --check $p 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "skip (already applied): $p"; return }
    & git apply --check $p 2>$null
    if ($LASTEXITCODE -eq 0) {
        & git apply --whitespace=nowarn $p
        Write-Host "applied: $p"
    }
    else {
        Write-Warning "FAILED (upstream drift - reconcile manually): $p"
        $script:failed = $true
    }
}
if ($failed) { exit 1 }
