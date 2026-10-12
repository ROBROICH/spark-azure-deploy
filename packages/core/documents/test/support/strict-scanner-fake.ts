export type ScannerOutcome =
  | "clean"
  | "infected"
  | "infected-alternate"
  | "malformed"
  | "ambiguous"
  | "unavailable"
  | "closed";

export interface ScannerExpectation {
  readonly outcome: ScannerOutcome;
  readonly body: Uint8Array;
}

interface SocketData {
  bytes: Uint8Array;
  handled: boolean;
}

const concat = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const value = new Uint8Array(left.byteLength + right.byteLength);
  value.set(left);
  value.set(right, left.byteLength);
  return value;
};

const indexOf = (value: Uint8Array, needle: Uint8Array): number => {
  outer: for (let index = 0; index <= value.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (value[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
};

const headerBoundary = new TextEncoder().encode("\r\n\r\n");

const response = (status: number, body: string, contentType = "application/json"): Uint8Array => {
  const bytes = new TextEncoder().encode(body);
  const reason =
    status === 200
      ? "OK"
      : status === 406
        ? "Not Acceptable"
        : status === 500
          ? "Internal Server Error"
          : "Service Unavailable";
  return new Uint8Array([
    ...new TextEncoder().encode(
      `HTTP/1.1 ${status} ${reason}\r\nContent-Type: ${contentType}\r\nContent-Length: ${bytes.byteLength}\r\nConnection: close\r\n\r\n`,
    ),
    ...bytes,
  ]);
};

const json = (status: number, body: Record<string, string>): Uint8Array =>
  response(status, JSON.stringify(body));

/** Raw TCP peer: it validates the exact HTTP wire request before choosing a reviewed outcome. */
export class StrictScannerFake {
  private readonly pending: ScannerExpectation[];
  private readonly failures: string[] = [];
  private listener: Bun.TCPSocketListener<SocketData> | undefined;

  constructor(...expectations: readonly ScannerExpectation[]) {
    this.pending = [...expectations];
  }

  start(): this {
    if (this.listener) throw new Error("scanner fake is already running");
    this.listener = Bun.listen<SocketData>({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        open: (socket) => {
          socket.data = { bytes: new Uint8Array(), handled: false };
        },
        data: (socket, data) => {
          if (socket.data.handled) return;
          socket.data.bytes = concat(socket.data.bytes, Uint8Array.from(data));
          this.tryHandle(socket);
        },
        error: (_socket, error) => {
          this.failures.push(`scanner TCP error: ${error.message}`);
        },
      },
    });
    return this;
  }

  get baseUrl(): string {
    if (!this.listener) throw new Error("scanner fake is not running");
    return `http://127.0.0.1:${this.listener.port}`;
  }

  stop(): void {
    this.listener?.stop(true);
    this.listener = undefined;
  }

  assertComplete(): void {
    if (this.pending.length) {
      this.failures.push(
        `unconsumed scanner expectations: ${this.pending.map(({ outcome }) => outcome).join(", ")}`,
      );
    }
    if (this.failures.length) throw new Error(this.failures.join("; "));
  }

  private tryHandle(socket: Bun.Socket<SocketData>): void {
    const boundary = indexOf(socket.data.bytes, headerBoundary);
    if (boundary < 0) return;
    const head = new TextDecoder().decode(socket.data.bytes.slice(0, boundary));
    const lines = head.split("\r\n");
    const [method, path] = lines[0]?.split(" ") ?? [];
    const headers = new Map(
      lines.slice(1).flatMap((line) => {
        const separator = line.indexOf(":");
        return separator < 0
          ? []
          : [[line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]];
      }),
    );
    const contentLength = Number(headers.get("content-length") ?? "0");
    const bodyStart = boundary + headerBoundary.byteLength;
    if (socket.data.bytes.byteLength < bodyStart + contentLength) return;
    socket.data.handled = true;
    const body = socket.data.bytes.slice(bodyStart, bodyStart + contentLength);

    const expectation = this.pending.shift();
    if (!expectation) {
      this.failures.push("unexpected scanner request");
      socket.end(response(500, "unexpected scanner request", "text/plain"));
      return;
    }
    const mismatches: string[] = [];
    if (method !== "POST") mismatches.push(`method=${String(method)}`);
    if (path !== "/api/stream-scan") mismatches.push(`path=${String(path)}`);
    if (headers.get("content-type") !== "application/octet-stream") {
      mismatches.push(`content-type=${String(headers.get("content-type"))}`);
    }
    if (!Bun.deepEquals(body, expectation.body)) mismatches.push("body");
    if (mismatches.length) {
      this.failures.push(`scanner request mismatch: ${mismatches.join(", ")}`);
      socket.end(response(500, "scanner request mismatch", "text/plain"));
      return;
    }

    switch (expectation.outcome) {
      case "clean":
        socket.end(json(200, { status: "OK" }));
        break;
      case "infected":
        socket.end(json(200, { status: "FOUND", message: "Eicar-Test-Signature" }));
        break;
      case "infected-alternate":
        socket.end(json(406, { status: "FOUND", message: "Alt-Test-Signature" }));
        break;
      case "malformed":
        socket.end(response(200, "{not-json"));
        break;
      case "ambiguous":
        socket.end(json(200, { status: "UNKNOWN" }));
        break;
      case "unavailable":
        socket.end(json(503, { status: "ERROR" }));
        break;
      case "closed":
        socket.end();
        break;
    }
  }
}
