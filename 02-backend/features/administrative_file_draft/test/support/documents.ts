import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unzipSync } from "fflate"

const REQUIRED_DOCX_PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/settings.xml",
  "word/styles.xml",
  "word/numbering.xml",
  "word/header1.xml",
  "word/media/image1.png",
] as const

const SYSTEM_PLACEHOLDERS = [
  "[dokument_titel]",
  "[vorhaben_traeger]",
  "[vorhaben_name]",
  "[Aktenzeichen]",
] as const

const decodeXml = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))

const paragraphSemantics = (documentXml: string) => {
  const paragraphs: Array<{ text: string; headingLevel: number | null }> = []

  for (const match of documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const xml = match[1] ?? ""
    const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((textMatch) => decodeXml(textMatch[1] ?? ""))
      .join("")
      .trim()
    if (text === "") continue

    const style = xml.match(/<w:pStyle\s[^>]*w:val="(?:Heading|berschrift)([1-9])"[^>]*\/>/)
    paragraphs.push({
      text,
      headingLevel: style?.[1] === undefined ? null : Number(style[1]),
    })
  }

  return paragraphs
}

const run = async (command: string[], cwd?: string) => {
  const process = Bun.spawn(command, {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr.trim()}`)
  }
  return stdout
}

const withBinaryFile = async <T>(suffix: string, bytes: Uint8Array, action: (path: string) => Promise<T>) => {
  const directory = await mkdtemp(join(tmpdir(), "afd-document-"))
  const path = join(directory, `document.${suffix}`)
  try {
    await writeFile(path, bytes)
    return await action(path)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

export interface DocxSemantics {
  allText: string
  bodyHeadingLevels: number[]
  bodySuffix: string[]
  containsBodyAnchor: boolean
  placeholders: string[]
  remainingSystemPlaceholders: string[]
  requiredParts: string[]
  updateFieldsOnOpen: boolean
}

export const inspectDocx = async (
  bytes: Uint8Array,
  { bodyParagraphCount }: { bodyParagraphCount: number },
): Promise<DocxSemantics> => {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("DOCX is not an OOXML ZIP package")
  }

  const archive = unzipSync(bytes)
  const missingParts = REQUIRED_DOCX_PARTS.filter((part) => archive[part] === undefined)
  if (missingParts.length > 0) {
    throw new Error(`DOCX is missing required package parts: ${missingParts.join(", ")}`)
  }

  const decoder = new TextDecoder()
  const documentXml = decoder.decode(archive["word/document.xml"])
  const settingsXml = decoder.decode(archive["word/settings.xml"])
  const paragraphs = paragraphSemantics(documentXml)
  const body = paragraphs.slice(-bodyParagraphCount)
  const placeholders = [...documentXml.matchAll(/\[[^\]]+\]/g)].map((match) => decodeXml(match[0]))

  return {
    allText: paragraphs.map((paragraph) => paragraph.text).join("\n"),
    bodyHeadingLevels: body
      .map((paragraph) => paragraph.headingLevel)
      .filter((level): level is number => level !== null),
    bodySuffix: body.map((paragraph) => paragraph.text),
    containsBodyAnchor: documentXml.includes("{{ VAE_CONTENT_START }}"),
    placeholders: [...new Set(placeholders)],
    remainingSystemPlaceholders: SYSTEM_PLACEHOLDERS.filter((placeholder) =>
      documentXml.includes(placeholder),
    ),
    requiredParts: [...REQUIRED_DOCX_PARTS],
    updateFieldsOnOpen:
      /<(?:w|ns\d+):updateFields\b[^>]*(?:w|ns\d+):val="(?:true|1)"[^>]*\/?\s*>/.test(
        settingsXml,
      ),
  }
}

export interface PdfSemantics {
  pageCount: number
  pageSize: string
  text: string
}

/**
 * LibreOffice lays out table-of-contents tab leaders with a converter-sensitive
 * number of dots. Normalize only a 4+-dot run immediately before its page
 * number; every word, page number, and other punctuation remains exact.
 */
export const normalizePdfTocDotLeaders = (text: string): string =>
  text.replace(/\.{4,}(?=\d+(?:\s|$))/g, "....")

export const inspectPdf = async (bytes: Uint8Array): Promise<PdfSemantics> =>
  withBinaryFile("pdf", bytes, async (path) => {
    const signature = new TextDecoder().decode(bytes.slice(0, 5))
    if (signature !== "%PDF-") {
      throw new Error("Converted output is not a readable PDF")
    }

    const [text, info] = await Promise.all([
      run(["pdftotext", "-enc", "UTF-8", path, "-"]),
      run(["pdfinfo", path]),
    ])
    const pageCount = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1])
    const pageSize = info.match(/^Page size:\s+(.+)$/m)?.[1]?.trim()
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageSize === undefined) {
      throw new Error(`Could not read stable PDF page facts:\n${info}`)
    }

    return {
      pageCount,
      pageSize,
      text: text.replace(/\s+/g, " ").trim(),
    }
  })
