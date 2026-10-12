import type { WorkflowStartTimeSource } from '@/features/workflow-runtime/workflow-status/workflowProgressPrediction';
import { FileScan, FileSearch, ListTree, type LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { TableOfContentsResultCard } from './TableOfContentsResultCard';
import { PlausibilityResultCard } from './PlausibilityResultCard';
import { RequiredDocumentsResultCard } from './RequiredDocumentsResultCard';

const ONE_HOUR_MS = 60 * 60_000;
const THREE_HOURS_MS = 3 * 60 * 60_000;

export type AiAnalysisTaskId =
  | 'tableOfContents'
  | 'requiredDocuments'
  | 'plausibility';

export type AiAnalysisTaskConfig = {
  descriptionKey: string;
  estimatedDurationMs: number;
  icon: LucideIcon;
  id: AiAnalysisTaskId;
  titleKey: string;
};

export type TaskProgress = {
  isDone: boolean;
  isLoading: boolean;
  workflow: WorkflowStartTimeSource;
};

export const AI_ANALYSIS_TASKS = [
  {
    descriptionKey: 'redesign.aiAnalysis.cards.tableOfContents.description',
    estimatedDurationMs: ONE_HOUR_MS,
    icon: ListTree,
    id: 'tableOfContents',
    titleKey: 'redesign.aiAnalysis.cards.tableOfContents.title',
  },
  {
    descriptionKey: 'redesign.aiAnalysis.cards.requiredDocuments.description',
    estimatedDurationMs: ONE_HOUR_MS,
    icon: FileSearch,
    id: 'requiredDocuments',
    titleKey: 'redesign.aiAnalysis.cards.requiredDocuments.title',
  },
  {
    descriptionKey: 'redesign.aiAnalysis.cards.plausibility.description',
    estimatedDurationMs: THREE_HOURS_MS,
    icon: FileScan,
    id: 'plausibility',
    titleKey: 'redesign.aiAnalysis.cards.plausibility.title',
  },
] satisfies AiAnalysisTaskConfig[];

// Single source of truth for which result card represents each task when the
// progressive analysis section switches a completed task slot to its result.
export const RESULT_CARD_BY_TASK_ID = {
  tableOfContents: TableOfContentsResultCard,
  requiredDocuments: RequiredDocumentsResultCard,
  plausibility: PlausibilityResultCard,
} satisfies Record<
  AiAnalysisTaskId,
  ComponentType<{ projectId: string; statusAddon?: ReactNode }>
>;
