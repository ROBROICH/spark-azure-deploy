/**
 * RPB-only feedback target node types. The RPB feedback flow accepts feedback
 * on Bewertung and Bewertung-Quelle nodes; other shared feedback targets such
 * as Fundstelle belong to other features and must not open here.
 */
const RPB_FEEDBACK_TARGET_NODE_TYPES = [
  'bewertung',
  'bewertung_quelle',
] as const;

export type RpbFeedbackTargetNodeType =
  (typeof RPB_FEEDBACK_TARGET_NODE_TYPES)[number];

/** Narrows a value to an RPB-only feedback target node type. */
export const isRpbFeedbackTargetNodeType = (
  value: string | undefined,
): value is RpbFeedbackTargetNodeType =>
  RPB_FEEDBACK_TARGET_NODE_TYPES.includes(value as RpbFeedbackTargetNodeType);
