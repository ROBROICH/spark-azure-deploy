const MS_PER_MINUTE = 60_000;
const MAX_RUNNING_PROGRESS_PERCENT = 90;

export const getFakeProgressPercent = (props: {
  estimatedDurationMs: number;
  isDone?: boolean;
  now: number;
  startedAt: number;
}) => {
  const { estimatedDurationMs, isDone = false, now, startedAt } = props;

  if (isDone) {
    return 100;
  }

  const elapsedMs = Math.max(0, now - startedAt);
  const durationMs = Math.max(1, estimatedDurationMs);
  const progress = Math.floor((elapsedMs / durationMs) * 100);

  return Math.max(1, Math.min(MAX_RUNNING_PROGRESS_PERCENT, progress));
};

export const getFakeRemainingMinutes = (props: {
  estimatedDurationMs: number;
  now: number;
  startedAt: number;
}) => {
  const { estimatedDurationMs, now, startedAt } = props;
  const remainingMs = Math.max(0, estimatedDurationMs - (now - startedAt));

  return Math.max(1, Math.ceil(remainingMs / MS_PER_MINUTE));
};
