import { Buffer } from "node:buffer";

export type UnoTarget = "docx" | "pdf";

const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const xmlRpcInfoRequest = (): string => `<?xml version="1.0"?>
<methodCall>
  <methodName>info</methodName>
  <params></params>
</methodCall>`;

const xmlRpcRequest = (bytes: Uint8Array, target: UnoTarget): string => `<?xml version="1.0"?>
<methodCall>
  <methodName>convert</methodName>
  <params>
    <param><value><nil/></value></param>
    <param><value><base64>${Buffer.from(bytes).toString("base64")}</base64></value></param>
    <param><value><nil/></value></param>
    <param><value><string>${xmlEscape(target)}</string></value></param>
    <param><value><nil/></value></param>
    <param><value><array><data></data></array></value></param>
    <param><value><boolean>1</boolean></value></param>
    <param><value><nil/></value></param>
    <param><value><nil/></value></param>
  </params>
</methodCall>`;

const decodeXmlEntities = (value: string): string =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const xmlRpcBinary = (xml: string): Uint8Array => {
  const fault = xml.match(/<fault>[\s\S]*?<string>([\s\S]*?)<\/string>[\s\S]*?<\/fault>/);
  if (fault !== null) throw new Error(decodeXmlEntities(fault[1] ?? "UNO XML-RPC fault"));
  const binary = xml.match(/<base64>\s*([A-Za-z0-9+/=\s]+?)\s*<\/base64>/);
  if (binary === null) throw new Error("UNO XML-RPC response did not contain binary output");
  return new Uint8Array(Buffer.from((binary[1] ?? "").replaceAll(/\s/g, ""), "base64"));
};

/**
 * The unoserver conversion runs over XML-RPC/HTTP. When that backend is
 * unreachable or stalled, the request MUST fail fast: the Envoy gateway aborts
 * after ~13s, so blocking on the full 120s conversion timeout only produces a
 * confusing hang instead of a clean 502.
 *
 * To that end every conversion first runs a cheap `info()` preflight bounded by
 * a much shorter timeout (`preflightTimeoutMs`, default 10s). A dead port fails
 * immediately and a stalled server aborts after the preflight budget, so the
 * conversion timeout only ever applies to a backend that has proven reachable.
 *
 * Related: Gitea epic #4567, finding "Beschluss-PDF/Word-Export"
 * (topicId JrTvFx4GG7I).
 */
export class UnoConverter {
  readonly url: string;

  constructor(
    host: string,
    port: number,
    protocol: "http" | "https",
    private readonly timeoutMs: number,
    private readonly preflightTimeoutMs: number = 10_000,
  ) {
    this.url = `${protocol}://${host}:${port}/`;
  }

  /**
   * Cheap reachability handshake against unoserver's `info` method. Bounded by
   * `preflightTimeoutMs` so an unreachable or hung converter surfaces quickly
   * instead of blocking on the conversion deadline.
   */
  private async preflight(): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "text/xml" },
      body: xmlRpcInfoRequest(),
      signal: AbortSignal.timeout(this.preflightTimeoutMs),
    });
    if (!response.ok) throw new Error(`UNO preflight returned HTTP ${response.status}`);
    const body = await response.text();
    const fault = body.match(/<fault>[\s\S]*?<string>([\s\S]*?)<\/string>[\s\S]*?<\/fault>/);
    if (fault !== null) throw new Error(decodeXmlEntities(fault[1] ?? "UNO preflight fault"));
    if (!body.includes("<methodResponse")) {
      throw new Error("UNO preflight did not return an XML-RPC methodResponse");
    }
  }

  async convert(bytes: Uint8Array, target: UnoTarget): Promise<Uint8Array> {
    if (bytes.byteLength === 0) {
      throw new Error("Generated DOCX is empty before LibreOffice conversion");
    }
    const failure =
      target === "docx"
        ? "LibreOffice DOCX conversion failed"
        : "LibreOffice PDF conversion failed";
    const empty =
      target === "docx"
        ? "LibreOffice returned empty DOCX output"
        : "LibreOffice returned empty PDF output";
    let result: Uint8Array;
    try {
      await this.preflight();
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "text/xml" },
        body: xmlRpcRequest(bytes, target),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`UNO returned HTTP ${response.status}`);
      result = xmlRpcBinary(await response.text());
    } catch (error) {
      throw new Error(failure, { cause: error });
    }
    if (result.byteLength === 0) throw new Error(empty);
    return result;
  }
}
