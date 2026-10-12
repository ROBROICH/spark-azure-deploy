import { ownProcessOutput } from "../../src/process-output.ts";

import { log } from "evlog";

ownProcessOutput("process-output-closed-stdout");

log.info({ message: "Before the reader closed" });
await Bun.sleep(300);
for (let index = 0; index < 5; index += 1) {
  log.info({ message: "After the reader closed", index });
  console.error("Library output after the reader closed");
}
await Bun.sleep(300);
