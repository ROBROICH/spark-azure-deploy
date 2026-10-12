import { processingFailureCodes, zipFailureCodes } from "@spark-temporal/contracts";

/** ZIP failures detected by ZIP processing; each has a matching `dmsErrors` catalog entry. */
export { zipFailureCodes };

export type ZipFailureCode = (typeof zipFailureCodes)[number];

/** Every failure code persisted on a ZIP and exposed to the frontend. */
export const zipWorkflowFailureCodes = [...zipFailureCodes, ...processingFailureCodes];

export type ZipWorkflowFailureCode = (typeof zipWorkflowFailureCodes)[number];
