import { ownProcessOutput } from "../../src/process-output.ts";
import { log } from "evlog";

ownProcessOutput("process-output-blocked");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response("healthy"),
});
process.once("SIGTERM", () => {
  log.info({ message: "Stopped after signal" });
  void server.stop();
  process.send?.("stopped");
  process.disconnect?.();
});
process.once("message", () => {
  process.send?.("writing");
  log.info({ message: "Blocked output", payload: "x".repeat(4_000_000), password: "blocked-output-secret" });
});
process.send?.(server.url.href);
