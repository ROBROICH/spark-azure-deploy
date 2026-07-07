# Deploys the idle auto-pause watchdog (infra/autopause-watchdog.bicep): a scheduled ACA Job that
# pauses the demo after >= IdleMinutes with no frontend traffic (and no running Temporal workflow).
#
# Deploy with -DryRun first to validate the decision logic (the watchdog logs what it WOULD do but
# never snapshots or scales down), trigger it once by hand, confirm the logs, then re-run WITHOUT
# -DryRun to enable enforcement.
#
#   ./scripts/azure/deploy-autopause-watchdog.ps1 -DryRun     # deploy in dry-run (safe) mode
#   az containerapp job start -n autopause-watchdog -g rg-spark-demo   # trigger a test run
#   ./scripts/azure/deploy-autopause-watchdog.ps1             # enable enforcement (10-min idle)
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$EnvironmentName = 'cae-spark-demo',
    [string]$Location = '',
    [int]$IdleMinutes = 10,
    [string]$CronExpression = '*/5 * * * *',
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{
            environmentName = @{ value = $EnvironmentName }
            idleMinutes     = @{ value = $IdleMinutes }
            cronExpression  = @{ value = $CronExpression }
            dryRun          = @{ value = [bool]$DryRun }
        }
    }
    if ($Location) { $p.parameters.location = @{ value = $Location } }
    $pf = Join-Path $env:TEMP 'autopause-watchdog-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8

    $mode = if ($DryRun) { 'DRY-RUN (logs only, no pause)' } else { 'ENFORCING (will pause when idle)' }
    Write-Host "== Deploying autopause-watchdog [$mode] — idle=${IdleMinutes}m cron='$CronExpression' ==" -ForegroundColor Green
    az deployment group create -g $ResourceGroup -n autopause-watchdog `
        --template-file infra/autopause-watchdog.bicep --parameters "@$pf" `
        --query "properties.provisioningState" -o tsv
    Remove-Item $pf -Force

    Write-Host ''
    Write-Host "Watchdog deployed as ACA Job 'autopause-watchdog' in $ResourceGroup." -ForegroundColor Green
    Write-Host "  Trigger a test run:  az containerapp job start -n autopause-watchdog -g $ResourceGroup" -ForegroundColor DarkGray
    Write-Host "  Tail its logs:       az containerapp job logs show -n autopause-watchdog -g $ResourceGroup --container watchdog --follow" -ForegroundColor DarkGray
    Write-Host "  Disable enforcement: re-run this script with -DryRun (or delete the Job)." -ForegroundColor DarkGray
}
finally {
    Pop-Location
}
