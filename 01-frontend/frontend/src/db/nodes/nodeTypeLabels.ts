import type {
  DmsNodeRef,
  ExamNodeRef,
  FeedbackNodeRef,
  NodeTypeLiteral,
  OmsNodeRef,
  PlsNodeRef,
  VaeNodeRef,
} from './types';

export const EXAMINATION_NODE_TYPE_LITERALS = [
  'absatz',
  'adressat',
  'atomares_tbm',
  'auslegungsvorschlag',
  'bestimmter_rechtsbegriff',
  'bewertung',
  'bewertung_kapitel',
  'bewertung_quelle',
  'chunk',
  'dokument',
  'ermessensart',
  'ermessensspielraum',
  'expliziter_verweis',
  'fundstelle',
  'gesetz',
  'gs_pruefung',
  'impliziter_verweis',
  'iv_pruefung',
  'legaldefinition',
  'markdown_text',
  'norm',
  'normvorschlag',
  'project',
  'rechtsfolge',
  'required_doc',
  'satz',
  'soll_dokument',
  'sollensanordnungen',
  'standangabe',
  'sub_chunk',
  'sub_chunk_image',
  'sub_chunk_relation',
  'sub_chunk_table',
  'sub_chunk_text',
  'technische_norm',
  'technische_norm_entry',
  'unbestimmter_rechtsbegriff',
  'verwaltungsaktentwurf_teil',
  'widerspruch',
  'zugeordnetes_dokument',
  'zusammenfassung',
] satisfies Readonly<ExamNodeRef['nodeType']>[];

export const FEEDBACK_NODE_TYPE_LITERALS = ['feedback'] satisfies Readonly<
  FeedbackNodeRef['nodeType']
>[];

export const PLS_NODE_TYPE_LITERALS = [
  'deadline',
  'subtopic',
  'topic',
  'topic_norm',
] satisfies Readonly<PlsNodeRef['nodeType']>[];

export const DMS_NODE_TYPE_LITERALS = [
  'file',
  'file_topic',
  'zip_file',
] satisfies Readonly<DmsNodeRef['nodeType']>[];

export const OMS_NODE_TYPE_LITERALS = [
  'argument',
  'beteiligungs_eingang',
  'beteiligungs_eingang_markdown',
] satisfies Readonly<OmsNodeRef['nodeType']>[];

export const VAE_NODE_TYPE_LITERALS = ['risks', 'vae_node'] satisfies Readonly<
  VaeNodeRef['nodeType']
>[];

export const NODE_TYPE_LITERALS = [
  ...EXAMINATION_NODE_TYPE_LITERALS,
  ...PLS_NODE_TYPE_LITERALS,
  ...FEEDBACK_NODE_TYPE_LITERALS,
  ...DMS_NODE_TYPE_LITERALS,
  ...OMS_NODE_TYPE_LITERALS,
  ...VAE_NODE_TYPE_LITERALS,
] satisfies Readonly<NodeTypeLiteral>[];

const nodeTypeLiteralSet = new Set<string>(NODE_TYPE_LITERALS);

export function isNodeTypeLiteral(value: string): value is NodeTypeLiteral {
  return nodeTypeLiteralSet.has(value);
}
