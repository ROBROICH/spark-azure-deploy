# SPARK Workflow Benutzerhandbuch

Eigenständige Fumapress-Anwendung für das SPARK Workflow Benutzerhandbuch. Die kanonischen Inhalte liegen unter [`../../docs/handbuch`](../../docs/handbuch/README.md); diese Anwendung enthält nur Darstellung, Suche und Build-Konfiguration.

## Voraussetzungen

- Node.js `>=24 <25`
- pnpm `10.30.2` über Corepack

## Entwicklung

```bash
corepack pnpm@10.30.2 install --frozen-lockfile
corepack pnpm@10.30.2 dev
```

Die Anwendung ist unter `http://localhost:3000/` erreichbar. Änderungen an den externen Markdown-Fragmenten in `docs/handbuch` werden im Entwicklungsserver übernommen.

## Prüfung und statischer Build

```bash
corepack pnpm@10.30.2 types:check
corepack pnpm@10.30.2 build
```

Der vollständig statische Output liegt in `dist/public`. Die App erzeugt genau eine Handbuch-Inhaltsseite unter `/`, eine statische Orama-Suche und keine Sitemap-, RSS-, LLM-, Analyse- oder Deployment-Artefakte.

## Basispfad

Der Basispfad wird zur Build-Zeit aus `HANDBUCH_BASE_PATH` gelesen (Standard `/`). Für eine Veröffentlichung unter einem Projektpfad wie `/<gruppe>/<projekt>/`, etwa über GitLab Pages, muss er diesem Pfad entsprechen, damit Links, Assets und Suche funktionieren. Lokal:

```bash
HANDBUCH_BASE_PATH=/pages-test/ corepack pnpm@10.30.2 build
```

## Container

Das Image wird aus dem Repository-Stamm gebaut, damit neben der Anwendung auch die kanonischen Inhalte unter `docs/handbuch` im Build-Kontext liegen:

```bash
docker build -f 01-frontend/handbuch/Dockerfile -t spark-handbuch .
docker run --rm -p 8080:80 spark-handbuch
```

Das Handbuch ist anschließend unter `http://localhost:8080/` erreichbar.

