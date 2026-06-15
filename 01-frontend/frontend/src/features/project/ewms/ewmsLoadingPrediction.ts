const MINUTES_PER_EWMS_FILE_BATCH = 30;
const EWMS_FILE_BATCH_SIZE = 100;
const MS_PER_MINUTE = 60_000;

export const getEwmsLoadingPredictionDurationMs = (fileCount: number) => {
  const scopedFileCount = Math.max(1, fileCount);

  return (
    (scopedFileCount / EWMS_FILE_BATCH_SIZE) *
    MINUTES_PER_EWMS_FILE_BATCH *
    MS_PER_MINUTE
  );
};
