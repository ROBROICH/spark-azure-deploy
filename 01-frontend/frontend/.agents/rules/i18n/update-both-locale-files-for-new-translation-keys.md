---
ruleId: i18n/update-both-locale-files-for-new-translation-keys
paths:
  - "src/**/*.tsx"
  - "src/features/**/*.json"
---

# Update Both Locale Files for New Translation Keys

- When adding or changing translation keys, update both language files in the same change.
- Keep the nested key structure aligned between the German and English locale files.
- Place locale files beside the owning feature as `de-<feature>.json` and
  `en-<feature>.json`, then register them in `src/i18n/resources.ts`.
- Treat `src/i18n/locales.test.ts` as the guardrail: new keys should not leave the locale trees out of sync.

## Bad Example

```tsx
// New UI text is added, but only one locale file is updated.
const { t } = useTranslation('ProjectsOverview');

return <Button>{t('toolbar.export')}</Button>;
```

## Good Example

```tsx
// src/features/main-page/list-screen/de-list-screen.json
{
  "toolbar": {
    "export": "Exportieren"
  }
}

// src/features/main-page/list-screen/en-list-screen.json
{
  "toolbar": {
    "export": "Export"
  }
}
```
