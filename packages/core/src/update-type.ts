import { pgEnum } from "drizzle-orm/pg-core";

export const updateType = pgEnum("updatetype", ["AUTOMATED", "MANUAL"]);
