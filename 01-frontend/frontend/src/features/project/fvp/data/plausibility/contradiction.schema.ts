import type { Contradiction as ApiContradiction } from '@/api-clients/pns-module';

export type StoredContradiction = ApiContradiction & {
  projectId?: string;
  rating?: number | null;
};
