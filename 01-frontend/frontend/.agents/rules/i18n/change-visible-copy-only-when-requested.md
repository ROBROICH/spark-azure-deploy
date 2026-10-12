---
ruleId: i18n/change-visible-copy-only-when-requested
paths:
  - "src/**/*.tsx"
  - "src/features/**/*.json"
---

# Change Visible Copy Only When Requested

- Treat user-visible frontend copy as product behavior, not as incidental code shape.
- During refactors, file moves, component extractions, route changes, i18n namespace renames, or key renames, preserve existing displayed strings unless the user explicitly requested a wording change.
- Technical keys, enum names, folder names, or namespace names may move to code-facing English, but locale values and JSX text shown to users must stay intentionally unchanged.
- If a visible copy change is required to preserve correctness, call it out in the summary or review finding and update the matching German and English locale entries together.
- In regression reviews, flag branch-only visible copy drift in cleanup or rename work as a user-facing regression.

## Bad Example

```diff
-  "Fristen": {
-    "title": "Fristen und Termine",
-    "emptyState": "Keine Fristen vorhanden."
+  "Deadlines": {
+    "title": "Deadlines und Termine",
+    "emptyState": "Keine Deadlines vorhanden."
   }
```

The key rename may be technical cleanup, but the German UI copy changed without a product request.

## Good Example

```diff
-  "Fristen": {
+  "Deadlines": {
     "title": "Fristen und Termine",
     "emptyState": "Keine Fristen vorhanden."
   }
```

The code-facing key changes, while the user-facing German copy stays stable.
