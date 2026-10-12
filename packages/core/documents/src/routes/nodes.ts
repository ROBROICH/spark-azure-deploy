import { createNodeRoutes, createNodeVersionRoutes } from "@spark-workflow/node-crud";
import type { AnyElysia } from "elysia";

import { documentNodeDescriptor } from "../runtime.ts";

export function createDocumentNodeRoutes<const App extends AnyElysia>(app: App) {
  const nodes = createNodeRoutes(
    app,
    documentNodeDescriptor,
    ({ documentRuntime }) => documentRuntime.node,
    {
      addUpdateEndpoint: false,
    },
  );
  return createNodeVersionRoutes(
    nodes,
    documentNodeDescriptor,
    ({ documentRuntime }) => documentRuntime.node,
  );
}
