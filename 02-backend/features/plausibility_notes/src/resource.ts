import type { NodeVersionService } from "@spark-workflow/node-crud";
import { defineResource } from "@spark-workflow/resource";

import type { PlausibilityResults } from "./results.ts";

export interface PlausibilityNotesVersioningService extends NodeVersionService {
  sendResults(projectId: string, fileId: string, projectVersion?: number): Promise<PlausibilityResults>;
}

export const PlausibilityNotesVersioning = defineResource<PlausibilityNotesVersioningService>()(
  "plausibility-notes/Versioning",
);
