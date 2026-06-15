---
name: fe-codebase-structure
description: |
  Analyze and safely normalize the frontend codebase folder structure, including root `src/` layout and `src/features` templates. Use when the user asks to restructure, standardize, audit, rerun, or fix codebase structure, feature folders, source folders, screen/lane folders, support features, ui-library structure, special file naming, or branch-only structure regressions. Runs analysis first with an ASCII target/move preview, then fixes only when explicitly requested.
---

# Frontend Codebase Structure

Use this skill to converge the frontend codebase toward the repo's folder-structure rules without changing production behavior.

## Read First

- `.agents/CODE-STANDARDS.md`
- `.agents/rules/codebase-structure/root-source-layout.md`
- `.agents/rules/codebase-structure/feature-folder-templates.md`
- `.agents/rules/codebase-structure/project-swimlane-owners.md`
- `.agents/rules/codebase-structure/special-file-names.md`
- `.agents/rules/codebase-structure/shared-boundary-promotion.md`
- `.agents/rules/clean-code/abstraction-and-boundaries.md`
- `.agents/rules/clean-code/types-imports-exports.md`

Treat `.agents/rules/codebase-structure/` as the source of truth for root `src/` layout, feature target shape, Project swimlane ownership, shared-boundary promotion, and special file names.

## Non-Negotiable Rules

- Always run the analysis stage before fixing.
- Do not edit files during analysis.
- Stop after analysis unless the user explicitly asks for fixing.
- Always load the full target structure rules, even when reviewing only a branch diff.
- Fixing may move files, rename folders, update imports, move colocated tests, and extract narrow shared helpers.
- Do not alter production behavior, route paths, API contracts, generated files, translations, or `src/db/nodes` architecture.
- Do not create barrel files.
- Do not move code into `shared/` unless at least two real owners use it.
- Do not use broad `components/`, `hooks/`, `utils/`, or `types/` buckets as the target for product-feature code when a screen, lane, or capability name exists.
- Do not create `index.ts`, `index.tsx`, `page.tsx`, or broad `Content.tsx`
  entrypoints for feature-owned page, screen, or swimlane owners.
- For Project screens that use `src/features/ui/swimlanes`, prefer named
  `<thing>-swimlane/` owners for lane-specific code.
- Keep Project `<Swimlanes>` root composition in `<owner>.swimlanes.tsx`, one
  path above the named `<thing>-swimlane/` folders.

## Naming Language Policy

Default feature, component, hook, helper, folder, and translation-key names to
English. Keep German only when the term is on this protected vocabulary list or
when a generated/backend contract forces it:

- `Beschluss`
- `Nachforderung`, `Nachforderungen`
- `Rechtsgrundlage`
- `Rechtsmethodik`
- `Normtext`
- `Satz`, `Saetze`, `Sätze`
- `Absatz`, `Absaetze`, `Absätze`
- `Tatbestand`, `Tatbestandsmerkmale`
- `Rechtsfolge`
- `Verweise`
- `Schwaerzungsagent`, `Schwärzungsagent`

Known migrations:

- `Barrierefreiheit` -> `Accessibility`
- `Verfahren` -> `Project` for code names; do not change route paths or backend
  contracts without explicit product approval.
- `Fristen` -> `Deadlines`
- `Unterlagen` -> `Documents`
- `Vorhabensstammdaten` -> `ProjectMasterData`
- `KI`, `Ki`, `ki` -> `AI`, `Ai`, `ai`
- `Hinweiskarten` -> `NoticeCards`
- `Dokumenten` / `Dokumente` -> `Document` / `Documents`
- `Thema` -> `Topic`
- `Inhaltsverzeichnis` -> `TableOfContents`

During analysis, report German code names outside the protected vocabulary as
future migration candidates, grouped by owner and suggested English name.

## Analysis Scopes

Choose the scope from the user's request:

- `full cleanup`: analyze the whole codebase folder structure and propose the complete convergence worklist.
- `branch regression`: compare the branch or local changes against `dev` or `HEAD`, then report only structure problems made worse by that scope.
- `specific path`: analyze the requested folder, plus enough surrounding structure and imports to judge it against the full target.

If the user does not specify a scope, default to `full cleanup` for restructure requests and `branch regression` for "what got worse on this branch" requests.

Branch-regression mode still reads and applies the full target structure. It limits findings and fixes to changed files, moved files, new folders, or import edges introduced or worsened by the branch.

## Parallel Analysis

Use subagents or Codex multi-agents for analysis when the scope contains multiple large, independent folders. If no parallel worker path is available, continue serially and say `serial-downgrade` in the analysis output.

The coordinator owns:

- reading all codebase-structure rules
- choosing scope
- building the top-level folder inventory
- assigning worker slices
- merging worker reports into one target preview and worklist
- deciding whether a proposal is `safe move`, `dependency cut`, or `blocked`

