import { ownProcessOutput } from "../../src/process-output.ts";

import { log } from "evlog";

ownProcessOutput("process-output-burst");

const [count, ending] = process.argv.slice(2);
for (let index = 0; index < Number(count); index += 1) {
  log.info({ message: "Burst event", index, payload: "x".repeat(100_000) });
  await Promise.resolve();
}
log.info({ message: "Burst written" });
if (ending === "crash") throw new Error("Fatal after burst");
