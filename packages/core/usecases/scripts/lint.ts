import { defaultUsecaseDirectory, loadUsecases } from "../src/index.ts";

const loaded = await loadUsecases({ directory: defaultUsecaseDirectory() });
if (loaded.status === "error") {
  console.error(loaded.error.message);
  process.exit(1);
}
