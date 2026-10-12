---
ruleId: nodes/references/node-ref-first-examples
---

# Node Ref-First Examples

## Bad Example

```tsx
const { getNodesByType } = useGraph();
const { data: dokumente } = useNodes(getNodesByType('dokument'));
const dokument = dokumente.find((currentDokument) => currentDokument.id === previewDocumentId);

return <PdfLane title={dokument?.filename ?? 'Kein Dokument'} />;
```

## Good Examples

Keep refs through owners and resolve payloads only where fields are needed.

```tsx
const topicRefs = getNodesByType('topic');

return <TopicGrid topicRefs={topicRefs} />;
```

When the code immediately needs all payloads of one concrete type, use the helper.

```tsx
const { data: topics } = useNodesByType('topic');

const filteredTopics = topics.filter((topic) =>
  topic.name.toLowerCase().includes(searchValue),
);
```

When you already know one concrete node id, stay narrow and use `useNode(...)`.

```tsx
const dokumentNodeRef = previewDocumentId
  ? { id: previewDocumentId, node_type: 'dokument' as const }
  : null;
const { data: dokument } = useNode(dokumentNodeRef);

return <PdfLane title={dokument?.filename ?? 'Kein Dokument'} />;
```

If a document row only needs a fundstellen badge, stay ref-first in that row.

```tsx
const fundstellenCount = useDescendants('fundstelle', dokument).length;

return fundstellenCount > 0 ? <Badge>{fundstellenCount}</Badge> : null;
```

If an unvirtualized file tree renders many document rows and each row would run
the same descendant traversal pattern, precompute the derived result once in the
owner and pass only the narrow boolean or map each leaf needs.

```tsx
const { data: topicFundstellen } = useDescendantNodes('fundstelle', topicRef);
const documentIdsWithFundstellen = new Set(
  topicFundstellen.map((fundstelle) => fundstelle.dokument_id),
);

return <TreeChildren documentIdsWithFundstellen={documentIdsWithFundstellen} />;
```

If the code only resolves descendant payloads and never uses the refs for anything else, collapse the two-hook pattern into the helper.

```tsx
const { data: chunks } = useDescendantNodes('chunk', {
  id: fundstelle.id,
  node_type: 'fundstelle',
});
```
