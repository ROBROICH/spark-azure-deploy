import { resolve } from "node:path";

import { temporalWorkflow as bunTemporalWorkflow } from "build-temporal-workflow/bun";
import { temporalWorkflow as viteTemporalWorkflow } from "build-temporal-workflow/vite";

import { workflowCryptoInjectPath } from "./runtime-plugin.ts";

const temporalSourceMapFile = {
  name: "temporal-source-map-file",
  setup(build: {
    onEnd(
      callback: (result: {
        outputFiles?: Array<{ path: string; text: string; contents: Uint8Array }>;
      }) => void,
    ): void;
  }) {
    build.onEnd((result) => {
      const output = result.outputFiles?.find((file) => file.path.endsWith(".js"));
      if (output === undefined) return;
      const marker = "//# sourceMappingURL=data:application/json;base64,";
      const markerIndex = output.text.lastIndexOf(marker);
      if (markerIndex < 0) return;
      const sourceMap = JSON.parse(
        Buffer.from(output.text.slice(markerIndex + marker.length).trimEnd(), "base64").toString(),
      ) as { file?: string };
      sourceMap.file = "workflow-bundle.js";
      output.contents = Buffer.from(
        output.text.slice(0, markerIndex) +
          marker +
          Buffer.from(JSON.stringify(sourceMap)).toString("base64") +
          "\n",
      );
    });
  },
};

const bundleOptions = {
  buildOptions: {
    inject: [workflowCryptoInjectPath],
    plugins: [temporalSourceMapFile],
  },
  workflowInterceptorModules: [resolve(import.meta.dirname, "workflow-interceptors.ts")],
};

export const sparkTemporalWorkflowVite = () => viteTemporalWorkflow({ bundleOptions });

export const sparkTemporalWorkflowBun = () => bunTemporalWorkflow({ bundleOptions });
