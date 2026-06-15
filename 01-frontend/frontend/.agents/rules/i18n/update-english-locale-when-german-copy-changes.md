# Update English Locale When German Copy Changes

- When changing wording in a German locale file, update the matching English locale entry in the same change, even if no translation key changes.
- Treat wording edits like schema edits for locale content: German and English values must stay intentionally aligned, not drift by accident.
- Use the same feature locale namespace and nested key path in both files so copy reviews can compare them directly.
- If the English wording is still undecided, leave an explicit placeholder such as `TODO` instead of silently keeping outdated English text.

## Bad Example

```tsx
// src/features/project/fvp/plausibility-check/de-plausibility-check.json
{
  "ContradictionsToolbar": {
    "rating": "Sensibilitätsfilter"
  }
}

// src/features/project/fvp/plausibility-check/en-plausibility-check.json
{
  "ContradictionsToolbar": {
    "rating": "Sensitivity"
  }
}
```

## Good Example

```tsx
// src/features/project/fvp/plausibility-check/de-plausibility-check.json
{
  "ContradictionsToolbar": {
    "rating": "Sensibilitätsfilter"
  }
}

// src/features/project/fvp/plausibility-check/en-plausibility-check.json
{
  "ContradictionsToolbar": {
    "rating": "Sensitivity filter"
  }
}
```
