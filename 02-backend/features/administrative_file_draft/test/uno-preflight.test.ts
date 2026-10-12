import { afterEach, describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"

import { UnoConverter, type UnoTarget } from "../src/document/uno.ts"

/**
 * Wire-level regression for the unoserver fail-fast preflight.
 *
 * Before the fix `UnoConverter.convert` issued a single POST bounded only by the
 * 120s conversion timeout, so an unreachable or stalled unoserver blocked far
 * past the ~13s Envoy gateway budget. These tests drive the converter against a
 * real fake XML-RPC/HTTP server (or a deliberately dead port) with tiny timeouts
 * and assert that failures surface within the preflight budget rather than the
 * conversion budget.
 *
 * Related: Gitea epic #4567, finding "Beschluss-PDF/Word-Export"
 * (topicId JrTvFx4GG7I).
 */

const INFO_RESPONSE = `<?xml version="1.0"?>
<methodResponse><params><param><value><struct>
  <member><name>api</name><value><string>3</string></value></member>
  <member><name>unoserver</name><value><string>fake</string></value></member>
</struct></value></param></params></methodResponse>`

const convertResponse = (bytes: Uint8Array): string => `<?xml version="1.0"?>
<methodResponse><params><param><value><base64>${Buffer.from(bytes).toString("base64")}</base64></value></param></params></methodResponse>`

interface FakeUnoServer {
  url: URL
  port: number
  stop: () => Promise<void>
}

const startFakeUno = ({
  convertDelayMs = 0,
  output = new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}: {
  convertDelayMs?: number
  output?: Uint8Array
} = {}): FakeUnoServer => {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = await request.text()
      if (body.includes("<methodName>info</methodName>")) {
        return new Response(INFO_RESPONSE, { headers: { "content-type": "text/xml" } })
      }
      if (convertDelayMs > 0) await Bun.sleep(convertDelayMs)
      return new Response(convertResponse(output), { headers: { "content-type": "text/xml" } })
    },
  })
  return {
    url: new URL(`http://127.0.0.1:${server.port}/`),
    port: Number(server.port),
    stop: () => server.stop(true),
  }
}

// A stalled server that never answers the preflight before its socket timeout.
const startStalledUno = (): FakeUnoServer => {
  const server = Bun.serve({
    port: 0,
    async fetch() {
      await Bun.sleep(60_000)
      return new Response("late", { headers: { "content-type": "text/xml" } })
    },
  })
  return {
    url: new URL(`http://127.0.0.1:${server.port}/`),
    port: Number(server.port),
    stop: () => server.stop(true),
  }
}

const deadPort = async (): Promise<number> => {
  // Bind and immediately release to obtain a port nothing is listening on.
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") })
  const port = Number(probe.port)
  await probe.stop(true)
  return port
}

const converterFor = (
  url: URL,
  { conversionTimeoutMs, preflightTimeoutMs }: { conversionTimeoutMs: number; preflightTimeoutMs: number },
): UnoConverter =>
  new UnoConverter(url.hostname, Number(url.port), "http", conversionTimeoutMs, preflightTimeoutMs)

const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

const running: FakeUnoServer[] = []
afterEach(() => {
  for (const server of running.splice(0)) void server.stop()
})

const conversionFailure = async (converter: UnoConverter, target: UnoTarget): Promise<Error> => {
  try {
    await converter.convert(DOCX, target)
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
  throw new Error(`Expected LibreOffice ${target.toUpperCase()} conversion to fail`)
}

describe("unoserver fail-fast preflight", () => {
  test("a live server round-trips the base64 methodResponse to bytes", async () => {
    const output = new Uint8Array([1, 2, 3, 4, 5])
    const server = startFakeUno({ output })
    running.push(server)
    const converter = converterFor(server.url, { conversionTimeoutMs: 5_000, preflightTimeoutMs: 5_000 })

    for (const target of ["docx", "pdf"] as UnoTarget[]) {
      const result = await converter.convert(DOCX, target)
      expect(Array.from(result)).toEqual(Array.from(output))
    }
  })

  test("a dead port fails fast, well under the conversion timeout", async () => {
    // Huge conversion timeout: if the preflight were skipped this would hang.
    const converter = new UnoConverter("127.0.0.1", await deadPort(), "http", 120_000, 500)

    const started = performance.now()
    const failure = await conversionFailure(converter, "pdf")
    expect(failure.message).toContain("LibreOffice PDF conversion failed")
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(2_000)
  })

  test("a stalled server aborts on the preflight budget, not the conversion budget", async () => {
    const server = startStalledUno()
    running.push(server)
    // Preflight budget tiny, conversion budget huge — the preflight must decide.
    const converter = converterFor(server.url, { conversionTimeoutMs: 120_000, preflightTimeoutMs: 300 })

    const started = performance.now()
    const failure = await conversionFailure(converter, "docx")
    expect(failure.message).toContain("LibreOffice DOCX conversion failed")
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(2_000)
  })
})
