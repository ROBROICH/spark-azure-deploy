import type { BetterDrizzleClient } from "better-drizzle";

import type { UsecaseDatabaseSchema, UsecaseDocumentRecord, UsecaseWrite } from "../src/index.ts";

export type MemoryCatalog = BetterDrizzleClient<UsecaseDatabaseSchema> & {
  failNextCreate(): void;
  transact<Result>(callback: () => Promise<Result>): Promise<Result>;
};

export const memoryCatalog = (): MemoryCatalog => {
  let rows: UsecaseDocumentRecord[] = [];
  let createFailure: Error | undefined;
  type UpdatedAtFilter = Date | { gte?: Date; lt?: Date };
  type MemoryWhere = { authorityId?: string; updatedAt?: UpdatedAtFilter };
  const matchesUpdatedAt = (value: Date | undefined, filter: UpdatedAtFilter) => {
    if (value === undefined) return false;
    if (filter instanceof Date) return value.getTime() === filter.getTime();
    return (
      (filter.gte === undefined || value >= filter.gte) &&
      (filter.lt === undefined || value < filter.lt)
    );
  };
  const matching = (where?: MemoryWhere) =>
    rows.filter(
      (row) =>
        (where?.authorityId === undefined || row.authorityId === where.authorityId) &&
        (where?.updatedAt === undefined || matchesUpdatedAt(row.updatedAt, where.updatedAt)),
    );
  const usecaseDocuments = {
    findMany: async (args: { where?: MemoryWhere } = {}) =>
      matching(args.where).map((row) => ({
        ...row,
        updatedAt: row.updatedAt === undefined ? undefined : new Date(row.updatedAt),
      })),
    deleteMany: async (args: { where?: MemoryWhere } = {}) => {
      const deleted = new Set(matching(args.where));
      const kept = rows.filter((row) => !deleted.has(row));
      const count = rows.length - kept.length;
      rows = kept;
      return { count };
    },
    createMany: async ({ data }: { data: UsecaseDocumentRecord[] }) => {
      if (createFailure !== undefined) {
        const failure = createFailure;
        createFailure = undefined;
        throw failure;
      }
      const updatedAt = new Date();
      rows.push(
        ...data.map((row) => ({
          ...row,
          updatedAt: row.updatedAt === undefined ? updatedAt : new Date(row.updatedAt),
        })),
      );
      return { count: data.length };
    },
  };
  const client = {
    usecaseDocuments,
    failNextCreate: () => {
      createFailure = new Error("catalog insert failed");
    },
    transact: async <Result>(callback: () => Promise<Result>) => {
      const snapshot = rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt === undefined ? undefined : new Date(row.updatedAt),
      }));
      try {
        return await callback();
      } catch (error) {
        rows = snapshot;
        throw error;
      }
    },
  };
  return client as MemoryCatalog;
};

export const ALPHA = "00000000-0000-4000-8000-0000000000a1";
export const BETA = "00000000-0000-4000-8000-0000000000b1";
export const GAMMA = "00000000-0000-4000-8000-0000000000c1";
export const MISSING = "00000000-0000-4000-8000-00000000000e";
export const EDITOR = "00000000-0000-4000-8000-0000000000d1";
export const OTHER = "00000000-0000-4000-8000-0000000000f1";
export const UNKNOWN_PARENT = "00000000-0000-4000-8000-000000000099";

export const nodeId = (id: string, offset = 1n) => {
  const parts = id.split("-");
  const last = parts[4]!;
  const next = (BigInt(`0x${last}`) + offset).toString(16).padStart(12, "0");
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${next}`;
};

export const usecaseWrite = (id: string, name = id): UsecaseWrite => ({
  projekttyp: { id, name },
  gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
  dokumente: { categories: [] },
  beschluss: {
    nodes: [
      {
        id: nodeId(id),
        parent_vae_node_id: null,
        title: "Root",
        text: "",
        topic: null,
        order: 0,
        is_hidden: false,
        can_add_child: false,
      },
    ],
  },
});
