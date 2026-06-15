import { z } from 'zod';
import { FEEDBACK_TARGET_TYPES } from '@/features/feedback/feedbackTarget';

const LEFT_PANEL_TAB_VALUES = ['dokumente', 'rechtsgrundlage'] as const;
const MVP_LANE_ORDER_PREFERENCE_VALUES = [
  'documentsFirst',
  'rechtsgrundlageFirst',
] as const;

export type MvpLeftPanelTab = (typeof LEFT_PANEL_TAB_VALUES)[number];
export type MvpLaneOrderPreference =
  (typeof MVP_LANE_ORDER_PREFERENCE_VALUES)[number];

export const mvpLaneOrderPreferenceSchema = z.enum(
  MVP_LANE_ORDER_PREFERENCE_VALUES,
);

export const mvpLeftPanelTabSearchSchema = z.object({
  leftPanelTab: z.enum(LEFT_PANEL_TAB_VALUES).optional().catch(undefined),
});

const mvpBaseSearchSchema = z.object({
  search: z.string().optional(),
  topicAssigneeIds: z.array(z.string()).catch([]).optional(),
  topicSort: z.enum(['titleAsc', 'titleDesc']).optional(),
  topicStatus: z.enum(['open', 'inProgress', 'complete']).optional(),
  laneOrder: mvpLaneOrderPreferenceSchema.optional().catch(undefined),
  previewDocumentId: z.string().optional(),
  selectedDocumentId: z.string().optional(),
  selectedNormId: z.string().optional(),
  detailDocumentId: z.string().optional(),
  rechtsgrundlageLawGroupId: z.string().optional(),
  lawChangeId: z.string().optional(),
  feedbackRating: z.enum(['positive', 'negative']).optional(),
  feedbackTargetId: z.string().optional(),
  feedbackTargetType: z.enum(FEEDBACK_TARGET_TYPES).optional(),
});

export const mvpSearchSchema = mvpBaseSearchSchema.extend(
  mvpLeftPanelTabSearchSchema.partial().shape,
);

export type MvpSearch = z.infer<typeof mvpSearchSchema>;
