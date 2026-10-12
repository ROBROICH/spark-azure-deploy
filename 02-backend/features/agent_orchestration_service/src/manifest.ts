import { AdministrativeFileDraftVersioning } from "@spark-workflow/administrative-file-draft/versioning";
import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { ProjectLogicVersioning, Projects } from "@spark-workflow/core/projects/resource";
import { ExaminationVersioning } from "@spark-workflow/examination-service/resource";
import { FormalCompletenessVersioning } from "@spark-workflow/formal-completeness-check/versioning";
import { FppDownloads, FppFiles } from "@spark-workflow/fpp-service/resource";
import { Objections } from "@spark-workflow/objections-management-service/resource";
import { PlausibilityNotesVersioning } from "@spark-workflow/plausibility-notes/resource";
import { defineFeature } from "@spark-workflow/resource";

import { AosTemporalCommands } from "./resource.ts";
import { aosTemporalCommandsProvider, fppDownloadsProvider } from "./runtime.ts";

export const feature = defineFeature({
  id: "agent-orchestration",
  needs: {
    projects: Projects,
    documents: DocumentFiles,
    projectLogic: ProjectLogicVersioning,
    formalCompleteness: FormalCompletenessVersioning,
    plausibility: PlausibilityNotesVersioning,
    examination: ExaminationVersioning,
    administrativeFileDraft: AdministrativeFileDraftVersioning,
    fppFiles: FppFiles,
    objections: Objections,
    commands: AosTemporalCommands,
    fppDownloads: FppDownloads,
  },
  providers: [aosTemporalCommandsProvider, fppDownloadsProvider],
  tables: {},
});
