import type { JSONContent } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { invariant } from 'es-toolkit/util';
import type { BeschlussContent, BeschlussSection } from '../rpbBeschluss.types';
import { beschlussEditorSchema } from './beschlussEditorExtensionList';
import { textToParagraphContent } from './beschlussEditorText';

type BeschlussParagraph = BeschlussContent['content'][0];
type BeschlussInline = NonNullable<BeschlussParagraph['content']>[number];
type BeschlussMark = NonNullable<BeschlussInline['marks']>[number];

const BESCHLUSS_MARK_TYPES = [
  'bold',
  'italic',
  'underline',
] as const satisfies ReadonlyArray<BeschlussMark['type']>;

const isBeschlussMarkType = (
  type: string | undefined,
): type is BeschlussMark['type'] =>
  BESCHLUSS_MARK_TYPES.some((markType) => markType === type);

const toBeschlussMarks = (
  marks: JSONContent['marks'],
): Pick<BeschlussInline, 'marks'> => {
  if (!marks || marks.length === 0) {
    return {};
  }

  return {
    marks: marks.map((mark) => {
      invariant(
        isBeschlussMarkType(mark.type),
        `Unsupported Beschluss mark: ${String(mark.type)}`,
      );
      return { type: mark.type };
    }),
  };
};

const toBeschlussInline = (node: JSONContent): BeschlussInline => {
  if (node.type === 'hardBreak') {
    return { type: 'hardBreak', ...toBeschlussMarks(node.marks) };
  }

  invariant(
    node.type === 'text' && node.text !== undefined,
    `Unsupported Beschluss inline node: ${String(node.type)}`,
  );
  return { type: 'text', ...toBeschlussMarks(node.marks), text: node.text };
};

/**
 * Converts the canonical editor JSON of one section to the generated content
 * type. The input is a node of the editor schema, so a failed invariant means
 * that the editor schema drifted from the Beschluss content schema.
 *
 * @param json Section document with exactly one paragraph.
 * @returns The section content in the persisted wire shape.
 */
const toBeschlussContent = (json: JSONContent): BeschlussContent => {
  const [paragraph, ...rest] = json.content ?? [];
  invariant(
    json.type === 'doc' && paragraph?.type === 'paragraph' && rest.length === 0,
    'Expected a Beschluss section document with one paragraph',
  );

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        ...(paragraph.content
          ? { content: paragraph.content.map(toBeschlussInline) }
          : {}),
      },
    ],
  };
};

const getSectionReferenceDocument = (section: BeschlussSection) =>
  section.content ?? {
    type: 'doc',
    content: [
      { type: 'paragraph', content: textToParagraphContent(section.text) },
    ],
  };

const getSectionReferenceKey = (section: BeschlussSection) =>
  JSON.stringify(
    ProseMirrorNode.fromJSON(
      beschlussEditorSchema,
      getSectionReferenceDocument(section),
    ).toJSON(),
  );

const getEditorSectionDocument = (
  doc: ProseMirrorNode,
  outlineNodeId: string,
  outlineNodeIds: string[],
): JSONContent | undefined => {
  const targetHeadingIndex = outlineNodeIds.indexOf(outlineNodeId);
  if (targetHeadingIndex < 0) {
    return undefined;
  }

  const paragraphIndex = targetHeadingIndex * 2 + 1;
  if (paragraphIndex >= doc.childCount) {
    return undefined;
  }

  const paragraphNode = doc.child(paragraphIndex);
  if (paragraphNode.type.name !== 'paragraph') {
    return undefined;
  }

  return { type: 'doc', content: [paragraphNode.toJSON()] };
};

export { getEditorSectionDocument, getSectionReferenceKey, toBeschlussContent };
