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

const paragraph = (text: string, headingLevel?: number): string =>
  `<w:p>${
    headingLevel === undefined ? "" : `<w:pPr><w:pStyle w:val="berschrift${headingLevel}"/></w:pPr>`
  }<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

const renderNode = (node: ExportTreeNode, depth: number): string => {
  const content = [paragraph(node.title, Math.min(depth, 9))];
  for (const line of node.text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized !== "") content.push(paragraph(normalized));
  }
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
  return zipSync(archive, { level: 6 });
}
