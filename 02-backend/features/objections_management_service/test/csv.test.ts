import { describe, expect, test } from "bun:test";

import {
  CSV_COLUMNS,
  type ExportRow,
  exportFilename,
  parseImportCsv,
  serializeExportCsvStream,
} from "../src/csv";

describe("Objections CSV boundary", () => {
  test.each([
    ["reply", "reply"],
    ["Water; soil", '"Water; soil"'],
    ['A "quoted" argument', '"A ""quoted"" argument"'],
    ["line one\nline two", '"line one\nline two"'],
    ["mid-text = @fine", "mid-text = @fine"],
    ["'tis", "'tis"],
    ['=HYPERLINK("http://evil.example")', '"\'=HYPERLINK(""http://evil.example"")"'],
    ["+1", "'+1"],
    ["- bullet", "'- bullet"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", '"\'\rcmd"'],
    ["'=escaped by hand", "''=escaped by hand"],
    [" =1+1", "' =1+1"],
    ["' =1+1", "'' =1+1"],
  ])("exports %j as the inert cell %j and imports it back verbatim", async (value, cell) => {
    const row = Object.fromEntries(CSV_COLUMNS.map((column) => [column, value])) as ExportRow;
    const content = await serializeExportCsvStream(
      (async function* () {
        yield [row];
      })(),
    );
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(content)).toBe(
      `\ufeff${CSV_COLUMNS.join(";")}\r\n${CSV_COLUMNS.map(() => cell).join(";")}\r\n`,
    );
    expect([...parseImportCsv(content).replies]).toEqual([[value, value]]);
  });

  test("accepts semicolon and comma imports, with the final duplicate winning", () => {
    const semicolon = parseImportCsv(
      new TextEncoder().encode(
        "\ufeffArgument-ID;Erwiderung\r\nA-1;first\r\nA-2;\r\nA-1;final\r\n",
      ),
    );
    expect(semicolon.totalRows).toBe(3);
    expect([...semicolon.replies]).toEqual([["A-1", "final"]]);

    const comma = parseImportCsv(
      new TextEncoder().encode('argument id,erwiderung\r\nA-3,"reply, with comma"\r\n'),
    );
    expect([...comma.replies]).toEqual([["A-3", "reply, with comma"]]);
  });

  test("uses the Berlin date and sanitizes the DMS filename", () => {
    expect(exportFilename("Plan: West?.", new Date("2026-01-01T23:30:00Z"))).toBe(
      "20260102_Synopse_Plan_ West_.csv",
    );
  });
});
