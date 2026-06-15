export const EWMS_UNASSIGNED_SUBTOPIC_SELECTION = '__none__';

export const isEwmsUnassignedSubtopicSelection = (
  subtopicId: string | undefined,
) => subtopicId === EWMS_UNASSIGNED_SUBTOPIC_SELECTION;
