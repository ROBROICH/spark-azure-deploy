import { auditLogs } from "@spark-workflow/audit-client/schema";
import { feature as administrativeFileDraft } from "@spark-workflow/administrative-file-draft/manifest";
import { feature as agentOrchestration } from "@spark-workflow/agent-orchestration-service/manifest";
import { feature as comments } from "@spark-workflow/comment-service/manifest";
import { coreFeature as core } from "@spark-workflow/core/manifest";
import { feature as examination } from "@spark-workflow/examination-service/manifest";
import { feature as feedback } from "@spark-workflow/feedback-service/manifest";
import { feature as formalCompleteness } from "@spark-workflow/formal-completeness-check/manifest";
import { feature as fpp } from "@spark-workflow/fpp-service/manifest";
import { feature as identity } from "@spark-workflow/identity-management-service/manifest";
import { feature as objections } from "@spark-workflow/objections-management-service/manifest";
import { feature as plausibility } from "@spark-workflow/plausibility-notes/manifest";
import { combineTables } from "@spark-workflow/resource";
import { feature as supplementaryRequests } from "@spark-workflow/supplementary-requests-service/manifest";
import { feature as temporalJobs } from "@spark-workflow/temporal-job-service/manifest";

export const registeredFeatures = [
  core,
  administrativeFileDraft,
  agentOrchestration,
  comments,
  examination,
  feedback,
  formalCompleteness,
  fpp,
  identity,
  objections,
  plausibility,
  supplementaryRequests,
  temporalJobs,
] as const;

export const applicationSchema = combineTables([
  { id: "application-audit", tables: { auditLogs } },
  ...registeredFeatures,
]);
