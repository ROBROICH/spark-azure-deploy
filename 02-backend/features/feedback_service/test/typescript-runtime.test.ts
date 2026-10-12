import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";

import { feedback, feedbackHistory } from "../src/db/schema";

describe("Feedback production schema and node contract", () => {
  test("maps the production feedback tables", () => {
    const current = getTableConfig(feedback);
    const history = getTableConfig(feedbackHistory);

    expect(current.name).toBe("feedback");
    expect(history.name).toBe("feedback_history");
    expect(current.primaryKeys).toHaveLength(1);
    expect(current.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual([
      "id",
      "project_version",
    ]);
  });
});
