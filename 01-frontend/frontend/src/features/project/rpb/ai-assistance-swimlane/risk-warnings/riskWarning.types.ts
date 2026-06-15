import type { NodePayloadByType } from '@/db/nodes/types';

export type Risk = NodePayloadByType<'risks'>;

export type RiskStatus = Risk['status'];
