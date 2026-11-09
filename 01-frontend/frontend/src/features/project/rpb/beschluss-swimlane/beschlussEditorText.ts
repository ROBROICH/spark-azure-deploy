import type { JSONContent } from '@tiptap/core';

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

export { extractTextFromNode, isMultilineText, textToParagraphContent };
