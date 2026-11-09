import { InvalidNodeRequestError } from "@spark-workflow/node-crud";

import type { BeschlussContent } from "../schemas";

type Inline = NonNullable<BeschlussContent["content"][number]["content"]>[number];
type Mark = NonNullable<Inline["marks"]>[number];

// ProseMirror schema rank of the Beschluss editor marks; it orders marks in `Node.toJSON()`.
const MARK_ORDER = ["bold", "italic", "underline"] as const;

const canonicalMarks = (marks: readonly Mark[] | undefined): Mark[] => {
  const types = (marks ?? []).map(({ type }) => type);
  if (new Set(types).size !== types.length) {
    throw InvalidNodeRequestError({
      internal: { message: `Duplicate Beschluss content mark: ${types.join(",")}` },
    });
  }
  return MARK_ORDER.filter((type) => types.includes(type)).map((type) => ({ type }));
};

/**
 * Normalizes a section document to what ProseMirror `Node.fromJSON(...).toJSON()` returns under
 * the Beschluss editor schema, without depending on Tiptap (design D-15).
 */
export function canonicalBeschlussContent(value: BeschlussContent): BeschlussContent {
  const inline: Inline[] = [];
  for (const node of value.content[0]!.content ?? []) {
    const marks = canonicalMarks(node.marks);
    const withMarks = marks.length > 0 ? { marks } : {};
    if (node.type === "hardBreak") {
      inline.push({ type: "hardBreak", ...withMarks });
      continue;
    }
    const previous = inline.at(-1);
    if (
      previous?.type === "text" &&
      (previous.marks ?? []).map(({ type }) => type).join() === marks.map(({ type }) => type).join()
    ) {
      inline[inline.length - 1] = { ...previous, text: previous.text + node.text };
    } else {
      inline.push({ type: "text", ...withMarks, text: node.text });
    }
  }
  return {
    type: "doc",
    content: [inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" }],
  };
}

export function beschlussPlainText(content: BeschlussContent): string {
  return (content.content[0]!.content ?? [])
    .map((node) => (node.type === "hardBreak" ? "\n" : node.text))
    .join("");
}
