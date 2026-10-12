import { FppDownloads, FppFiles } from "@spark-workflow/fpp-service/resource";
import { provide } from "@spark-workflow/resource";

import { createFppDownloadsService } from "./fpp-downloads.ts";
import { AosCommandConfiguration, AosTemporalCommands } from "./resource.ts";
import { AosTemporalCommandsService } from "./temporal/commands.ts";

export const aosTemporalCommandsProvider = provide({
  resource: AosTemporalCommands,
  needs: { configuration: AosCommandConfiguration },
  make: ({ configuration }) => new AosTemporalCommandsService(configuration),
  release: (commands) => commands.close(),
});

export const fppDownloadsProvider = provide({
  resource: FppDownloads,
  needs: { files: FppFiles, commands: AosTemporalCommands },
  make: ({ files, commands }) =>
    createFppDownloadsService(files, (input) => commands.startFppDownload(input)),
});
