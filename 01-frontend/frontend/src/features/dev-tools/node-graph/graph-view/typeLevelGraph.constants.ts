import type { NodeTypeLiteral } from '@/db/nodes/types';

export const ROOT_TYPE: NodeTypeLiteral = 'project';
export const TOPIC_TYPE: NodeTypeLiteral = 'topic';
const BETEILIGUNGS_EINGANG_TYPE: NodeTypeLiteral = 'beteiligungs_eingang';
export const PROJECT_SCOPED_ROOT_TYPES = [
  TOPIC_TYPE,
  BETEILIGUNGS_EINGANG_TYPE,
] satisfies NodeTypeLiteral[];
export const TOPIC_NORM_TYPE = 'topic_norm' as NodeTypeLiteral;

export function isProjectScopedRootType(type: NodeTypeLiteral) {
  return PROJECT_SCOPED_ROOT_TYPES.some(
    (projectScopedType) => projectScopedType === type,
  );
}
