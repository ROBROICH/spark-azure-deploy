import { BlockList, isIP } from "node:net";

import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export interface FileUrlPolicy {
  readonly allowedDomains: readonly string[];
  readonly blockPrivateIps: boolean;
}

const FileUrlPolicyEnvironment = Type.Object(
  {
    FPP_ALLOWED_DOMAINS: Type.String(),
    FPP_BLOCK_PRIVATE_IPS: Type.Boolean(),
  },
  { additionalProperties: false },
);

export function parseFileUrlPolicy(source: typeof process.env): FileUrlPolicy {
  const environment = Value.Parse(FileUrlPolicyEnvironment, source);
  return Object.freeze({
    allowedDomains: Object.freeze(
      environment.FPP_ALLOWED_DOMAINS.split(",")
        .map((domain) => domain.trim())
        .filter(Boolean),
    ),
    blockPrivateIps: environment.FPP_BLOCK_PRIVATE_IPS,
  });
}

export const privateAddressBlockList = new BlockList();
privateAddressBlockList.addSubnet("0.0.0.0", 8);
privateAddressBlockList.addSubnet("10.0.0.0", 8);
privateAddressBlockList.addSubnet("100.64.0.0", 10);
privateAddressBlockList.addSubnet("127.0.0.0", 8);
privateAddressBlockList.addSubnet("169.254.0.0", 16);
privateAddressBlockList.addSubnet("172.16.0.0", 12);
privateAddressBlockList.addSubnet("192.168.0.0", 16);
privateAddressBlockList.addAddress("::", "ipv6");
privateAddressBlockList.addAddress("::1", "ipv6");
privateAddressBlockList.addSubnet("fc00::", 7, "ipv6");
privateAddressBlockList.addSubnet("fe80::", 10, "ipv6");

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "localhost.localdomain") return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  const family = isIP(normalized);
  if (family === 4 || family === 6) {
    return privateAddressBlockList.check(normalized, family === 4 ? "ipv4" : "ipv6");
  }
  return (
    /^(?:10|127|169\.254|192\.168)\./.test(normalized) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

function isDomainAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
  const candidate = hostname.toLowerCase();
  return allowedDomains.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    if (candidate === allowed) return true;
    if (allowed.startsWith("**.")) {
      const base = allowed.slice(3);
      return candidate === base || candidate.endsWith(`.${base}`);
    }
    if (allowed.startsWith("*.")) return candidate.endsWith(`.${allowed.slice(2)}`);
    return false;
  });
}

export function validateFileUrl(value: string, policy: FileUrlPolicy): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL format");
  }
  if (url.protocol !== "https:") {
    throw new Error(
      `Only HTTPS URLs are allowed. Received scheme: ${url.protocol.replace(":", "")}`,
    );
  }
  if (url.username || url.password) {
    throw new Error(
      "URLs with embedded credentials are not allowed. Use proper authentication mechanisms instead.",
    );
  }
  if (!url.hostname) throw new Error("URL must contain a valid hostname");
  if (policy.blockPrivateIps && isPrivateHost(url.hostname)) {
    throw new Error(`Private/internal IP addresses are not allowed: ${url.hostname}`);
  }
  if (!isDomainAllowed(url.hostname, policy.allowedDomains)) {
    throw new Error(
      `Domain '${url.hostname}' is not in the allowlist. Allowed domains: ${policy.allowedDomains.join(", ") || "none configured"}`,
    );
  }
  return value;
}
