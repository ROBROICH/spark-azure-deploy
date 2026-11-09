import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import { generateDocx } from "../src/document/docx.ts";
import type { ExportNode } from "../src/document/tree.ts";

const decoder = new TextDecoder();

const section = (overrides: Partial<ExportNode>): ExportNode => ({
  id: crypto.randomUUID(),
  parentVaeNodeId: null,
  title: "Abschnitt",
  text: "",
  content: null,
  order: 0,
  isHidden: false,
  isDeleted: false,
  ...overrides,
});

// The template already contains formatted runs, so assertions read only the paragraphs
// rendered after the section heading.
const bodyParagraphs = async (node: ExportNode) => {
  const archive = unzipSync(await generateDocx([node], "Vorhaben", "AZ-1"));
  const xml = decoder.decode(archive["word/document.xml"]);
  const heading = xml.indexOf(`>${node.title}</w:t>`);
  expect(heading).toBeGreaterThan(-1);
  const rest = xml.slice(xml.indexOf("</w:p>", heading) + "</w:p>".length);
  return [...rest.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, paragraph]) =>
    [...paragraph!.matchAll(/<w:r>(?:<w:rPr>([\s\S]*?)<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)]
      .map(([, properties, text]) => ({ properties: properties ?? "", text })),
  );
};

describe("DOCX export of formatted Beschluss sections", () => {
  test("renders bold, italic, and underline runs with run properties", async () => {
    const paragraphs = await bodyParagraphs(
      section({
        title: "Formatiert",
        text: "Fett kursiv unterstrichen",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "bold" }], text: "Fett" },
                { type: "text", text: " " },
                { type: "text", marks: [{ type: "italic" }], text: "kursiv" },
                { type: "text", text: " " },
                {
                  type: "text",
                  marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }],
                  text: "unterstrichen",
                },
              ],
            },
          ],
        },
      }),
    );
    expect(paragraphs).toEqual([
      [
        { properties: "<w:b/>", text: "Fett" },
        { properties: "", text: " " },
        { properties: "<w:i/>", text: "kursiv" },
        { properties: "", text: " " },
        { properties: '<w:b/><w:i/><w:u w:val="single"/>', text: "unterstrichen" },
      ],
    ]);
  });

  test("starts a new paragraph at each hard break, trims lines, and drops empty lines", async () => {
    const paragraphs = await bodyParagraphs(
      section({
        title: "Umbrüche",
        text: "  erste  \n\nzweite",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "  " },
                { type: "text", marks: [{ type: "bold" }], text: "erste  " },
                { type: "hardBreak" },
                { type: "text", text: "   " },
                { type: "hardBreak", marks: [{ type: "bold" }] },
                { type: "text", text: "zweite" },
              ],
            },
          ],
        },
      }),
    );
    expect(paragraphs).toEqual([
      [{ properties: "<w:b/>", text: "erste" }],
      [{ properties: "", text: "zweite" }],
    ]);
  });

  test("renders a section without content from its plain text", async () => {
    const paragraphs = await bodyParagraphs(
      section({ title: "Klartext", text: "  eins  \n\nzwei" }),
    );
    expect(paragraphs).toEqual([
      [{ properties: "", text: "eins" }],
      [{ properties: "", text: "zwei" }],
    ]);
  });
});
