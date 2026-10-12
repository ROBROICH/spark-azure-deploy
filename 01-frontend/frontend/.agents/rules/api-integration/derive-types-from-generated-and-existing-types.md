---
ruleId: api-integration/derive-types-from-generated-and-existing-types
---

# Derive Types from Generated and Existing Types

- When the selected application uses generated API types, change the owning
  contract and run the generation command discovered from its package metadata
  or nearest guide.
- Do not add or edit handwritten wire types when that application's generator
  can produce them.
- Import from its existing generated client boundary and derive narrower types
  with `Pick`, `Omit`, or `ComponentProps`.
- Reuse existing domain types before introducing a new copy of the same shape.
- Do not patch files owned by the selected application's generator.
- Handwritten API or DTO types are allowed only as a recorded exception: the
  backend contract is not ready, and the frontend must proceed against a mock or
  provisional contract. Record the exception, the mock, and the reconciliation
  task. Replace the handwritten type with generated types as soon as OpenAPI
  exists.
- UI-only props and local view-model picks are not wire types. Derive them from
  generated types when the shape comes from the backend.

## Bad Example

```tsx
type User = {
  id: string;
  name: string;
  email: string;
};
```

## Good Example

```tsx
type UserSummary = Pick<ApiUser, 'id' | 'name'>;
```

## Report When

Report a **major** finding when a change adds or edits a handwritten API,
request, response, or DTO type, or patches the selected application's generated
client output, unless the recorded mock exception above is present.
