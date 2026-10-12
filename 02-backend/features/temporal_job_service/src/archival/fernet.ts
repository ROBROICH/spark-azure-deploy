import {
  createCipheriv,
  createHmac,
  randomBytes as secureRandomBytes,
} from "node:crypto";

export interface FernetEncryptionOptions {
  readonly timestampSeconds?: number;
  readonly iv?: Uint8Array;
}

function decodeKey(encoded: string): Buffer {
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 32) {
    throw new TypeError("Fernet key must be a URL-safe base64-encoded 32-byte key");
  }
  return decoded;
}

function timestampBytes(timestampSeconds: number): Buffer {
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new TypeError("Fernet timestamp must be a nonnegative safe integer");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(timestampSeconds));
  return bytes;
}

function urlSafeBase64(value: Uint8Array): Buffer {
  return Buffer.from(
    Buffer.from(value)
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_"),
    "ascii",
  );
}

export function encryptFernet(
  plaintext: Uint8Array,
  encodedKey: string,
  options: FernetEncryptionOptions = {},
): Uint8Array {
  const key = decodeKey(encodedKey);
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);
  const iv = Buffer.from(options.iv ?? secureRandomBytes(16));
  if (iv.byteLength !== 16) {
    throw new TypeError("Fernet IV must contain exactly 16 bytes");
  }
  const timestamp =
    options.timestampSeconds ?? Math.floor(Date.now() / 1_000);

  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const signed = Buffer.concat([
    Buffer.from([0x80]),
    timestampBytes(timestamp),
    iv,
    ciphertext,
  ]);
  const signature = createHmac("sha256", signingKey).update(signed).digest();
  return urlSafeBase64(Buffer.concat([signed, signature]));
}
