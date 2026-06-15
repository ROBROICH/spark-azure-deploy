import { createSwimlanesGroupSearchSchema } from '@/features/ui/swimlanes/swimlanes.search';

const NACHFORDERUNGEN_LANE_IDS = ['list', 'letter'] as const;

export const nachforderungenTabSearchSchema = createSwimlanesGroupSearchSchema(
  'nachforderungenTab',
  NACHFORDERUNGEN_LANE_IDS,
);
