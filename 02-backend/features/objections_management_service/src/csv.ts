export const CSV_COLUMNS = [
  "Argument-ID",
  "Thema",
  "Unterthema",
  "Argument",
  "Kontext",
  "Erwiderung",
  "Einordnung",
  "Datei",
] as const;

// Export adds the apostrophe exactly when import strips it; counting existing apostrophes keeps hand-escaped values lossless.
const FORMULA_PREFIX = /^'(?=['\s]*[=+\-@\t\r])/;

const encodeCell = (value: string): string => {
  const inert = FORMULA_PREFIX.test(`'${value}`) ? `'${value}` : value;
  if (!/[;"\r\n]/.test(inert)) return inert;
  return `"${inert.replaceAll('"', '""')}"`;
};

export type ExportRow = Readonly<Record<(typeof CSV_COLUMNS)[number], string>>;

const encodeRowLine = (row: ExportRow): string =>
  CSV_COLUMNS.map((column) => encodeCell(row[column])).join(";");

export const serializeExportCsvStream = async (
  batches: AsyncIterable<readonly ExportRow[]>,
): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const header = encoder.encode(`\ufeff${CSV_COLUMNS.join(";")}\r\n`);
  const chunks: Uint8Array[] = [header];
  let total = header.byteLength;
  for await (const batch of batches) {
    if (batch.length === 0) continue;
    const chunk = encoder.encode(`${batch.map(encodeRowLine).join("\r\n")}\r\n`);
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
};

const delimiterFor = (header: string): ";" | "," => {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (let index = 0; index < header.length; index += 1) {
    const character = header[index];
    if (character === '"') {
      if (quoted && header[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === ";") semicolons += 1;
    else if (!quoted && character === ",") commas += 1;
  }
  return semicolons >= commas ? ";" : ",";
};

function* parseRows(text: string, delimiter: ";" | ","): Generator<string[], void, undefined> {
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else quoted = false;
      } else value += character;
      continue;
    }
    if (character === '"' && value.length === 0) quoted = true;
    else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) yield row;
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) throw new TypeError("CSV contains an unterminated quoted field");
  row.push(value);
  if (row.some((cell) => cell.length > 0)) yield row;
}

export interface ImportCsv {
  readonly totalRows: number;
  readonly replies: ReadonlyMap<string, string>;
}

export const parseImportCsv = (content: Uint8Array): ImportCsv => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content).replace(/^\ufeff/, "");
  } catch {
    throw new TypeError("CSV file must be UTF-8 encoded");
  }
  const headerLine = text.split(/\r?\n/, 1)[0] ?? "";
  const rows = parseRows(text, delimiterFor(headerLine));
  const header = rows.next().value ?? [];
  const argumentIndex = header.findIndex(
    (name) => name === "Argument-ID" || name === "argument id",
  );
  const replyIndex = header.findIndex((name) => name === "Erwiderung" || name === "erwiderung");
  if (argumentIndex < 0 || replyIndex < 0) {
    throw new TypeError("CSV must contain 'Argument-ID' and 'Erwiderung' columns");
  }
  const replies = new Map<string, string>();
  let totalRows = 0;
  for (const row of rows) {
    totalRows += 1;
    const argumentId = (row[argumentIndex] ?? "").trim().replace(FORMULA_PREFIX, "");
    const reply = (row[replyIndex] ?? "").trim().replace(FORMULA_PREFIX, "");
    if (argumentId && reply) replies.set(argumentId, reply);
  }
  return { totalRows, replies };
};

export const exportDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
};

export const exportFilename = (projectName: string, date = new Date()): string => {
  const sanitized =
    projectName
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")
      .trim()
      .replace(/\.+$/, "") || "Verfahren";
  return `${exportDate(date)}_Synopse_${sanitized}.csv`;
};