Create one worker per large folder or boundary cluster when possible:

- root/platform slice: `src/routes`, `src/db`, `src/integrations`
- app-wide shared slice: `src/features/shared`
- UI-library slice: `src/features/ui`
- one slice per large product/support feature such as `project`, `main-page`, `access-control`, or `workflow-runtime`
- one slice per large nested feature such as `project/mvp`, `project/rpb`, `project/ewms`, or `project/fvp`

Do not spawn workers for tiny folders unless they are part of a branch-regression scope. Keep tiny folders in the coordinator pass.

Each worker must read only the relevant codebase-structure rules and inspect its assigned folder plus direct imports/callers. Workers do not edit files. Workers must report:

```text
Slice: <path>
Current role: product-feature | support-feature | ui-library | root-platform | shared-cluster | outlier
Observed owners:
├── ...
Boundary candidates:
├── <classification>: <proposed-owner> <= <current-paths>
Import risks:
├── ...
Move candidates:
├── safe move: ...
├── dependency cut: ...
└── blocked: ...
Branch-regression notes:
├── worsened by scope: ...
└── pre-existing target gap: ...
```

The coordinator must preserve disagreements between workers and resolve them explicitly in the final analysis. If two workers propose different owners for the same cluster, mark it `blocked` unless existing imports and domain names clearly pick one owner.

## Stage 1: Analysis

1. Inspect the root `src/` folder, allowed root folders, migration buckets, routes, and generated boundaries.
2. Decide whether to run parallel analysis and assign slices before detailed folder review.
3. Inspect `src/features` and classify each immediate child as:
   - `product-feature`
   - `support-feature`
   - `ui-library`
   - `outlier`
4. Build import graphs for:
   - root platform dependency direction
   - cross-feature imports
   - `shared/` and `ui` dependencies
5. Audit feature-owned locale JSON files:
   - `src/i18n/locales/**` must be absent; locale JSON belongs beside the owning feature or subfeature.
   - Feature locale files use `de-<owner>.json` and `en-<owner>.json`, where `<owner>` is the owning `kebab-case` folder or namespace.
   - German and English files must be paired in the same directory with the same suffix.
   - Each locale pair must be imported and registered in `src/i18n/resources.ts`.
   - `src/i18n/resources.ts` imports must point to existing feature-owned locale JSON files, not old central locale folders.
6. Classify direct children of `shared/` folders as `true-shared`, `support-feature`, `product-subfeature`, `data-capability`, `route-shell`, or `misplaced-ui`.
7. Audit Project swimlane usage:
   - find imports from `@/features/ui/swimlanes` and `src/features/ui/swimlanes`
     under `src/features/project`
   - treat `project/mvp`, `project/rpb`, and `project/ewms` swimlane workflows
     as candidates for named `<thing>-swimlane/` owners
   - derive candidate names from lane ids, visible lane titles, folder names,
     and domain vocabulary, not from implementation component names
   - check for a sibling `<owner>.swimlanes.tsx` file one path above the named
     swimlane folders to own the `Swimlanes` root, lane/group configuration,
     lane ids, and cross-swimlane wiring
   - check that each `<thing>-swimlane/` owner has a
     `<PascalThing>Swimlane.tsx` entrypoint, with matching skeleton/test stems
     when present
   - for every `<thing>-swimlane/` entrypoint, follow same-feature relative
     imports into broad folders such as `main-screen/`, `screen-content/`,
     `workspace/`, `components/`, and `shared-ui/`; classify those imported
     modules as single-swimlane, multi-swimlane shared/data, route-owned, or
     blocked
   - report single-swimlane modules left in broad folders as move candidates to
     that `<thing>-swimlane/` owner, including colocated tests, skeletons,
     stories, and helpers
   - keep screen entrypoints and route search at the screen owner when they
     coordinate multiple swimlanes
8. Audit feature-owned page, screen, and swimlane entrypoint file names:
   - route-backed feature owners use `<PascalOwner>Page.tsx`
   - `<thing>-screen/` owners use `<PascalThing>Screen.tsx`
   - Project swimlane roots use `<owner>.swimlanes.tsx`
   - `<thing>-swimlane/` owners use `<PascalThing>Swimlane.tsx`
   - `index.ts`, `index.tsx`, `page.tsx`, and broad `Content.tsx` entrypoints
     under `src/features` are reported
   - TanStack Router declarations under `src/routes` are not reported for
     router-required names such as `index.tsx`
