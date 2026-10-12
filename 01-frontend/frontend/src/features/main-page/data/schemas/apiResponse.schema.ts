import type { DeadlineResponse } from '@/api-clients/backend';
import { z } from 'zod';

/**
 * Runtime validation schemas for the dashboard collection API boundaries.
 *
 * Generated client types describe the contract but do not validate at runtime.
 * Parsing responses here keeps malformed rows out of TanStack DB state and
 * surfaces contract drift as a request error instead of silently corrupted UI.
 *
 * The `satisfies` checks below tie each schema's inferred output back to the
 * generated response type so the schema cannot drift from the API contract
 * without a type error.
 */

const deadlineResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  deadlineType: z.string(),
  legalBasis: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<DeadlineResponse>;

export const deadlineResponseArraySchema = z.array(deadlineResponseSchema);
