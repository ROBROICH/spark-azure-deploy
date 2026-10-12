import { z } from 'zod';

const successfulFileSchema = z
  .object({
    fileId: z.string(),
    filename: z.string(),
    action: z.string().optional(),
    file_size: z.union([z.number(), z.string()]).optional(),
    fileSize: z.union([z.number(), z.string()]).optional(),
    size: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const failedFileSchema = z
  .object({
    fileId: z.string().optional(),
    filename: z.string(),
    action: z.string().optional(),
    code: z.string().optional(),
    detail: z.string().optional(),
    error: z.string().optional(),
    error_code: z.string().optional(),
    errorCode: z.string().optional(),
    error_message: z.string().optional(),
    errorMessage: z.string().optional(),
    file_size: z.union([z.number(), z.string()]).optional(),
    fileSize: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
    size: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const workflowSummarySchema = z
  .object({
    total: z.number().optional(),
    succeeded: z.number().optional(),
    failed: z.number().optional(),
  })
  .passthrough();

const ewmsFileReviewResultSchema = z
  .object({
    successful: z.array(successfulFileSchema).default([]),
    failed: z.array(failedFileSchema).default([]),
    summary: workflowSummarySchema.optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type EwmsFileReviewResult = z.infer<typeof ewmsFileReviewResultSchema>;
export type EwmsFailedFileReviewResult = EwmsFileReviewResult['failed'][number];

export const parseEwmsFileReviewResult = (
  result: unknown,
): EwmsFileReviewResult => ewmsFileReviewResultSchema.parse(result);
