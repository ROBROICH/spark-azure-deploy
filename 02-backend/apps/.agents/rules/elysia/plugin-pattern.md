# Plugin pattern

Use plugins as capability boundaries. A plugin is not just a place to call
`.use(...)`; it is the owner module for one reusable request capability.

## Ownership rule

Each plugin module owns:

- the Elysia instance for that capability
- local wiring for that capability
- static `env` imports needed by that capability
- small capability-specific checks
- the request context it decorates, derives, resolves, or guards

Examples of capabilities:

- database access
- logging
- telemetry
- metrics
- auth/session state
- request IDs
- rate limiting
- external API clients
- service adapters

## File shape

```text
src/
  setup.ts
  plugins/
    db.ts
    logger.ts
    telemetry.ts
    request-id.ts
```

`setup.ts` composes complete plugins only:

```ts
import { Elysia } from "elysia";
import { db } from "./plugins/db";
import { logger } from "./plugins/logger";
import { telemetry } from "./plugins/telemetry";

export const setup = new Elysia({ name: "setup" }).use(db).use(logger).use(telemetry);
```

Plugin modules own behavior:

```ts
// plugins/logger.ts
import { Elysia } from "elysia";
import { env } from "../env";

export const logger = new Elysia({ name: "logger" }).derive(({ request }) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  return {
    log: (message: string, fields: Record<string, unknown> = {}) => {
      console.log(
        JSON.stringify({
          service: env.SERVICE_NAME,
          requestId,
          message,
          ...fields,
        }),
      );
    },
  };
});
```

## What setup must not do

DO NOT construct capability internals in `setup.ts`:

```ts
// Bad
const logger = new Elysia({ name: "logger" }).derive(...)
const db = new Elysia({ name: "db" }).decorate("db", dbClient)

export const setup = new Elysia({ name: "setup" }).use(logger).use(db)
```

That makes `setup.ts` a behavior dump. It also makes the capability harder to
find, test, copy, or delete.

## Helper extraction rule

Keep simple, single-use capability logic inside the plugin module.

Extract a helper only when it has at least one real reason:

- reused by more than one module
- meaningful parsing or transformation
- external I/O
- independent tests
- a name that clarifies a domain concept better than inline code

DO NOT extract helpers just to create layers. A one-line check that is only used
by one plugin usually belongs directly in that plugin.

## Env and dependencies

Static process config belongs in `env.ts`. A plugin imports `env` directly when
that capability needs it.

Global clients can be imported directly from their owner module when they are
truly static:

```ts
import { dbClient } from "../db/client";

export const db = new Elysia({ name: "db" }).decorate("db", dbClient);
```

DO NOT pass generic dependency bags through `app.ts`, `setup.ts`, controller
factories, route registries, and feature route factories. If a capability is
stable for all routes, it belongs behind a plugin or in its owner module.

## Route usage

Routes should receive capabilities through the context created by
`createController(...)`, because `createController(...)` uses `setup`.

Routes should not import setup plugins directly. Routes may import static owner
modules directly only when the dependency is not request context and not a
cross-cutting request capability.
