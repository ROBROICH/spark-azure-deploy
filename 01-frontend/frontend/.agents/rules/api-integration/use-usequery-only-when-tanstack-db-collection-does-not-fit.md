---
ruleId: api-integration/use-usequery-only-when-tanstack-db-collection-does-not-fit
---

# Use useQuery Only When a TanStack DB Collection Does Not Fit

- Do not fetch data with `useEffect` and `fetch`.
- Default to TanStack DB collections for server-backed entity state and live-updating feature data.
- Use `useQuery` only when collection semantics add no value, such as one-shot reads, non-entity data, or simple bootstrap requests.
- When you choose `useQuery` directly, still use generated clients from `src/api-clients/` and keep the query logic in a focused feature hook.

## Bad Example

```tsx
const [users, setUsers] = useState<User[]>([]);

useEffect(() => {
  fetch('/api/users')
    .then((response) => response.json())
    .then(setUsers);
}, []);
```

## Good Example

```tsx
const releaseNotesQuery = useQuery({
  queryKey: ['release-notes'],
  queryFn: () => docsClient.getReleaseNotes(),
});
```
