---
ruleId: api-integration/handle-request-errors-with-user-visible-feedback
---

# Handle Request Errors with User-Visible Feedback

Request failures that only end up in logs or the console leave users stuck, hide recovery options, and make frontend behavior look unreliable.

- Do not rely on `console.error` or silent catches for failed queries, mutations, and route loaders.
- Show a consistent error state, toast, inline message, or route-level fallback that tells the user what happened.
- Provide a retry or recovery path when the action can be attempted again safely.
- Keep error handling close to the request boundary and reuse shared fallback patterns for repeated cases.

## Bad Example

```tsx
const saveRequest = async () => {
  try {
    await mutation.mutateAsync(payload);
  } catch (error) {
    console.error(error);
  }
};
```

## Good Example

```tsx
const saveRequest = async () => {
  try {
    await mutation.mutateAsync(payload);
    toast.success(t('request.save.success'));
  } catch {
    toast.error(t('request.save.error'));
  }
};

if (query.isError) {
  return <ErrorState onRetry={() => query.refetch()} />;
}
```
