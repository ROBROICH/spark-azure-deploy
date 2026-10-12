# Feature documentation

This Hub groups product documentation by stable product feature. The configured
`featureDocumentationPath` points to this directory.

Each direct child uses a lowercase kebab-case product slug and this layout:

```text
<product-slug>/
├── feature.yaml
├── userstory.md
└── feature-brief/
```

`feature.yaml` owns the feature identity. It contains `schemaVersion`, the slug
as `id`, a German `title`, and one or more `openSpecCapabilities`.

`userstory.md` contains the detailed German user story. The optional
`feature-brief/` directory contains a compact overview, as many interaction
cards as the feature needs, and complete requirement/scenario traceability.
There is no global length or card limit.

User-story authoring uses only other exact `userstory.md` files as style
evidence. It never uses this README, Feature Briefs, or other Markdown files.

## Feature Hubs

- [Deployment-spezifische Verfahrenskonfiguration](./deployment-configuration/)
- [Formale Vollständigkeitsprüfung und Plausibilitätsprüfung](./formal-completeness-review/)
- [Rechtliche Prüfung und Bewertung mit Beschlusserstellung](./legal-review-and-decision-drafting/)
- [Themenübersicht und themenbezogene materielle Vollständigkeitsprüfung](./material-completeness-review/)
- [Behörden- und Öffentlichkeitsbeteiligung und Einwendungsmanagement](./participation-and-objection-management/)
