# Deploys the public MinIO reverse proxy (infra/minio-public.bicep) so the browser can
# PUT/GET documents via presigned URLs. Prints the public URL to use for S3_EXTERNAL_URL.
param(
    [string]$ResourceGroup = 'rg-spark-demo',
    [string]$EnvironmentName = 'cae-spark-demo',
    [string]$Location = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
    $conf = Get-Content -Raw infra/minio-public.nginx.conf
    $p = @{
        '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{ nginxConf = @{ value = $conf }; environmentName = @{ value = $EnvironmentName } }
    }
    if ($Location) { $p.parameters.location = @{ value = $Location } }
    $pf = Join-Path $env:TEMP 'minio-public-params.json'
    $p | ConvertTo-Json -Depth 6 | Set-Content $pf -Encoding utf8

    Write-Host "== Deploying minio-public =="
    $url = az deployment group create -g $ResourceGroup -n minio-public `
        --template-file infra/minio-public.bicep --parameters "@$pf" `
        --query "properties.outputs.url.value" -o tsv
    Remove-Item $pf -Force
    Write-Host "MinIO public URL: $url"
}
finally {
    Pop-Location
}
