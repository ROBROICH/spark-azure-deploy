import { ownProcessOutput } from "../../src/process-output.ts";

import { inspect } from "node:util";

import { createError, log } from "evlog";

import { createHttpHost } from "../../src/index.ts";

ownProcessOutput("process-output-fixture");

await createHttpHost("process-output-fixture")
  .get("/handled", () => {
    throw createError({ message: "Handled failure", status: 409 });
  })
  .handle(new Request("http://localhost/handled"));

console.error("Library failure", new Error("first line\nsecond line", { cause: new Error("Root cause") }));
console.table([{ fixture: "table" }]);
console.dir({ fixture: { nested: "dir" } }, { depth: 5 });
console.assert(false, "Fixture assertion");
console.count("fixture-count");
console.group("Fixture group");
console.groupEnd();
console.trace("Fixture trace %s", "formatted");
console.write("Fixture write\n");
console.log({
  [inspect.custom]: () => {
    console.warn("Nested warning");
    return "Outer message";
  },
});
process.emitWarning("Fixture warning");

const circular = { count: 10n, self: {} };
circular.self = circular;
log.info({ message: "Drain-hostile value", value: circular });
log.info({
  message: "Unserializable value",
  value: {
    get failing() {
      throw new Error("Getter failure");
    },
  },
});

setTimeout(() => {
  throw new Error("Timer failure");
}, 50);
