# Derive Node Types from Hooks and `NodePayloadByType`

- When wiring UI to the nodes API, prefer the actual types returned by `useNode(...)` and `useNodes(...)`.
- Use `NodePayloadByType<'...'>` when a prop, callback, or helper truly needs an explicit node payload type.
- Do not keep old mock types, hand-written mirror types, or feature-local copies of node payload shapes once a feature is backed by nodes.
- Do not retype a `useNodes(...)` result into another manual object type just to make the compiler happy.
- If the payload already has the right shape, use that shape directly.

## Why

- Manual copies drift fast and become wrong as the nodes API evolves.
- The hook return types already encode the real payload shape plus the ref fields.
- Using the real node types prevents unnecessary mapping layers and duplicate maintenance.

## Bad Example

```tsx
type TopicsOverviewScreenCard = {
  id: string;
  name: string;
  description: string | null;
};

const cards: TopicsOverviewScreenCard[] = topics.map((topic) => ({
  id: topic.id,
  name: topic.name,
  description: topic.description,
}));
```

## Good Example

```tsx
const { data: topics } = useNodes(topicRefs);

const filteredTopics = topics.filter((topic) =>
  topic.name.toLowerCase().includes(searchValue),
);
```

```tsx
type FindingsCardProps = {
  fundstelle: NodePayloadByType<'fundstelle'>;
};
```

If a prop needs an explicit type, use `NodePayloadByType<'topic'>`, `NodePayloadByType<'dokument'>`, or the matching node payload type instead of inventing a new mirror type.
