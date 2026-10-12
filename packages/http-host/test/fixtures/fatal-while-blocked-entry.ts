import { log } from "evlog";

import { createHttpHost } from "../../src/index.ts";
import { ownProcessOutput } from "../../src/process-output.ts";

ownProcessOutput("process-output-fatal-while-blocked");
process.on("uncaughtException", () => process.stderr.write("fatal\n"));

const app = createHttpHost("process-output-fatal-while-blocked")
  .get("/fail", () => {
    setTimeout(() => {
      for (let index = 0; index < 128; index += 1) {
        log.info({ message: "Queued before the failure", index, payload: "x".repeat(32_768) });
      }
      throw new Error("Fatal while output is blocked");
    });
    return { armed: true };
  })
  .get("/business", () => {
    process.stderr.write("business\n");
    return { processed: true };
  })
  .listen({ hostname: "127.0.0.1", port: 0 });

process.stderr.write(`${app.server!.url.href}\n`);
