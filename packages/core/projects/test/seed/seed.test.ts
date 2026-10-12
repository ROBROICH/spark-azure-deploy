import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import mutationScenarios from "../../fixtures/mutation-scenarios.json";
import {
  createSeedDatabase,
  readSeedState,
  type MutationDatabase,
} from "../support/mutation-database.ts";

const describeSeedTests = process.env.PLS_SEED_DATABASE_URL === undefined ? describe.skip : describe;

describeSeedTests("Project Logic deterministic seed test", () => {
  let database: MutationDatabase;

  beforeAll(async () => {
    database = createSeedDatabase();
    await database.ready();
  });

  afterAll(async () => {
    await database.close();
  });

  test("freezes stable IDs, lookup order, defaults, and second-run idempotency", async () => {
    const { projectStatusIds, projectTypeId } = mutationScenarios.seed;
    const [open, inProgress, inCreation, completed, uploadDocuments] = projectStatusIds;
    if (
      open === undefined ||
      inProgress === undefined ||
      inCreation === undefined ||
      completed === undefined ||
      uploadDocuments === undefined ||
      projectStatusIds.length !== 5
    ) {
      throw new Error("The seed fixture must define exactly five project statuses");
    }
    const state = await readSeedState(database, projectStatusIds, projectTypeId);

    expect(
      state.statuses.map(({ id, name, internalName }) => ({ id, name, internalName })),
    ).toEqual([
      { id: open, name: "Offen", internalName: "OPEN" },
      { id: inProgress, name: "In Bearbeitung", internalName: "IN_PROGRESS" },
      { id: inCreation, name: "In Erstellung", internalName: "IN_CREATION" },
      { id: completed, name: "Abgeschlossen", internalName: "COMPLETED" },
      { id: uploadDocuments, name: "In Erstellung", internalName: "UPLOAD_DOCUMENTS" },
    ]);
    expect(state.types.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: projectTypeId, name: "Fernstraße" },
    ]);

    expect(state.statusHistory).toEqual([]);
    expect(state.typeHistory).toEqual([]);
  });
});
