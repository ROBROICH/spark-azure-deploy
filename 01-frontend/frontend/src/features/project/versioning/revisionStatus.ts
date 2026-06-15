import type { TopicNormStatus } from '@/db/nodes/types';

export type RevisionStatus = TopicNormStatus;
export type SatzRevisionStatuses = Readonly<
  Record<string, RevisionStatus | undefined>
>;

const toDenseSatzStatuses = (
  satzStatuses: SatzRevisionStatuses,
): Record<string, RevisionStatus> => {
  const denseStatuses: Record<string, RevisionStatus> = {};

  for (const [satzId, status] of Object.entries(satzStatuses)) {
    if (status !== undefined) {
      denseStatuses[satzId] = status;
    }
  }

  return denseStatuses;
};

export const isReviewCompleted = (status: RevisionStatus) => {
  return status === 'checked' || status === 'needs_revision';
};

export const isNeedsRevision = (status: RevisionStatus) => {
  return status === 'needs_revision';
};

export const isSatzStatusChecked = (status: RevisionStatus) => {
  return status === 'checked';
};

export const getNextReviewStatus = (
  currentStatus: RevisionStatus,
): RevisionStatus => {
  if (currentStatus === 'checked') {
    return 'unchecked';
  }

  return 'checked';
};

export const getSparseSatzStatus = (
  satzStatuses: SatzRevisionStatuses,
  satzId: string,
): RevisionStatus => {
  const status = satzStatuses[satzId];

  return status === 'checked' || status === 'needs_revision'
    ? status
    : 'unchecked';
};

export const setSparseSatzStatus = (
  satzStatuses: SatzRevisionStatuses,
  satzId: string,
  nextStatus: RevisionStatus,
): Record<string, RevisionStatus> => {
  const nextStatuses = toDenseSatzStatuses(satzStatuses);
  delete nextStatuses[satzId];

  if (nextStatus === 'unchecked') {
    return nextStatuses;
  }

  nextStatuses[satzId] = nextStatus;
  return nextStatuses;
};

export const toggleSparseSatzStatus = (
  satzStatuses: SatzRevisionStatuses,
  satzId: string,
): Record<string, RevisionStatus> => {
  const currentStatus = getSparseSatzStatus(satzStatuses, satzId);
  return setSparseSatzStatus(
    satzStatuses,
    satzId,
    getNextReviewStatus(currentStatus),
  );
};

const areAllSatzStatusesCompleted = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
) => {
  if (satzIds.length === 0) {
    return false;
  }

  return satzIds.every((satzId) =>
    isReviewCompleted(getSparseSatzStatus(satzStatuses, satzId)),
  );
};

export const isSparseSatzChecked = (
  satzStatuses: SatzRevisionStatuses,
  satzId: string,
) => {
  return isSatzStatusChecked(getSparseSatzStatus(satzStatuses, satzId));
};

export const areAllSatzStatusesChecked = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
) => {
  if (satzIds.length === 0) {
    return false;
  }

  return satzIds.every((satzId) => isSparseSatzChecked(satzStatuses, satzId));
};

export const countCheckedSatzStatuses = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
) => {
  return satzIds.filter((satzId) => isSparseSatzChecked(satzStatuses, satzId))
    .length;
};

export const hasAnySatzStatusNeedsRevision = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
) => {
  return satzIds.some((satzId) =>
    isNeedsRevision(getSparseSatzStatus(satzStatuses, satzId)),
  );
};

const clearSparseSatzStatuses = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
): Record<string, RevisionStatus> => {
  const nextStatuses = toDenseSatzStatuses(satzStatuses);

  for (const satzId of satzIds) {
    delete nextStatuses[satzId];
  }

  return nextStatuses;
};

const setSelectedSatzStatusesToChecked = (
  satzStatuses: Record<string, RevisionStatus>,
  satzIds: ReadonlyArray<string>,
) => {
  return satzIds.reduce<Record<string, RevisionStatus>>(
    (updatedStatuses, satzId) =>
      setSparseSatzStatus(updatedStatuses, satzId, 'checked'),
    satzStatuses,
  );
};

export const resolveBulkSatzStatuses = (
  satzStatuses: SatzRevisionStatuses,
  satzIds: ReadonlyArray<string>,
): Record<string, RevisionStatus> => {
  const uniqueSatzIds = Array.from(new Set(satzIds));
  const hasNeedsRevision = uniqueSatzIds.some(
    (satzId) => getSparseSatzStatus(satzStatuses, satzId) === 'needs_revision',
  );
  const clearedStatuses = clearSparseSatzStatuses(satzStatuses, uniqueSatzIds);

  if (hasNeedsRevision) {
    return setSelectedSatzStatusesToChecked(clearedStatuses, uniqueSatzIds);
  }

  const allCompleted = areAllSatzStatusesCompleted(satzStatuses, uniqueSatzIds);

  if (allCompleted) {
    return clearedStatuses;
  }

  return setSelectedSatzStatusesToChecked(clearedStatuses, uniqueSatzIds);
};
