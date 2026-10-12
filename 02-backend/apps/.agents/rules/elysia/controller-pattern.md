# Controller pattern

This reference is only about writing a single route module well.

For app shell, setup composition, plugin ownership, or auth macro guidance, read the other references. This file should answer one question: what should an Elysia route file look like?

## Scope

A good route file owns one coherent route surface.

- Import `createController(...)` and build the routes directly in the module.
- Import static owners like `env`, shared schemas, or response helpers directly from their real module.
- Keep route-local schemas and small helpers in the file when they only serve that route surface.
- Use direct `.get(...)` or `.post(...)` chains for a tiny route surface.
- Use one `.group(...)` when the file owns a shared path prefix.
- `response` describes the normal successful return shape.
- DO NOT type route params in route options.
- Return controlled errors with `status(code, payload)`.

Apply every principle from `../direct-code.md`.

## Response contract

A route's `response` schema is the endpoint contract. It describes the normal successful return shape.

```ts
import { Elysia, t } from "elysia";

new Elysia().get(
  "/response",
  () => {
    return {
      name: "Jane Doe",
    };
  },
  {
    response: t.Object({
      name: t.String(),
    }),
  },
);
```

Schema preservation rules:

- Do not replace a success schema with a “better” or “more shared” schema unless the user explicitly asks to change the endpoint contract.
- Treat response schemas as API contract, not cleanup material. Changing which schema is used can affect Eden/OpenAPI/client typing even when the runtime object looks similar.
- “Keep route-local schemas close to the handler” means route-local schemas are good. It does not mean “dedupe them into imports.” or "move them elsewhere in the file" since those require jumping to reference.

## Error returns

For controlled errors, return `status(code, payload)`.

```ts
import { status, t } from "elysia";

export const userRoutes = createController("api.users").get(
  "/users/:userId",
  async ({ db, params }) => {
    const user = await db.query.user.findFirst({
      where: (user, { eq }) => eq(user.id, params.userId),
    });

    if (!user) return status(404, "User not found.");

    return {
      id: user.id,
      name: user.name,
    };
  },
  {
    response: t.Object({
      id: t.String(),
      name: t.String(),
    }),
    detail: { operationId: "getUser" },
  },
);
```

The route path already declares params. DO NOT add `params: t.Object(...)` for them.

Expected errors are handler returns: `status(401, "Unauthorized")`, `status(403, "Forbidden")`, `status(404, "Not found.")`, `status(409, "Conflict.")`, and similar.

Why:

- Keeps the response shape (`{ status, body }`) clear.
- TypeScript can infer the error code, so Eden/OpenAPI generators know the possible responses.
- No stack-trace noise; you control the payload.

## Throwing

A `throw` from our backend code should almost never happen for normal application, request, validation, permission, missing-resource, or conflict paths.

Use `status(...)` for failures the application owns and expects. That does not mean catching every unexpected exception and rewrapping it. If a database driver, runtime, or third-party boundary throws unexpectedly, let that failure behave like an actual unexpected failure unless the route has a concrete reason to translate it.

## Grouped Route Module

Use `.group(...)` when the file owns a shared prefix and multiple related endpoints under it.

```ts
import { status, t } from "elysia";

const FileUploadBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  contentType: t.String({ minLength: 1 }),
});

const FileResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
});

export const projectFileRoutes = createController("api.projects.files").group(
  "/projects/:projectId/files",
  (app) =>
    app
      .post(
        "/",
        async ({ body, params, db }) => {
          const file = await db.query.files.findFirst({
            where: (files, { eq, and }) =>
              and(eq(files.projectId, params.projectId), eq(files.name, body.name)),
          });
          if (file) return status(409, "Conflict.");
          return db.insert(files).values({ projectId: params.projectId, ...body }).returning();
        },
        {
          body: FileUploadBodySchema,
          response: FileResponseSchema,
          detail: { operationId: "createProjectFile" },
        },
      )
      .get(
        "/:fileId",
        async ({ params, db }) => {
          const file = await db.query.files.findFirst({
            where: (files, { eq }) => eq(files.id, params.fileId),
          });
          return file ?? status(404, "Not found.");
        },
        {
          response: FileResponseSchema,
          detail: { operationId: "getProjectFile" },
        },
      ),
);
```

The important part is the route-file shape:

- one exported controller per route surface
- one obvious URL prefix when grouping
- schemas close to the handlers that use them
- handler logic inline when it is short and route-specific
- operation IDs on non-trivial endpoints
- successful return shape described by `response`
- route params left untyped in route options
- controlled errors returned with `status(...)`

## Keep it clean

DO NOT add unrelated backend architecture noise to a route-file reference.

- DO NOT document app shell setup here.
- DO NOT document route registries here.
- DO NOT pass dependency bags or static config through route factories.
- DO NOT move tiny route-local helpers out of the file just to look layered.
- DO NOT dump broad business workflows into the route file when a plugin or owner module should provide that capability.
- DO NOT throw for controlled backend failures.
- DO NOT catch unknown failures just to rewrap them as controlled errors.
- DO NOT add `params: t.Object(...)`; params DO NOT need route-option typing.
