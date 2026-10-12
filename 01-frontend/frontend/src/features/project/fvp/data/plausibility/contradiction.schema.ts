import type { Contradiction as ApiContradiction } from '@/api-clients/backend';

export type StoredContradiction = ApiContradiction & {
  projectId?: string;
  rating?: number | null;
};
