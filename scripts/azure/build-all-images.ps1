# Build + push all SPARK app-tier images to ACR using local Docker BuildKit.
# ACR remote build can't handle the Dockerfiles' RUN --mount=type=cache (needs BuildKit);
# local Docker has BuildKit by default. Source matches the openCode spark-workflow-0.2 tag.
# Run detached; logs to build-all.log. Idempotent (re-run rebuilds; layers cached).
$ErrorActionPreference = 'Continue'
$acr = if ($env:SPARK_ACR_LOGIN_SERVER) { $env:SPARK_ACR_LOGIN_SERVER } else { '<your-registry>.azurecr.io' }
$tag = if ($env:SPARK_IMAGE_TAG) { $env:SPARK_IMAGE_TAG } else { '0.2' }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# image name -> Dockerfile path (context is always repo root; each Dockerfile builds --package X)
$images = @(
  @{ i = 'project-logic-service';            d = '02-backend/project_logic_service/Dockerfile' },
  @{ i = 'document-management-service';       d = '02-backend/document_management_service/Dockerfile' },
  @{ i = 'formal-completeness-check';         d = '02-backend/formal_completeness_check/Dockerfile' },
  @{ i = 'agent-orchestration-service';       d = '02-backend/agent_orchestration_service/Dockerfile' },
  @{ i = 'plausibility-notes';                d = '02-backend/plausibility_notes/Dockerfile' },
  @{ i = 'objections-management-service';     d = '02-backend/objections_management_service/Dockerfile' },
  @{ i = 'fpp-service';                       d = '02-backend/fpp_service/Dockerfile' },
  @{ i = 'comment-service';                   d = '02-backend/comment_service/Dockerfile' },
  @{ i = 'examination-service';               d = '02-backend/examination_service/Dockerfile' },
  @{ i = 'administrative-file-draft';         d = '02-backend/administrative_file_draft/Dockerfile' },
  @{ i = 'feedback-service';                  d = '02-backend/feedback_service/Dockerfile' },
  @{ i = 'supplementary-requests-service';    d = '02-backend/supplementary_requests_service/Dockerfile' },
  @{ i = 'identity-management-service';       d = '02-backend/identity_management_service/Dockerfile' },
  @{ i = 'temporal-codec-service';            d = '02-backend/temporal_codec_service/Dockerfile' },
  @{ i = 'temporal-job-service';              d = '02-backend/temporal_job_service/Dockerfile' },
  @{ i = 'protocol-service';                  d = '02-backend/protocol_service/Dockerfile' },
  @{ i = 'gesetze-normen-db-service';         d = '04-shared-services/db-services/gesetze-normen-db-service/Dockerfile' },
  @{ i = 'gesetzesbegruendung-db-service';    d = '04-shared-services/db-services/gesetzesbegruendung-db-service/Dockerfile' },
  @{ i = 'jura-db-service';                   d = '04-shared-services/db-services/jura-db-service/Dockerfile' },
  @{ i = 'rechtsaenderungs-monitoring';       d = '04-shared-services/basiskomponenten/rechtsaenderungs-monitoring/Dockerfile' },
  @{ i = 'llm-client';                        d = '04-shared-services/llm/llm-client/Dockerfile' },
  @{ i = 'modul-formale-pruefung';            d = '05-modulcluster/modul-formale-pruefung/Dockerfile' },
  @{ i = 'modul-risikohinweiser';             d = '05-modulcluster/modul-risikohinweiser/Dockerfile' },
  @{ i = 'modul-inhaltsextraktion';           d = '05-modulcluster/modul-inhaltsextraktion/Dockerfile' },
  @{ i = 'modul-rechtsmethodik';              d = '05-modulcluster/modul-rechtsmethodik/Dockerfile' },
  @{ i = 'modul-bewertung';                   d = '05-modulcluster/modul-bewertung/Dockerfile' },
  @{ i = 'modul-einwendungsmanagement';       d = '05-modulcluster/modul-einwendungsmanagement/Dockerfile' },
  @{ i = 'modul-suche-und-zuordnung';         d = '05-modulcluster/modul-suche-und-zuordnung/Dockerfile' },
  @{ i = 'modul-plausibilitaet-pruefung';     d = '05-modulcluster/modul-plausibilitaet-pruefung/Dockerfile' },
  @{ i = 'modul-anonymisierung';              d = '05-modulcluster/modul-anonymisierung/Dockerfile' }
)

$ok = @(); $fail = @()
$n = 0
foreach ($m in $images) {
  $n++
  $img = "$acr/$($m.i):$tag"
  Write-Host "=== [$n/$($images.Count)] BUILD $($m.i) ($(Get-Date -Format HH:mm:ss)) ==="
  docker build --provenance=false -t $img -f $m.d .
  if ($LASTEXITCODE -ne 0) { $fail += $m.i; Write-Host "!!! BUILD FAILED $($m.i)"; continue }
  docker push $img
  if ($LASTEXITCODE -ne 0) { $fail += $m.i; Write-Host "!!! PUSH FAILED $($m.i)"; continue }
  $ok += $m.i
  Write-Host "+++ OK $($m.i)"
}
Write-Host "==================== BUILD SUMMARY ===================="
Write-Host "OK ($($ok.Count)): $($ok -join ', ')"
Write-Host "FAILED ($($fail.Count)): $($fail -join ', ')"
Write-Host "ALL-DONE"
