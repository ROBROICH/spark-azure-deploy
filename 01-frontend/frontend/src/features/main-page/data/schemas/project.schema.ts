import type { ProjectResponse } from '@/api-clients/backend/types.gen';

export const ProjectStatus = {
  InBearbeitung: 'In Bearbeitung',
  Offen: 'Offen',
  Genehmigt: 'Genehmigt',
} as const;

/** Project as used in the app — currently a direct alias for the API response type. */
export type Project = ProjectResponse;
