import { defineFeature } from "@spark-workflow/resource";

import {
  documentFilesProvider,
  documentManagementVersioningProvider,
  documentsProvider,
} from "../documents/src/data.ts";
import {
  DocumentNodes,
  documentNodesProvider,
  DocumentRuntimeResource,
  documentRuntimeProvider,
  documentTemporalCommandsProvider,
} from "../documents/src/runtime.ts";
import { documentEntities } from "../documents/src/v2-entities.ts";
import {
  ProjectNodes,
  projectNodesProvider,
  projectTemporalCommandsProvider,
  projectLogicVersioningProvider,
  projectsProvider,
  usecasesProvider,
} from "../projects/src/runtime.ts";
import { projectEntities } from "../projects/src/v2-entities.ts";
import {
  Applicants,
  applicantsProvider,
  ProjectConfiguration,
  Projects,
  ProjectTemporalCommands,
} from "../projects/src/resource.ts";
import {
  ProcessSteps,
  processStepsProvider,
  ProjectStatuses,
  projectStatusesProvider,
  ProjectTypes,
  projectTypesProvider,
} from "../projects/src/reference-data.ts";
import { Usecases } from "../usecases/src/resource.ts";
import { coreSchema } from "./schema.ts";

export const coreFeature = defineFeature({
  id: "core",
  needs: {
    documentRuntime: DocumentRuntimeResource,
    documentNodes: DocumentNodes,
    ...documentEntities.needs,
    projectConfiguration: ProjectConfiguration,
    projectCommands: ProjectTemporalCommands,
    projects: Projects,
    usecases: Usecases,
    applicants: Applicants,
    processSteps: ProcessSteps,
    projectStatuses: ProjectStatuses,
    projectTypes: ProjectTypes,
    projectNodes: ProjectNodes,
    ...projectEntities.needs,
  },
  providers: [
    documentTemporalCommandsProvider,
    documentRuntimeProvider,
    documentNodesProvider,
    ...documentEntities.providers,
    projectTemporalCommandsProvider,
    projectNodesProvider,
    projectsProvider,
    usecasesProvider,
    documentsProvider,
    documentFilesProvider,
    documentManagementVersioningProvider,
    projectLogicVersioningProvider,
    applicantsProvider,
    processStepsProvider,
    projectStatusesProvider,
    projectTypesProvider,
    ...projectEntities.providers,
  ],
  tables: coreSchema,
});
