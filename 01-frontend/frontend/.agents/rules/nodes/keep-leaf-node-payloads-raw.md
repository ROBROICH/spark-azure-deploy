# Keep Leaf Node Payloads Raw

- For actual renderable node items such as `topic`, `dokument`, or `fundstelle`, pass the raw node payload object to the leaf component instead of decomposing it into temporary scalar props.
- Access node fields directly in JSX when they are only used once or twice. Do not create local alias variables like `const title = fundstelle.jurabk` just to pass or render them immediately.
- Synthetic UI container types are allowed when the UI needs extra structure that does not exist in the graph, such as folder nodes in a file tree.
- When a synthetic UI container type exists, keep the real data leaves as the original node payload type inside that structure.

## Why

- It keeps the UI close to the real data contract.
- It avoids drift between mapped view models and the live node payload.
- It makes later refactors easier because the leaf still receives the real payload object.

## Bad Example

```tsx
<FindingsCard
  title={fundstelle.jurabk}
  reference={fundstelle.paragraph}
  snippetText={fundstelle.paragraph}
/>
```

## Good Example

```tsx
<FindingsCard fundstelle={fundstelle} />
```

Inside the leaf component, read `fundstelle.jurabk` and `fundstelle.paragraph` directly where they are rendered.
