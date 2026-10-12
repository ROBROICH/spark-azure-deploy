---
ruleId: backend/error-handling
---

# Backend error handling

Failures that callers must distinguish are `Result` values whose error is an
`EvlogError` from `defineErrorCatalog`. This is the pattern in
`@spark-workflow/authentification`, `@spark-workflow/http-host`, and the TypeScript apps.

## Catalog

One catalog per package or app:

```ts
export const projectErrors = defineErrorCatalog("project-logic", {
  INVALID_REQUEST: { status: 422, message: "Invalid project request", why: "...", fix: "..." },
});
```

Name the catalog after the package. Codes are stable, uppercase, and specific.
Override `message` at the call site when the catalog text is too generic. Pass
`cause` when wrapping. Do not add a second error type beside the catalog.

## Result

Public domain functions return `Result<T, EvlogError>`:

- `Result.ok(value)`
- `Result.err(catalog.CODE({ message, cause }))`
- several fallible steps: `Result.gen` with `yield*` / `Result.await`
- HTTP and process start: `if (result.isErr()) throw result.error`

Unknown async work uses `Result.try` / `Result.tryPromise`. Map non-catalog
failures in `catch`. Keep an existing EvlogError:

```ts
Result.tryPromise({
  try: () => work(),
  catch: (cause) =>
    EvlogError.isEvlogError(cause)
      ? cause
      : catalog.UNAVAILABLE({ cause: cause instanceof Error ? cause : undefined }),
});
```

Do not throw a nested `Result` to escape `tryPromise`. Yield it from `Result.gen`.
Identity `upgrade()` is the startup shape: `const done = await upgrade(); if (done.isErr()) throw done.error`.

For a repository-wide audit or a named vertical slice, apply this rule directly.

## HTTP

Handlers throw the EvlogError. `createHttpHost` maps it to `error.status` and
`{ detail: error.message }`. Do not rebuild that mapping in the app.

```ts
const result = await createProject(body);
if (result.isErr()) throw result.error;
return status(201, result.value);
```

## Do not

- Throw `TypeError`, `Error`, or a local `FooError` for a domain or library failure.
- Swallow a `Result` and return a success, empty catalog, or fallback path.
- Catch, log, and invent a second error object when the catalog error already exists.
- Use Result for process CLI usage strings (`usage: index.mjs [seed]` may stay `TypeError`).

## Tests

Follow [better-result testing](https://better-result.dev/guides/testing).

- Success that would be a broken invariant if it failed: `.unwrap()`.
- Expected failure: `expect(result.status).toBe("error")`, then assert the
  catalog error (`EvlogError.isEvlogError`, `message`, `status`).
- Do not `if (result.isErr()) throw result.error` or early-return from Ok in
  tests. That hides the discriminant and skips later assertions.

## Review

A throw of `Error`/`TypeError` from seed, load, validate, or a route helper is a
finding. A custom `class XError extends Error` next to a catalog is a finding.
An HTTP handler that returns `result.value` without checking `isErr()` is a finding.
A test that unwraps with `if (isErr()) throw` instead of `status` / `.unwrap()`
is a finding.
