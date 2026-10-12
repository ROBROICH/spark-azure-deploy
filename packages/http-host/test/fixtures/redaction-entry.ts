import { ownProcessOutput } from "../../src/process-output.ts";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { Elysia, t } from "elysia";
import { log } from "evlog";
import { createHttpHost } from "../../src/index.ts";

ownProcessOutput("redaction-fixture");
const [scenario, fatal] = process.argv.slice(2);

if (scenario === "replacement-token") {
  let failure: unknown;
  await new Elysia()
    .onError(({ error }) => { failure = error; })
    .post("/invalid", () => "accepted", { body: t.Record(t.String(), t.Integer()) })
    .handle(new Request("http://localhost/invalid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "$&": "private-replacement-token-s03" }),
    }));
  throw failure;
}

if (scenario === "validation" || scenario === "serialization") {
  const body = { email: "personal-s03@example.invalid", age: "private-age-s03", name: 9371234501234 };
  if (fatal === "fatal" || scenario === "serialization") {
    let validationError: unknown;
    await new Elysia()
      .onError(({ error }) => { validationError = error; })
      .post("/invalid", () => "accepted", { body: t.Object({ email: t.String(), age: t.Integer(), name: t.String() }) })
      .handle(new Request("http://localhost/invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    if (scenario === "serialization") {
      if (!(validationError instanceof Error)) throw new Error("Expected a validation error");
      log.error({
        message: validationError.message,
        error: validationError,
        value: { get hostile() { throw new Error("Getter failure"); } },
      });
    } else {
      throw validationError;
    }
  } else {
    const response = await createHttpHost("redaction-fixture")
      .post("/invalid", () => "accepted", { body: t.Object({ email: t.String(), age: t.Integer(), name: t.String() }) })
      .handle(new Request("http://localhost/invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    log.info({ message: "Validation completed", responseStatus: response.status });
  }
} else if (scenario === "database") {
  const url = process.env.S03_DATABASE_URL;
  if (!url) throw new Error("S03_DATABASE_URL is required");
  const client = new SQL(url, { max: 1, prepare: false });
  const database = drizzle({ client });
  let failure: unknown;
  try {
    await database.execute(sql`create temporary table redaction_subject (email text unique)`);
    await database.execute(sql`insert into redaction_subject values (${"database-personal-s03@example.invalid"})`);
    await database.execute(sql`insert into redaction_subject values (${"database-personal-s03@example.invalid"})`);
  } catch (error) {
    failure = error;
  } finally {
    await client.close();
  }
  if (!(failure instanceof Error)) throw new Error("Expected a unique violation");
  if (fatal === "fatal") throw failure;
  log.error({ message: "Database rejected duplicate", error: failure });
  console.error("Database console failure", failure);
  console.trace("Database trace failure", failure);
  process.emitWarning(failure);
} else if (scenario === "fields") {
  const fields = { password: "password-s03", secret: "secret-s03", token: "token-s03", authorization: "authorization-s03", cookie: "cookie-s03", params: ["params-s03"] };
  const event = { message: "Public diagnostic", schema: { type: "object", properties: { email: { type: "string" } } }, nested: fields };
  if (fatal === "fatal") throw Object.assign(new Error("Public fatal diagnostic"), event);
  log.info(event);
  console.log("Structured console", fields);
}
