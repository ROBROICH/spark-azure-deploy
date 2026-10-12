---
name: elysiajs
description: Create backend with ElysiaJS, a type-safe, high-performance framework.
---

# ElysiaJS Development Skill

Always consult [elysiajs.com/llms.txt](https://elysiajs.com/llms.txt) for code examples and latest API.

## Overview

ElysiaJS is a TypeScript framework for building Bun-first (but not limited to Bun) type-safe, high-performance backend servers. This skill provides comprehensive guidance for developing with Elysia, including routing, validation, authentication, plugins, integrations, and deployment.

## When to Use This Skill

Trigger this skill when the user asks to:

- Create or modify ElysiaJS routes, handlers, or servers
- Setup validation with TypeBox or other schema libraries (Zod, Valibot)
- Implement authentication (JWT, session-based, macros, guards)
- Add plugins (CORS, OpenAPI, Static files, JWT)
- Integrate with external services (Drizzle ORM, Better Auth, Next.js, Eden Treaty)
- Setup WebSocket endpoints for real-time features
- Create unit tests for Elysia instances
- Deploy Elysia servers to production

## Quick Start

Quick scaffold:

```bash
bun create elysia app
```

### Basic Server

```typescript
import { Elysia, t, status } from "elysia";

const app = new Elysia()
  .get("/", () => "Hello World")
  .post("/user", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
      age: t.Number(),
    }),
  })
  .get(
    "/id/:id",
    ({ params: { id } }) => {
      if (id > 1_000_000) return status(404, "Not Found");

      return id;
    },
    {
      params: t.Object({
        id: t.Number({
          minimum: 1,
        }),
      }),
      response: {
        200: t.Number(),
        404: t.Literal("Not Found"),
      },
    },
  )
  .listen(3000);
```

## Basic Usage

### HTTP Methods

```typescript
import { Elysia } from "elysia";

new Elysia()
  .get("/", "GET")
  .post("/", "POST")
  .put("/", "PUT")
  .patch("/", "PATCH")
  .delete("/", "DELETE")
  .options("/", "OPTIONS")
  .head("/", "HEAD");
```

### Path Parameters

```typescript
.get('/user/:id', ({ params: { id } }) => id)
.get('/post/:id/:slug', ({ params }) => params)
```

### Query Parameters

```typescript
.get('/search', ({ query }) => query.q)
// GET /search?q=elysia → "elysia"
```

### Request Body

```typescript
.post('/user', ({ body }) => body)
```

### Headers

```typescript
.get('/', ({ headers }) => headers.authorization)
```

## TypeBox Validation

### Basic Types

```typescript
import { Elysia, t } from 'elysia'

.post('/user', ({ body }) => body, {
  body: t.Object({
    name: t.String(),
    age: t.Number(),
    email: t.String({ format: 'email' }),
    website: t.Optional(t.String({ format: 'uri' }))
  })
})
```

### Nested Objects

```typescript
body: t.Object({
  user: t.Object({
    name: t.String(),
    address: t.Object({
      street: t.String(),
      city: t.String(),
    }),
  }),
});
```

### Arrays

```typescript
body: t.Object({
  tags: t.Array(t.String()),
  users: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
    }),
  ),
});
```

### File Upload

```typescript
.post('/upload', ({ body }) => body.file, {
  body: t.Object({
    file: t.File({
      type: 'image',              // image/* mime types
      maxSize: '5m'               // 5 megabytes
    }),
    files: t.Files({              // Multiple files
      type: ['image/png', 'image/jpeg']
    })
  })
})
```

### Response Validation

```typescript
.get('/user/:id', ({ params: { id } }) => ({
  id,
  name: 'John',
  email: 'john@example.com'
}), {
  params: t.Object({
    id: t.Number()
  }),
  response: {
    200: t.Object({
      id: t.Number(),
      name: t.String(),
      email: t.String()
    }),
    404: t.String()
  }
})
```

## Standard Schema (Zod, Valibot, ArkType)

### Zod

```typescript
import { z } from 'zod'

.post('/user', ({ body }) => body, {
  body: z.object({
    name: z.string(),
    age: z.number().min(0),
    email: z.string().email()
  })
})
```

## Error Handling

```typescript
.get('/user/:id', ({ params: { id }, status }) => {
  const user = findUser(id)

  if (!user) {
    return status(404, 'User not found')
  }

  return user
})
```

## Guards (Apply to Multiple Routes)

```typescript
.guard({
  params: t.Object({
    id: t.Number()
  })
}, app => app
  .get('/user/:id', ({ params: { id } }) => id)
  .delete('/user/:id', ({ params: { id } }) => id)
)
```

## Macro

```typescript
.macro({
  hi: (word: string) => ({
    beforeHandle() { console.log(word) }
  })
})
.get('/', () => 'hi', { hi: 'Elysia' })
```

### Project Structure (Recommended)

Elysia takes an unopinionated approach but based on user request. But without any specific preference, we recommend a feature-based and domain driven folder structure where each feature has its own folder containing controllers, services, and models.

```
src/
├── index.ts              # Main server entry
├── modules/
│   ├── auth/
│   │   ├── index.ts      # Auth routes (Elysia instance)
│   │   ├── service.ts    # Business logic
│   │   └── model.ts      # TypeBox schemas/DTOs
│   └── user/
│       ├── index.ts
│       ├── service.ts
│       └── model.ts
└── plugins/
    └── custom.ts

public/                   # Static files (if using static plugin)
test/                     # Unit tests
```

Each file has its own responsibility as follows:

- **Controller (index.ts)**: Handle HTTP routing, request validation, and cookie.
- **Service (service.ts)**: Handle business logic, decoupled from Elysia controller if possible.
- **Model (model.ts)**: Define the data structure and validation for the request and response.

## Best Practice

Elysia is unopinionated on design pattern, but if not provided, we can relies on MVC pattern pair with feature based folder structure.

- Controller:
  - Prefers Elysia as a controller for HTTP dependant controller
  - For non HTTP dependent, prefers service instead unless explicitly asked
  - Use `onError` to handle local custom errors
  - Register Model to Elysia instance via `Elysia.models({ ...models })` and prefix model by namespace `Elysia.prefix('model', 'Namespace.')
  - Prefers Reference Model by name provided by Elysia instead of using an actual `Model.name`
- Service:
  - Prefers class (or abstract class if possible)
  - Prefers interface/type derive from `Model`
  - Return `status` (`import { status } from 'elysia'`) for error
  - Prefers `return Error` instead of `throw Error`
- Models:
  - Always export validation model and type of validation model
  - Custom Error should be in contains in Model

## Elysia Key Concept

Elysia has a every important concepts/rules to understand before use.

## Encapsulation - Isolates by Default

Lifecycles (hooks, middleware) **don't leak** between instances unless scoped.

**Scope levels:**

- `local` (default) - current instance + descendants
- `scoped` - parent + current + descendants
- `global` - all instances

```ts
.onBeforeHandle(() => {}) // only local instance
.onBeforeHandle({ as: 'global' }, () => {}) // exports to all
```

## Method Chaining - Required for Types

**Must chain**. Each method returns new type reference.

❌ Don't:

```ts
const app = new Elysia();
app.state("build", 1); // loses type
app.get("/", ({ store }) => store.build); // build doesn't exists
```

✅ Do:

```ts
new Elysia().state("build", 1).get("/", ({ store }) => store.build);
```

## Explicit Dependencies

Each instance independent. **Declare what you use.**

```ts
const auth = new Elysia().decorate("Auth", Auth).model(Auth.models);

new Elysia().get("/", ({ Auth }) => Auth.getProfile()); // Auth doesn't exists

new Elysia()
  .use(auth) // must declare
  .get("/", ({ Auth }) => Auth.getProfile());
```

**Global scope when:**

- No types added (cors, helmet)
- Global lifecycle (logging, tracing)

**Explicit when:**

- Adds types (state, models)
- Business logic (auth, db)

## Deduplication

Plugins re-execute unless named:

```ts
new Elysia(); // rerun on `.use`
new Elysia({ name: "ip" }); // runs once across all instances
```

## Order Matters

Events apply to routes **registered after** them.

```ts
.onBeforeHandle(() => console.log('1'))
.get('/', () => 'hi') // has hook
.onBeforeHandle(() => console.log('2')) // doesn't affect '/'
```

## Type Inference

**Inline functions only** for accurate types.

For controllers, destructure in inline wrapper:

```ts
.post('/', ({ body }) => Controller.greet(body), {
  body: t.Object({ name: t.String() })
})
```

Get type from schema:

```ts
type MyType = typeof MyType.static;
```

## Reference Model

Model can be reference by name, especially great for documenting an API

```ts
new Elysia()
  .model({
    book: t.Object({
      name: t.String(),
    }),
  })
  .post("/", ({ body }) => body.name, {
    body: "book",
  });
```

Model can be renamed by using `.prefix` / `.suffix`

```ts
new Elysia()
  .model({
    book: t.Object({
      name: t.String(),
    }),
  })
  .prefix("model", "Namespace")
  .post("/", ({ body }) => body.name, {
    body: "Namespace.Book",
  });
```

Once `prefix`, model name will be capitalized by default.

## Bundled References

Use only the focused references bundled beside this file:

- [controller-pattern.md](controller-pattern.md) for route modules and controller composition;
- [plugin-pattern.md](plugin-pattern.md) for capability and setup plugins;
- [auth-macro.md](auth-macro.md) for authentication macros;
- [db-typebox.md](db-typebox.md) for Drizzle-derived TypeBox contracts.

For framework behavior not covered here, use the installed Elysia version's
official documentation rather than assuming an unbundled local document exists.
