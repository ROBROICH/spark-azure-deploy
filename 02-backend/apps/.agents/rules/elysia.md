---
ruleId: backend/elysia
---

# Elysia rules

Use Elysia as a typed composition layer. Keep framework structure boring, explicit, and easy to scan.

## Core workflow

1. Inspect the existing Elysia app shape before changing it: app entrypoint, route registry, plugins, route modules, and DB schema utilities.
2. Keep `main.ts` or `app.ts` thin: global middleware/plugins, error handling, route registration, and `listen` only.
3. Put static environment configuration in `env.ts`; parse `process.env` once and export `env`.
4. Import `env` directly where static runtime configuration is used.
5. Put stable request capabilities in complete plugin modules under `plugins/`.
6. Treat each plugin module as the owner of one capability: its Elysia instance, local wiring, static env imports, and small capability-specific checks live there.
7. Keep `setup.ts` as composition only: import complete plugin exports and `.use(...)` them.
8. Put auth, DB, logger, telemetry, metrics, external clients, and service adapters behind setup instead of importing them in every route.
9. Keep dependency ownership local and obvious; DO NOT forward generic bags through every layer.
10. Put routes in named modules that are created with `createController(...)`.
11. Compose route modules in one explicit `routes/index.ts` registry.
12. Put route contracts beside handlers: `body`, `query`, `params`, `headers`, `cookie`, `response`, and `detail.operationId`.
13. Keep route-local schemas small. Move large resource/model schemas to a single service-local schema file such as `src/schemas.ts`, then import them into routes.
14. Use an auth macro/plugin so handlers receive typed `user` or `session`; DO NOT parse auth headers in every route.
15. When defining a new Drizzle-shaped TypeBox contract, read `elysia/db-typebox.md` and derive insert, update, and select schemas with `drizzle-typebox`; do not replace an existing route-local success schema unless the user explicitly asks to change that endpoint contract.

## Route file layout

Use URL-shaped route modules, but do not create a flat pile of tiny files.

- Use `$param` for dynamic route params.
- Use nested folders for large route prefixes.
- Put the shared prefix in a `.group("<matching route prefix>", ...)` at the top of the route module.
- Keep coherent route surfaces together. Do not split that into many one-endpoint files.
- Avoid preserving legacy API paths by default when actively reshaping the backend. Prefer the clean route contract and update local call sites/tests in the same change.

## Reference loading

Read only the references needed for the task.

- `elysia/controller-pattern.md`: app shell, route registry, controller factory, grouped route modules, and typed helper context.
- `elysia/plugin-pattern.md`: general plugin ownership, setup composition, capability boundaries, and helper extraction rules.
- `elysia/auth-macro.md`: preferred auth macro shape, simple schema guards, and route usage.
- `elysia/db-typebox.md`: current `drizzle-typebox` imports, insert/update/select schema derivation, overrides, refinements, validation, raw variants, and enriched responses.
- `elysia/elysiajs.md`: deeper framework API details only when repository patterns and the focused references do not answer the task.

## Hard rules

- DO NOT hide heavy domain work in generic setup plugins or `onRequest` hooks.
- DO NOT use global `onResponse` hooks for app-specific unwrapping or hidden client behavior when Eden's normal response/error contract or `throwHttpError: true` is the clearer boundary.
- DO NOT repeat auth header/cookie parsing inside route handlers.
- DO NOT document support that the implementation does not provide.
- DO NOT import auth/setup plugins directly in route modules. `createController(...)` owns setup wiring.
- DO NOT define capability internals inside `setup.ts`; setup composes complete plugins and does not own plugin behavior.
- DO NOT split tiny single-use capability logic into helper functions just to look layered. Keep simple checks inside the module that owns the capability.
- DO NOT make route construction depend on a hidden lifecycle step elsewhere in the app. A route file should be understandable from its imports and `createController(...)`.
- DO NOT thread static config, stores, clients, or broad dependency containers through app, controller, route registry, and feature-route factories just to make handlers compile.
- DO NOT put static process configuration into request context. Static configuration belongs in `env.ts`; request context is for request-derived state and stable capabilities.
- DO NOT hide development defaults in config helper functions. Put development values in `.env.local`, manifests, or test env setup.
- If an object is global and static, import it directly from its owner module. If it is request-derived, expose it through setup/macro context. If it is test-specific, override it at the module boundary rather than plumbing it through every route.

## Preferred shape

```text
src/
  main.ts
  env.ts
  setup.ts
  plugins/
  routes/
    index.ts
  schemas.ts
  db/
    schema.ts
```

Use different names if the repo already has strong conventions. Preserve local naming when it is coherent.

## Quality bar

A good Elysia change leaves the next route easy to copy:

- one import for controller creation
- URL-shaped route folders/files with `$param` names and a matching `.group(...)` at the top
- route files grouped enough to avoid opening many tiny tabs
- DB-shaped response schemas derived from Drizzle when that is already the endpoint contract
- large request/response resource schemas imported from a service-local schema/model file
- operation IDs on routes
- no hidden request-time side effects
- no duplicated auth boilerplate
- no plugin behavior hidden in `setup.ts`
- no single-use helper layers that obscure the capability owner
- no generic dependency forwarding through setup, controller, route index, and feature route factories
- no hidden setup activation step that a reader must discover elsewhere
- no static config in request context when `env.ts` can be imported directly
