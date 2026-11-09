import { unzipSync, zipSync } from "fflate";

import { buildExportTree, type ExportNode, type ExportTreeNode } from "./tree";

const BODY_ANCHOR = "{{ VAE_CONTENT_START }}";
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

type Run = { text: string; marks: readonly string[] };

// OOXML requires this order inside w:rPr.
const RUN_PROPERTIES = [
  ["bold", "<w:b/>"],
  ["italic", "<w:i/>"],
  ["underline", '<w:u w:val="single"/>'],
] as const;

const run = ({ text, marks }: Run): string => {
  const properties = RUN_PROPERTIES.filter(([mark]) => marks.includes(mark))
    .map(([, xml]) => xml)
    .join("");
  return `<w:r>${properties === "" ? "" : `<w:rPr>${properties}</w:rPr>`}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
};

const paragraph = (runs: readonly Run[], headingLevel?: number): string =>
  `<w:p>${
    headingLevel === undefined ? "" : `<w:pPr><w:pStyle w:val="berschrift${headingLevel}"/></w:pPr>`
  }${runs.map(run).join("")}</w:p>`;

// Each hard break or newline starts a Word paragraph. Lines keep the plain-text export rules:
// trimmed across their runs, and dropped when empty.
const contentLines = (node: ExportTreeNode): Run[][] => {
  const lines: Run[][] = [[]];
  if (node.content === null) {
    for (const [index, text] of node.text.split(/\r?\n/).entries()) {
      if (index > 0) lines.push([]);
      lines.at(-1)!.push({ text, marks: [] });
    }
  } else {
    for (const inline of node.content.content[0]!.content ?? []) {
      if (inline.type === "hardBreak") {
        lines.push([]);
        continue;
      }
      const marks = (inline.marks ?? []).map(({ type }) => type);
      for (const [index, text] of inline.text.split(/\r?\n/).entries()) {
        if (index > 0) lines.push([]);
        lines.at(-1)!.push({ text, marks });
      }
    }
  }
  return lines.flatMap((runs) => {
    const trimmed = runs.map((item) => ({ ...item }));
    while (trimmed[0] && trimmed[0].text.trimStart() === "") trimmed.shift();
    while (trimmed.at(-1) && trimmed.at(-1)!.text.trimEnd() === "") trimmed.pop();
    if (trimmed.length === 0) return [];
    trimmed[0]!.text = trimmed[0]!.text.trimStart();
    trimmed.at(-1)!.text = trimmed.at(-1)!.text.trimEnd();
    return [trimmed];
  });
};

const renderNode = (node: ExportTreeNode, depth: number): string => {
  const content = [paragraph([{ text: node.title, marks: [] }], Math.min(depth, 9))];
  for (const runs of contentLines(node)) content.push(paragraph(runs));
  for (const child of node.children) content.push(renderNode(child, depth + 1));
  return content.join("");
};

const paragraphStartBefore = (xml: string, offset: number): number => {
  const expression = /<w:p(?=[ >])/g;
  let latest = -1;
  for (
    let match = expression.exec(xml);
    match !== null && match.index < offset;
    match = expression.exec(xml)
  ) {
    latest = match.index;
  }
  return latest;
};

const renderDocumentXml = (
  source: string,
  nodes: readonly ExportNode[],
  replacements: Readonly<
    Record<"dokument_titel" | "vorhaben_traeger" | "vorhaben_name" | "Aktenzeichen", string>
  >,
): string => {
  const anchor = source.indexOf(BODY_ANCHOR);
  if (anchor < 0) throw new Error(`DOCX template is missing body anchor '${BODY_ANCHOR}'`);
  const bodyStart = paragraphStartBefore(source, anchor);
  const sectionStart = source.indexOf("<w:sectPr", anchor);
  if (bodyStart < 0 || sectionStart < 0) {
    throw new Error("DOCX template body anchor does not precede section properties");
  }
  const rendered = buildExportTree(nodes)
    .map((node) => renderNode(node, 1))
    .join("");
  const documentXml = `${source.slice(0, bodyStart)}${rendered}${source.slice(sectionStart)}`;
  return documentXml.replace(
    /\[(dokument_titel|vorhaben_traeger|vorhaben_name|Aktenzeichen)\]/g,
    (_match, key: keyof typeof replacements) => xmlEscape(replacements[key]),
  );
};

const replaceElementText = (xml: string, tag: string, value: string): string =>
  xml.replace(new RegExp(`(<${tag}\\b[^>]*>)[^<]*(</${tag}>)`), `$1${xmlEscape(value)}$2`);

const EMPTY_PEOPLE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>';

const enableUpdateFields = (settings: string): string => {
  const existing = /<w:updateFields\b[^>]*\/?\s*>/;
  if (existing.test(settings)) {
    return settings.replace(existing, '<w:updateFields w:val="true"/>');
  }
  const close = settings.lastIndexOf("</w:settings>");
  if (close < 0) throw new Error("DOCX template settings.xml has no settings root");
  return `${settings.slice(0, close)}<w:updateFields xmlns:w="${WORD_NAMESPACE}" w:val="true"/>${settings.slice(close)}`;
};

export async function generateDocx(
  nodes: readonly ExportNode[],
  projectName: string,
  internalProjectNumber: string,
): Promise<Uint8Array> {
  const template = new Uint8Array(
    await Bun.file(new URL("./template.docx", import.meta.url)).arrayBuffer(),
  );
  const archive = unzipSync(template);
  const documentPart = archive["word/document.xml"];
  const settingsPart = archive["word/settings.xml"];
  if (documentPart === undefined || settingsPart === undefined) {
    throw new Error("DOCX template is missing document.xml or settings.xml");
  }
  archive["word/document.xml"] = encoder.encode(
    renderDocumentXml(decoder.decode(documentPart), nodes, {
      dokument_titel: "Planfeststellungsbeschluss",
      vorhaben_traeger: "Die Autobahn GmbH des Bundes",
      vorhaben_name: projectName,
      Aktenzeichen: internalProjectNumber,
    }),
  );
  archive["word/settings.xml"] = encoder.encode(enableUpdateFields(decoder.decode(settingsPart)));
  neutralizeTemplateMetadata(archive, new Date());
  return zipSync(archive, { level: 6 });
}

// Template document properties name the template's editors and their organization; the export
// must not pass them on to the recipients of the decision, whatever template is bundled.
export function neutralizeTemplateMetadata(
  archive: Record<string, Uint8Array>,
  exportedAt: Date,
): void {
  const timestamp = exportedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const corePart = archive["docProps/core.xml"];
  if (corePart !== undefined) {
    let core = decoder
      .decode(corePart)
      .replace(/<cp:lastPrinted\b[^>]*(?:\/>|>[^<]*<\/cp:lastPrinted>)/, "");
    for (const tag of ["dc:creator", "cp:lastModifiedBy"]) core = replaceElementText(core, tag, "");
    core = replaceElementText(core, "cp:revision", "1");
    for (const tag of ["dcterms:created", "dcterms:modified"]) {
      core = replaceElementText(core, tag, timestamp);
    }
    archive["docProps/core.xml"] = encoder.encode(core);
  }
  const appPart = archive["docProps/app.xml"];
  if (appPart !== undefined) {
    archive["docProps/app.xml"] = encoder.encode(
      replaceElementText(decoder.decode(appPart), "Company", ""),
    );
  }
  // Content types and document relationships reference people.xml, so it stays as an empty list.
  if (archive["word/people.xml"] !== undefined) {
    archive["word/people.xml"] = encoder.encode(EMPTY_PEOPLE_XML);
  }
}
