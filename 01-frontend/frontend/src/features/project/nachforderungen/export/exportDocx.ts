import type { Editor, JSONContent } from '@tiptap/react';
// eslint-disable-next-line no-restricted-syntax -- type-only namespace models the dynamic docx module without adding a static runtime import
import type * as Docx from 'docx';

type DocxModule = typeof Docx;
type DocxTextRun = InstanceType<DocxModule['TextRun']>;
type DocxParagraph = InstanceType<DocxModule['Paragraph']>;
type DocxRuntime = Pick<
  DocxModule,
  | 'AlignmentType'
  | 'Document'
  | 'HeadingLevel'
  | 'LevelFormat'
  | 'Packer'
  | 'Paragraph'
  | 'TextRun'
>;

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Recursively converts a TipTap inline node (text or wrapper) into docx TextRuns,
 * preserving bold, italic, and underline marks.
 */
const inlineNodeToTextRuns = (
  node: JSONContent,
  docx: Pick<DocxRuntime, 'TextRun'>,
): DocxTextRun[] => {
  if (node.type === 'text') {
    const marks = node.marks ?? [];
    const bold = marks.some((m) => m.type === 'bold');
    const italics = marks.some((m) => m.type === 'italic');
    const underline = marks.some((m) => m.type === 'underline');

    return [
      new docx.TextRun({
        text: node.text ?? '',
        bold,
        italics,
        underline: underline ? {} : undefined,
      }),
    ];
  }

  return (node.content ?? []).flatMap((child) =>
    inlineNodeToTextRuns(child, docx),
  );
};

const getHeadingLevel = (
  level: number,
  HeadingLevel: DocxRuntime['HeadingLevel'],
) => {
  if (level === 2) {
    return HeadingLevel.HEADING_2;
  }

  if (level === 3) {
    return HeadingLevel.HEADING_3;
  }

  return HeadingLevel.HEADING_1;
};

const BULLET_LIST_REF = 'bullet-list';
const ORDERED_LIST_REF = 'ordered-list';

/** Converts a TipTap listItem node into docx Paragraphs with numbering. */
function listItemToParagraphs(
  node: JSONContent,
  numberingRef: string,
  docx: Pick<DocxRuntime, 'HeadingLevel' | 'Paragraph' | 'TextRun'>,
): DocxParagraph[] {
  // A listItem typically contains paragraph(s)
  return (node.content ?? []).flatMap((child) => {
    if (child.type === 'paragraph') {
      const children = (child.content ?? []).flatMap((inlineNode) =>
        inlineNodeToTextRuns(inlineNode, docx),
      );
      return [
        new docx.Paragraph({
          children,
          numbering: { reference: numberingRef, level: 0 },
        }),
      ];
    }
    return blockNodeToParagraphs(child, docx);
  });
}

/** Converts a TipTap block node (heading, paragraph, section wrapper) into docx Paragraphs. */
function blockNodeToParagraphs(
  node: JSONContent,
  docx: Pick<DocxRuntime, 'HeadingLevel' | 'Paragraph' | 'TextRun'>,
): DocxParagraph[] {
  if (node.type === 'heading') {
    const level =
      node.attrs?.level !== undefined ? Number(node.attrs.level) : 1;
    const heading = getHeadingLevel(level, docx.HeadingLevel);
    const children = (node.content ?? []).flatMap((inlineNode) =>
      inlineNodeToTextRuns(inlineNode, docx),
    );
    return [new docx.Paragraph({ heading, children })];
  }

  if (node.type === 'paragraph') {
    const children = (node.content ?? []).flatMap((inlineNode) =>
      inlineNodeToTextRuns(inlineNode, docx),
    );
    return [new docx.Paragraph({ children })];
  }

  if (node.type === 'bulletList') {
    return (node.content ?? []).flatMap((listItem) =>
      listItemToParagraphs(listItem, BULLET_LIST_REF, docx),
    );
  }

  if (node.type === 'orderedList') {
    return (node.content ?? []).flatMap((listItem) =>
      listItemToParagraphs(listItem, ORDERED_LIST_REF, docx),
    );
  }

  // itemSection or other wrapper — recurse into children
  if (node.content) {
    return node.content.flatMap((child) => blockNodeToParagraphs(child, docx));
  }

  return [];
}

/** Exports the editor content as a DOCX file by walking the TipTap JSON tree. */
export const exportDocx = async (
  editor: Editor,
  filename: string,
): Promise<void> => {
  const docx = await import('docx');
  const json = editor.getJSON();
  const content = json.content;
  const paragraphs = Array.isArray(content)
    ? content.flatMap((node) => blockNodeToParagraphs(node, docx))
    : [];

  const doc = new docx.Document({
    numbering: {
      config: [
        {
          reference: BULLET_LIST_REF,
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.BULLET,
              text: '\u2022',
              alignment: docx.AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: ORDERED_LIST_REF,
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.DECIMAL,
              text: '%1.',
              alignment: docx.AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await docx.Packer.toBlob(doc);
  downloadBlob(blob, `${filename}.docx`);
};
