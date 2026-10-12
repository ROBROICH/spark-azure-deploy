export interface VirusScanResult {
  readonly isClean: boolean;
  readonly threatName: string | null;
}

export interface ClamAvClientOptions {
  readonly enabled: boolean;
  readonly baseUrl: string;
}

export class ScannerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ScannerUnavailableError";
  }
}

interface ScannerResponse {
  status?: string;
  message?: string;
  viruses?: string[];
}

export function parseScannerResponse(status: number, body: string): VirusScanResult {
  if (status === 200 || status === 406) {
    let value: ScannerResponse;
    try {
      value = JSON.parse(body);
    } catch (error) {
      if (status === 406) return { isClean: false, threatName: null };
      throw new ScannerUnavailableError(
        `Virus scanner returned unparseable response (HTTP ${status}): ${body.slice(0, 200)}`,
        { cause: error },
      );
    }

    const scanStatus = value.status?.toUpperCase() ?? "";
    if (scanStatus === "FOUND" || status === 406) {
      const firstVirus = Array.isArray(value.viruses) ? value.viruses[0] : undefined;
      const threat = value.message ?? firstVirus;
      return {
        isClean: false,
        threatName: threat && threat !== "" ? threat : null,
      };
    }
    if (scanStatus === "OK") return { isClean: true, threatName: null };
    throw new ScannerUnavailableError(
      `Virus scanner returned unexpected status '${String(value.status)}' (HTTP ${status}): ${body.slice(0, 200)}`,
    );
  }

  throw new ScannerUnavailableError(
    `Virus scanner returned unexpected status ${status}: ${body.slice(0, 200)}`,
  );
}

export class ClamAvClient {
  constructor(private readonly options: ClamAvClientOptions) {}

  async scanBytes(content: Uint8Array): Promise<VirusScanResult> {
    if (!this.options.enabled) return { isClean: true, threatName: null };

    const requestBytes = Uint8Array.from(content);
    const response = await fetch(
      new URL("/api/stream-scan", `${this.options.baseUrl.replace(/\/+$/, "")}/`),
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: requestBytes.buffer,
      },
    );
    return parseScannerResponse(response.status, await response.text());
  }
}
