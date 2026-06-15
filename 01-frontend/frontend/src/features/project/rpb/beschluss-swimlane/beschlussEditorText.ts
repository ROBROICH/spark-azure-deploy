import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');

const isMultilineText = (text: string) =>
  normalizeLineEndings(text).includes('\n');

const extractTextFromNode = (node: JSONContent): string => {
  if (node.type === 'text') {
    return node.text ?? '';
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return (node.content ?? []).map(extractTextFromNode).join('');
};

/**
 * Recursively reads text from a ProseMirror node tree while preserving hard
 * breaks as newline characters.
 *
 * @param node ProseMirror node to serialize.
 * @returns Text content for the node and its descendants.
 */
const extractTextFromProseMirrorNode = (node: ProseMirrorNode): string => {
  if (node.isText) {
    return node.text ?? '';
  }

  if (node.type.name === 'hardBreak') {
    return '\n';
  }

  let result = '';

  for (let index = 0; index < node.childCount; index += 1) {
    result += extractTextFromProseMirrorNode(node.child(index));
  }

  return result;
};

// eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- This serializer intentionally preserves blank lines by interleaving text and hardBreak nodes in one paragraph.
const textToParagraphContent = (text: string): JSONContent[] | undefined => {
  const normalizedText = normalizeLineEndings(text);

  if (normalizedText.length === 0) {
    return undefined;
  }

  const lines = normalizedText.split('\n');
  const content: JSONContent[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && line.length > 0) {
      content.push({ type: 'text', text: line });
    }
    if (index < lines.length - 1) {
      content.push({ type: 'hardBreak' });
    }
  }

  return content;
};

const extractNodeText = (
  doc: ProseMirrorNode,
  outlineNodeId: string,
  outlineNodeIds: string[],
) => {
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

  return extractTextFromProseMirrorNode(paragraphNode);
};

export {
  extractNodeText,
  extractTextFromNode,
  extractTextFromProseMirrorNode,
  isMultilineText,
  textToParagraphContent,
};
