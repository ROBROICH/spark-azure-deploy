# Prefer TanStack DB Collections for Server-Backed State

- Default to TanStack DB collections for feature data that behaves like app state, not just a one-off request.
- Use collections when the UI needs live updates, local mutation workflows, derived views, or repeated access to the same entity set.
- Keep the collection logic close to the feature or integration layer, not scattered across components.
- Treat plain `useQuery` as the exception path, not the default.

## Bad Example

```tsx
const usersQuery = useQuery({
  queryKey: ['users'],
  queryFn: () => usersClient.getUsers(),
});
```

## Good Example

```tsx
const usersCollection = createCollection({
  queryKey: ['users'],
  queryFn: () => usersClient.getUsers(),
});
```
