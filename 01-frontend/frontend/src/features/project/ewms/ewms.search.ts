import { z } from 'zod';
import { createSwimlanesGroupSearchSchema } from '@/features/ui/swimlanes/swimlanes.search';
import {
  DEFAULT_EWMS_OBJECTION_SORT,
  EWMS_OBJECTION_SORT_VALUES,
} from './data/ewms.nodes';

const EWMS_TAB_VALUES = ['sender', 'topics'] as const;
const BETEILIGUNG_TYP_VALUES = [
  'einwendung',
  'stellungnahme',
  'naturschutz',
] as const;

const DOCUMENT_VIEWER_TAB_VALUES = ['extractedText', 'originalFile'] as const;

export const DEFAULT_EWMS_TAB = EWMS_TAB_VALUES[0];

export type EwmsTab = (typeof EWMS_TAB_VALUES)[number];

export type EwmsDocumentViewerTab = (typeof DOCUMENT_VIEWER_TAB_VALUES)[number];

export const ewmsMainTabSearchSchema = createSwimlanesGroupSearchSchema(
  'tab',
  EWMS_TAB_VALUES,
);

export const ewmsDocumentViewerTabSearchSchema =
  createSwimlanesGroupSearchSchema(
    'documentViewerTab',
    DOCUMENT_VIEWER_TAB_VALUES,
  );

const ewmsBaseSearchSchema = z.object({
  objectionsFilter: z
    .union([z.array(z.enum(BETEILIGUNG_TYP_VALUES)), z.undefined()])
    .catch(undefined),
  objectionsSearch: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .catch(undefined),
  objectionsSort: z
    .enum(EWMS_OBJECTION_SORT_VALUES)
    .catch(DEFAULT_EWMS_OBJECTION_SORT)
    .default(DEFAULT_EWMS_OBJECTION_SORT),
  selectedObjectionId: z.string().optional(),
  selectedTopicId: z.string().optional(),
  selectedSubtopicId: z.string().optional(),
  expandedTopicGroupId: z.string().optional(),
  selectedArgumentId: z.string().optional(),
  importDialogOpen: z.boolean().optional(),
  responseImportDialogOpen: z.boolean().optional(),
});

export const ewmsSearchSchema = ewmsBaseSearchSchema
  .extend(ewmsMainTabSearchSchema.partial().shape)
  .extend(ewmsDocumentViewerTabSearchSchema.partial().shape);

export type EwmsSearch = z.infer<typeof ewmsSearchSchema>;

export const isEwmsTab = (value: string): value is EwmsTab => {
  return (EWMS_TAB_VALUES as ReadonlyArray<string>).includes(value);
};
