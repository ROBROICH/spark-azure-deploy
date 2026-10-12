export type MutationBucket = "clean" | "quarantine";

export interface MutationStorage {
  clean: Bun.S3Client;
  quarantine: Bun.S3Client;
  objectKey(relativePath: string): string;
}

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set for the DMS mutation storage test`);
  }
  return value;
};

export function createMutationStorage(): MutationStorage {
  const endpoint = requiredEnvironment("S3_ENDPOINT_URL");
  const region = requiredEnvironment("S3_REGION");
  const clean = new Bun.S3Client({
    accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
    bucket: requiredEnvironment("BUCKET_NAME"),
    endpoint,
    region,
  });
  const quarantine = new Bun.S3Client({
    accessKeyId: requiredEnvironment("QUARANTINE_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("QUARANTINE_S3_SECRET_ACCESS_KEY"),
    bucket: requiredEnvironment("QUARANTINE_BUCKET_NAME"),
    endpoint: requiredEnvironment("QUARANTINE_S3_ENDPOINT_URL"),
    region,
  });
  const prefix = (process.env.DOC_STORE_PATH ?? "").replace(/^\/+|\/+$/g, "");
  return {
    clean,
    quarantine,
    objectKey(relativePath) {
      const path = relativePath.replace(/^\/+/, "");
      return prefix === "" ? path : `${prefix}/${path}`;
    },
  };
}

const clientFor = (storage: MutationStorage, bucket: MutationBucket): Bun.S3Client =>
  bucket === "clean" ? storage.clean : storage.quarantine;

export async function putMutationObject(
  storage: MutationStorage,
  bucket: MutationBucket,
  relativePath: string,
  bytes: Uint8Array | string,
  contentType: string,
): Promise<void> {
  await clientFor(storage, bucket).write(storage.objectKey(relativePath), bytes, {
    type: contentType,
  });
}

export async function readMutationObject(
  storage: MutationStorage,
  bucket: MutationBucket,
  relativePath: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const client = clientFor(storage, bucket);
  const key = storage.objectKey(relativePath);
  const [bytes, stat] = await Promise.all([client.file(key).bytes(), client.stat(key)]);
  return { bytes, contentType: stat.type };
}

export async function mutationObjectExists(
  storage: MutationStorage,
  bucket: MutationBucket,
  relativePath: string,
): Promise<boolean> {
  return clientFor(storage, bucket).exists(storage.objectKey(relativePath));
}

export async function cleanupMutationObjects(
  storage: MutationStorage,
  objects: ReadonlyArray<{ bucket: MutationBucket; path: string }>,
): Promise<void> {
  const failures: Error[] = [];
  for (const { bucket, path } of objects) {
    try {
      const client = clientFor(storage, bucket);
      const key = storage.objectKey(path);
      if (await client.exists(key)) await client.delete(key);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "DMS mutation object cleanup failed");
  }
}

export async function assertMutationObjectsAbsent(
  storage: MutationStorage,
  objects: ReadonlyArray<{ bucket: MutationBucket; path: string }>,
): Promise<void> {
  const retained: string[] = [];
  for (const { bucket, path } of objects) {
    if (await mutationObjectExists(storage, bucket, path)) retained.push(`${bucket}:${path}`);
  }
  if (retained.length > 0) {
    throw new Error(`DMS mutation scenario retained objects: ${retained.join(", ")}`);
  }
}
