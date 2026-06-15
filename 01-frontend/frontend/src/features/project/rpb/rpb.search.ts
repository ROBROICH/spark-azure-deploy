import { z } from 'zod';
import { createSwimlanesGroupSearchSchema } from '@/features/ui/swimlanes/swimlanes.search';
import { FEEDBACK_TARGET_TYPES } from '@/features/feedback/feedbackTarget';
import { isRpbFeedbackTargetNodeType } from './rpbFeedbackTarget';

const RPB_LEFT_PANEL_TAB_VALUES = ['gliederung', 'beschluss'] as const;
const RPB_KI_OVERVIEW_SECTION_VALUES = [
  'rechtsgrundlage',
  'beteiligungseingaenge',
  'documents',
] as const;

export type RpbLeftPanelTab = (typeof RPB_LEFT_PANEL_TAB_VALUES)[number];

export const rpbLeftPanelTabSearchSchema = createSwimlanesGroupSearchSchema(
  'rpbLeftPanelTab',
  RPB_LEFT_PANEL_TAB_VALUES,
);

const searchBooleanSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 'true');

const rpbBaseSearchSchema = z.object({
  outlineNodeId: z.string().optional(),
  amendmentDialogRowId: z.string().optional(),
  lawChangeId: z.string().optional(),
  topicId: z.string().optional(),
  gesetzId: z.string().optional(),
  topicNormId: z.string().optional(),
  showNormtext: searchBooleanSchema.optional(),
  satzId: z.string().optional(),
  rechtsmethodikSatzId: z.string().optional(),
  tbmId: z.string().optional(),
  previewDocumentId: z.string().optional(),
  selectedFundstelleId: z.string().optional(),
  showReviewLane: searchBooleanSchema.optional(),
  showViewerLane: searchBooleanSchema.optional(),
  aiOverviewSection: z.enum(RPB_KI_OVERVIEW_SECTION_VALUES).optional(),
  participationSubtopicId: z.string().optional(),
  aiLane: z.literal('risikohinweise').optional(),
  feedbackRating: z.enum(['positive', 'negative']).optional(),
  feedbackTargetId: z.string().optional(),
  // The enum stays the shared broad set so cross-route `<Link>`/`navigate`
  // spreads of the router-wide search union keep type-checking; the
  // route-level transform below rejects any non-RPB feedback target so only
  // `bewertung` / `bewertung_quelle` survive parsing on the RPB route.
  feedbackTargetType: z.enum(FEEDBACK_TARGET_TYPES).optional(),
});

const rpbSearchObjectSchema = rpbBaseSearchSchema.extend(
  rpbLeftPanelTabSearchSchema.partial().shape,
);

type RpbSearchInput = z.infer<typeof rpbSearchObjectSchema>;

const dropInvalidRpbFeedbackTarget = (
  search: RpbSearchInput,
): RpbSearchInput => {
  if (
    search.feedbackTargetType !== undefined &&
    !isRpbFeedbackTargetNodeType(search.feedbackTargetType)
  ) {
    return {
      ...search,
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
    };
  }

  return search;
};

export const rpbSearchSchema = rpbSearchObjectSchema.transform(
  dropInvalidRpbFeedbackTarget,
);

export type RpbSearch = z.infer<typeof rpbSearchSchema>;

export const clearRpbTopicScopedSearch = (search: RpbSearch): RpbSearch => {
  return {
    ...search,
    amendmentDialogRowId: undefined,
    lawChangeId: undefined,
    gesetzId: undefined,
    previewDocumentId: undefined,
    selectedFundstelleId: undefined,
    satzId: undefined,
    rechtsmethodikSatzId: undefined,
    showNormtext: undefined,
    tbmId: undefined,
    topicNormId: undefined,
    participationSubtopicId: undefined,
    feedbackRating: undefined,
    feedbackTargetId: undefined,
    feedbackTargetType: undefined,
  };
};

export const setRpbTopicSearch = (
  search: RpbSearch,
  topicId: string | undefined,
): RpbSearch => {
  if (topicId === undefined) {
    return {
      ...clearRpbTopicScopedSearch(search),
      topicId: undefined,
    };
  }

  return {
    ...(search.topicId === topicId
      ? search
      : clearRpbTopicScopedSearch(search)),
    topicId,
  };
};

export const setRpbOutlineSelectionSearch = (
  search: RpbSearch,
  outlineNodeId: string,
  topicId: string | undefined,
): RpbSearch => {
  if (topicId === undefined) {
    return {
      ...clearRpbTopicScopedSearch(search),
      outlineNodeId,
      topicId: undefined,
    };
  }

  return {
    ...setRpbTopicSearch(search, topicId),
    outlineNodeId,
  };
};
