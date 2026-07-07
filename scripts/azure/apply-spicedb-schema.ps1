# Writes the SpiceDB schema (infra/spicedb-schema.zed) directly into the ephemeral SpiceDB.
# Run after initial setup and any time SpiceDB has restarted (in-memory datastore loses schema).
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$KeyVault = 'kv-sparkdemo',
    [string]$EnvironmentName = 'cae-spark-demo',
    [string]$Location = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    $schema = Get-Content -Raw infra/spicedb-schema.zed
    $token = az keyvault secret show --vault-name $KeyVault -n spicedb-token --query value -o tsv

    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{
            environmentName = @{ value = $EnvironmentName }
            spicedbToken = @{ value = $token }
            schemaText   = @{ value = $schema }
        }
    }
    if ($Location) { $p.parameters.location = @{ value = $Location } }
    $pf = Join-Path $env:TEMP 'spicedb-schema-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8

    Write-Host "== Deploying spicedb-schema job =="
    az deployment group create -g $ResourceGroup -n spicedb-schema-job `
        --template-file infra/spicedb-schema-job.bicep --parameters "@$pf" `
        --query "properties.provisioningState" -o tsv
    Remove-Item $pf -Force

    Write-Host "== Starting job =="
    az containerapp job start -n spicedb-schema -g $ResourceGroup --query "name" -o tsv | Out-Null

    Write-Host "== Waiting for completion =="
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 6
        $s = az containerapp job execution list -n spicedb-schema -g $ResourceGroup --query "[0].properties.status" -o tsv 2>$null
        Write-Host "  status: $s"
        if ($s -eq 'Succeeded') { Write-Host 'SCHEMA APPLIED'; break }
        if ($s -eq 'Failed') { Write-Host 'JOB FAILED'; break }
    }
}
finally {
    Pop-Location
}
