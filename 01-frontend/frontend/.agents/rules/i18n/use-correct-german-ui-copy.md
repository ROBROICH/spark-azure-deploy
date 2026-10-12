---
ruleId: i18n/use-correct-german-ui-copy
paths:
  - "src/**/*.tsx"
  - "src/features/**/*.json"
---

# Use Correct German UI Copy

- In German UI text, use German typography and punctuation: `„…“` instead of `"..."`, and end complete status or empty-state sentences with a period.
- Render German dates in `TT.MM.JJJJ` format with a `führende Null` for day and month when needed, including calendar labels and selected date ranges.
- Prefer established German product terminology in German copy and avoid leftover English terms such as `Topic` when `Thema` is intended.
- Keep German compounds, hyphenation, and separators consistent with the approved product wording, for example `Materiell-rechtlich`, `UVP-Bericht`, and `Gesetze / Normen`.

## Bad Example

```tsx
const calendarLabel = '03.25.2026 - 08.25.2026';
const emptyState = 'Keine Fristen oder Termine für diesen Tag';

return (
  <>
    <Button>Als "gelöst" markieren</Button>
    <p>{emptyState}</p>
    <span>Keine Gesetze/Normen für dieses Topic im Baum gefunden.</span>
    <span>{calendarLabel}</span>
  </>
);
```

## Good Example

```tsx
const calendarLabel = '12.03.2026 - 17.03.2026';
const emptyState = 'Keine Fristen oder Termine für diesen Tag.';

return (
  <>
    <Button>Als „gelöst“ markieren</Button>
    <p>{emptyState}</p>
    <span>Keine Gesetze / Normen für dieses Thema im Baum gefunden.</span>
    <span>{calendarLabel}</span>
  </>
);
```
