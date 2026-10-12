import type { SupplementaryRequestResponse } from '@/api-clients/backend';
import { z } from 'zod';

/**
 * Source of a request item.
 * - tableOfContents: Empty folder in table of contents (FVP)
 * - requiredDocuments: Missing required document (FVP)
 * - contradiction: From contradiction/hint (PP)
 * - materialLaw: From MVP law card actions
 * - materialNorm: From MVP norm actions
 * - materialSatz: From MVP sentence actions
 * - materialFundstelle: From MVP source reference actions
 * - manual: Manually added (both)
 */
const requestItemSourceSchema = z.enum([
  'tableOfContents',
  'requiredDocuments',
  'contradiction',
  'materialLaw',
  'materialNorm',
  'materialSatz',
  'materialFundstelle',
  'manual',
]);

export const requestItemSourceRefSchema = z.object({
  type: requestItemSourceSchema,
  itemId: z.string().optional(),
});

export type RequestItemSourceRef = z.infer<typeof requestItemSourceRefSchema>;

/**
 * Priority level for a request item.
 * - must: Required/mandatory document
 * - should: Recommended document
 */
const requestItemPrioritySchema = z.enum(['must', 'should']);

export type RequestItemPriority = z.infer<typeof requestItemPrioritySchema>;

/**
 * Schema for request list items (Nachforderungsliste)
 */
export const requestItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceRef: requestItemSourceRefSchema.optional(),
  documentId: z.string().optional(),
  topicId: z.string().optional(),
  priority: requestItemPrioritySchema,
  title: z.string(),
  reason: z.string(),
  createdAt: z.coerce.date(),
  includedInLetter: z.boolean().default(false),
});

export type RequestItem = z.infer<typeof requestItemSchema>;
const fromApiSourceRef = (
  sourceRef: SupplementaryRequestResponse['sourceRef'],
): RequestItemSourceRef | undefined => {
  if (sourceRef === null) {
    return undefined;
  }
  const parsed = requestItemSourceRefSchema.safeParse({
    type: sourceRef.type,
    itemId: sourceRef.itemId,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
};
export const requestItemFromApi = (
  item: SupplementaryRequestResponse,
): RequestItem =>
  requestItemSchema.parse({
    id: item.id,
    projectId: item.projectId,
    sourceRef: fromApiSourceRef(item.sourceRef),
    priority: item.priority,
    title: item.title,
    reason: item.reason,
    createdAt: new Date(String(item.createdAt)),
    topicId: item.topicId ?? undefined,
    documentId: item.documentId ?? undefined,
    includedInLetter: item.includedInLetter,
  });

type RequestSourceLike = {
  sourceRef?: RequestItemSourceRef;
};

export const getRequestItemSourceRef = (
  item: RequestSourceLike,
): RequestItemSourceRef | undefined => {
  if (item.sourceRef) {
    return item.sourceRef;
  }
  return undefined;
};

export const getRequestItemSourceType = (item: RequestSourceLike) =>
  getRequestItemSourceRef(item)?.type;

export const getRequestItemSourceItemId = (item: RequestSourceLike) =>
  getRequestItemSourceRef(item)?.itemId;
