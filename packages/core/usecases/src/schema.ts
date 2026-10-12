import { jsonb, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";

import {
  UsecaseDocumentTypes,
  type UsecaseDocumentType,
  type Usecase,
  type UsecaseCatalog,
} from "./formats.ts";

export const usecaseDocuments = pgTable(
  "usecase_document",
  {
    authorityId: text("authority_id").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    document: jsonb("document").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.authorityId, table.type] })],
);

export type UsecaseDocumentRow = {
  readonly authorityId: string;
  readonly type: UsecaseDocumentType;
  readonly document:
    | Usecase["projekttyp"]
    | Usecase["gesetzesgrundlage"]
    | Usecase["dokumente"]
    | Usecase["beschluss"];
};

export const toUsecaseDocumentRows = (catalog: UsecaseCatalog): UsecaseDocumentRow[] =>
  catalog.usecases.flatMap((usecase) =>
    UsecaseDocumentTypes.map((type) => ({
      authorityId: usecase.projekttyp.id,
      type,
      document: usecase[type],
    })),
  );

export const usecaseSchema = { usecaseDocuments };
export type UsecaseDatabaseSchema = typeof usecaseSchema;
