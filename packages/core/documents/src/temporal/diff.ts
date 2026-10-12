import type { ComputeDiffInput, FileDiffResult, RenameChange } from "./contracts.ts";

export interface DiffFileRow {
  readonly id: string;
  readonly filename: string;
  readonly bucketPath: string;
}

export interface DiffStorage {
  head(path: string): Promise<{ readonly metadata: Readonly<Record<string, string>> }>;
  file(path: string): Blob;
}

const basename = (value: string): string => value.replaceAll("\\", "/").split("/").at(-1) ?? value;
const dirname = (value: string): string => {
  const normalized = value.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "." : normalized.slice(0, separator) || "/";
};

async function sha256(storage: DiffStorage, path: string): Promise<string> {
  const metadata = await storage.head(path);
  const known = metadata.metadata.sha256;
  if (known) return known;
  const hash = new Bun.CryptoHasher("sha256");
  await storage
    .file(path)
    .stream()
    .pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          hash.update(chunk);
        },
      }),
    );
  return hash.digest("hex");
}

function longestCommonSubstring(
  left: string,
  right: string,
): {
  left: number;
  right: number;
  length: number;
} {
  let best = { left: 0, right: 0, length: 0 };
  for (let leftStart = 0; leftStart < left.length; leftStart += 1) {
    for (let rightStart = 0; rightStart < right.length; rightStart += 1) {
      let length = 0;
      while (
        leftStart + length < left.length &&
        rightStart + length < right.length &&
        left[leftStart + length] === right[rightStart + length]
      ) {
        length += 1;
      }
      if (length > best.length) best = { left: leftStart, right: rightStart, length };
    }
  }
  return best;
}

function matchingCharacters(left: string, right: string): number {
  const match = longestCommonSubstring(left, right);
  if (match.length === 0) return 0;
  return (
    match.length +
    matchingCharacters(left.slice(0, match.left), right.slice(0, match.right)) +
    matchingCharacters(
      left.slice(match.left + match.length),
      right.slice(match.right + match.length),
    )
  );
}

export function filenameSimilarity(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const total = normalizedLeft.length + normalizedRight.length;
  return total === 0 ? 1 : (2 * matchingCharacters(normalizedLeft, normalizedRight)) / total;
}

export async function computeFileDiff(
  input: ComputeDiffInput,
  targetFiles: readonly DiffFileRow[],
  storage: DiffStorage,
): Promise<FileDiffResult> {
  const ewms = input.entryFileType === "ewms_document";
  const sourceInfo = new Map<string, { bucketPath: string; sha: string }>();
  for (const file of input.files) {
    if (file.bucketPath === null) throw new Error(`File ${file.filename} has no bucket path`);
    const name = ewms ? basename(file.filename) : file.filename;
    if (!sourceInfo.has(name)) sourceInfo.set(name, { bucketPath: file.bucketPath, sha: "" });
  }
  if (ewms) {
    const targetByName = new Map(targetFiles.map((file) => [basename(file.filename), file.id]));
    return {
      new: [...sourceInfo.entries()]
        .filter(([name]) => !targetByName.has(name))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([filename, value]) => ({ filename, bucketPath: value.bucketPath, sha: null })),
      duplicate: [...sourceInfo.entries()]
        .filter(([name]) => targetByName.has(name))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([filename, value]) => ({
          filename,
          bucketPath: value.bucketPath,
          existingFileId: targetByName.get(filename)!,
        })),
      deleted: [],
      changed: [],
      renamed: [],
      unchanged: [],
    };
  }

  const targetInfo = new Map<string, { id: string; bucketPath: string; sha: string }>();
  for (const file of targetFiles) {
    if (!targetInfo.has(file.filename)) {
      targetInfo.set(file.filename, { id: file.id, bucketPath: file.bucketPath, sha: "" });
    }
  }
  for (const value of sourceInfo.values()) {
    value.sha = await sha256(storage, value.bucketPath);
  }
  for (const value of targetInfo.values()) {
    value.sha = await sha256(storage, value.bucketPath);
  }

  const threshold = input.renameSimilarityThreshold ?? 0.65;
  const sameDirectory = input.renameSameDirOnly ?? true;
  const renamed: RenameChange[] = [];
  const renamedSources = new Set<string>();
  const renamedTargets = new Set<string>();
  const seen = new Set<string>();
  for (const [sourceName, source] of sourceInfo) {
    for (const [targetName, target] of targetInfo) {
      if (sourceName === targetName || source.sha !== target.sha) continue;
      const pair = [sourceName, targetName].sort().join("\u0000");
      if (seen.has(pair)) continue;
      if (sameDirectory && dirname(sourceName) !== dirname(targetName)) continue;
      if (filenameSimilarity(sourceName, targetName) < threshold) continue;
      seen.add(pair);
      renamedSources.add(sourceName);
      renamedTargets.add(targetName);
      renamed.push({
        fileId: target.id,
        oldName: targetName,
        newName: sourceName,
        sha: source.sha,
        bucketPath: source.bucketPath,
      });
    }
  }
  renamed.sort((left, right) => left.oldName.localeCompare(right.oldName));

  const sourceNames = [...sourceInfo.keys()];
  const targetNames = [...targetInfo.keys()];
  return {
    renamed,
    new: sourceNames
      .filter((name) => !targetInfo.has(name) && !renamedSources.has(name))
      .sort()
      .map((filename) => ({
        filename,
        bucketPath: sourceInfo.get(filename)!.bucketPath,
        sha: sourceInfo.get(filename)!.sha,
      })),
    deleted: targetNames
      .filter((name) => !sourceInfo.has(name) && !renamedTargets.has(name))
      .sort()
      .map((filename) => ({
        fileId: targetInfo.get(filename)!.id,
        filename,
        sha: targetInfo.get(filename)!.sha,
      })),
    changed: sourceNames
      .filter(
        (name) =>
          targetInfo.has(name) &&
          !renamedSources.has(name) &&
          !renamedTargets.has(name) &&
          sourceInfo.get(name)!.sha !== targetInfo.get(name)!.sha,
      )
      .sort()
      .map((filename) => ({
        fileId: targetInfo.get(filename)!.id,
        bucketPath: sourceInfo.get(filename)!.bucketPath,
        filename,
        sourceSha: sourceInfo.get(filename)!.sha,
        targetSha: targetInfo.get(filename)!.sha,
      })),
    unchanged: sourceNames
      .filter(
        (name) =>
          targetInfo.has(name) &&
          !renamedSources.has(name) &&
          !renamedTargets.has(name) &&
          sourceInfo.get(name)!.sha === targetInfo.get(name)!.sha,
      )
      .sort()
      .map((filename) => ({
        fileId: targetInfo.get(filename)!.id,
        filename,
        sha: sourceInfo.get(filename)!.sha,
      })),
    duplicate: [],
  };
}