9. Merge worker reports when parallel analysis ran.
10. Identify violations of:
   - root `src/` folder ownership
   - feature template classification
   - feature-owned page, screen, and swimlane entrypoint naming
   - Project swimlane screens that lack named `<thing>-swimlane/` owners
   - Project swimlane roots that are not isolated in `<owner>.swimlanes.tsx`
   - Project swimlane lane entries not named `<PascalThing>Swimlane.tsx`
   - Project swimlane entrypoints importing lane-local modules from broad
     folders instead of colocated `<thing>-swimlane/` owners
   - shared clusters that should be promoted to named owners
   - special file suffix meaning
   - locale JSON placement, pairing, naming, and registry completeness
   - misplaced `shared/`
   - `ui` importing product/support features
   - feature-to-feature imports that should become shared data/capability helpers
11. For branch-regression mode, separate:
   - `worsened by scope`
   - `pre-existing target gap`
12. Produce an ASCII target and move preview grouped by root folder, feature, screen owner, swimlane owner, entrypoint rename, and promoted boundary.
13. Mark every proposed move:
   - `safe move`: file/folder move plus import updates only
   - `dependency cut`: helper extraction or ownership move needed to avoid circular imports
   - `blocked`: would require behavior or product decisions

### Analysis Output Shape

Use this compact shape:

```text
Scope: full cleanup | branch regression | specific path
Analysis mode: parallel | serial-downgrade

Root source classification
├── platform: api-clients, db, i18n, integrations, routes, test
├── feature tree: features
├── static/dev: assets, scripts
└── removed migration buckets: hooks, utils

Feature classification
├── product-feature: ...
├── support-feature: ...
├── ui-library: ui
└── outlier: ...

Locale file checks
├── misplaced central locale files: ...
├── invalid locale names: ...
├── missing de/en pairs: ...
└── resources.ts registry gaps: ...

Project swimlane checks
├── uses src/features/ui/swimlanes: project/mvp/topic-detail-screen, project/rpb, project/ewms/...
├── missing swimlanes root files: ...
├── missing named swimlane owners: ...
├── invalid swimlane entrypoint names: ...
└── already named swimlane owners: ...

Entrypoint naming checks
├── invalid route page entries: ...
├── invalid screen entries: ...
├── invalid feature entries: ...
└── invalid swimlane entries: ...

Shared boundary candidates
├── support-feature: workflow-runtime <= workflow status, system load, progress
├── route-shell: project-route <= project/route/*, project/route-navbar/*
├── data-capability: project-files <= project/data/document-tree/*, project/data/document-file-tree/*
└── true-shared: ...

Move preview
src/features/
├── main-page/
│   ├── dashboard-screen/ <= main-page/MainPage.tsx, main-page/calendar-widget/*
│   ├── list-screen/     <= main-page/list-screen/*, main-page/list-screen/projects-table/*
│   └── data/            <= MainPage/data/*
└── project/
    ├── overview-screen/ <= overview-screen/*
    └── mvp/
        ├── overview-screen/
        └── topic-detail-screen/
            ├── topic-detail-screen.swimlanes.tsx <= Swimlanes root and lane wiring
            ├── rechtsgrundlage-swimlane/ <= Rechtsgrundlage lane files
            ├── fundstellen-swimlane/     <= Fundstellen lane files
            └── documents-swimlane/       <= Documents lane files

Worklist
├── worsened by scope: ...   # branch-regression mode only
├── pre-existing target gap: ...
├── safe move: ...
├── dependency cut: ...
└── blocked: ...
```

## Stage 2: Fixing

Start only after the user asks to fix or implement the analysis worklist.

1. Re-read the analysis worklist and confirm the selected scope.
2. In branch-regression mode, fix only `worsened by scope` items unless the user explicitly expands scope.
3. Apply `safe move` items first.
4. Apply `dependency cut` items only when the extraction is narrow and behavior-preserving:
   - pure helper used by multiple real callers
   - shared type/schema/data helper moved to the nearest neutral owner
   - shared capability promoted to a named support feature or product subfeature
   - import cycle cut without changing runtime logic
5. For Project swimlane fixes, move lane-specific files to named
   `<thing>-swimlane/` folders, extract the `Swimlanes` root into
   `<owner>.swimlanes.tsx` one path above them, and keep route/search/provider
   code at the owning screen unless it is lane/group wiring.
6. Rename entrypoints to the role-specific schema without changing exports:
   `<PascalOwner>Page.tsx`, `<PascalThing>Screen.tsx`,
   `<owner>.swimlanes.tsx`, or `<PascalThing>Swimlane.tsx`.
7. Keep tests colocated with the moved owner and align test/skeleton stems with
   renamed entrypoints.
8. Rewrite direct imports to the new paths.
9. Leave `blocked` items unchanged and report why.

## Verification

For any fixing run:

- Re-run the structure analysis for the changed scope.
- Run scoped ESLint on changed TypeScript files.
- Run `pnpm run type-check`.
- Run relevant Vitest files for moved or extracted modules.
- Run `pnpm check` before handoff when changes are broad or route-affecting.

Final output must include:

- moved folders/files
- dependency cuts performed
- blocked items left untouched
- verification commands and results
