import type {
  RequestItem,
  RequestItemPriority,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

export const PRIORITY_BADGE_VARIANT = {
  must: 'error',
  should: 'warningYellow',
} satisfies Record<RequestItemPriority, 'error' | 'warningYellow'>;

/** Sort comparator for request items by creation date ascending. */
export const sortByCreatedAtAsc = (a: RequestItem, b: RequestItem): number =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
