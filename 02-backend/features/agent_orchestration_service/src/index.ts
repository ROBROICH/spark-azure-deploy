export { feature } from "./manifest.ts";

export async function startAosTemporalWorker(
  dependencies: Parameters<typeof import("./worker.ts").startAosTemporalWorker>[0],
) {
  const worker = await import("./worker.ts");
  return worker.startAosTemporalWorker(dependencies);
}

export { createRoutes } from "./routes/workflows.ts";
export { AosCommandConfiguration, AosTemporalCommands } from "./resource.ts";
export { parseAosCommandConfiguration, parseAosWorkerConfiguration } from "./env.ts";
