export type MachineIdentity = {
  namespace: string;
  serviceAccount: string;
  allowed: boolean;
};

const identityPattern = /^spiffe:\/\/[^/]+\/ns\/([^/]+)\/sa\/([^/]+)$/;

const matchesAllowlist = (spiffe: string, allowlist: string) =>
  allowlist
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .some((pattern) => {
      const expression = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
      return new RegExp(`^${expression}$`).test(spiffe);
    });

export function machineIdentityFromXfcc(
  xfcc: string | undefined,
  allowlist: string,
): MachineIdentity | null {
  if (!xfcc) return null;
  const matches = [...xfcc.matchAll(/(?:^|[;,])\s*URI="?(spiffe:\/\/[^";,\s]+)"?/gi)];
  const spiffe = matches.length === 1 ? matches[0]?.[1] : undefined;
  if (spiffe === undefined) return null;
  const match = identityPattern.exec(spiffe);
  if (!match) return null;
  return {
    namespace: match[1]!,
    serviceAccount: match[2]!,
    allowed: matchesAllowlist(spiffe, allowlist),
  };
}
