# Project Swimlane Owners

Use when creating, moving, reviewing, or restructuring Project screens that
import from `src/features/ui/swimlanes`.

## Policy

Project workflows built with `Swimlanes` own each product lane in a named
`<thing>-swimlane/` folder under the screen or workspace that composes it.
`src/features/ui/swimlanes` is only the reusable layout primitive; domain
content, lane-local state adapters, hooks, tests, skeletons, and dialogs belong
to the named swimlane owner.
The screen or workspace keeps one `<owner>.swimlanes.tsx` file one path above
those swimlane folders for the `Swimlanes` root, group configuration, lane ids,
and cross-swimlane wiring.

This rule applies to Project route workflows such as `project/mvp`,
`project/rpb`, and `project/ewms`. It takes precedence over the generic
`<thing>-lane` naming in `feature-folder-templates.md`.

## Trigger

Audit a Project owner as swimlane-based when a file under it imports one of:

- `@/features/ui/swimlanes/Swimlanes`
- `@/features/ui/swimlanes/SwimlaneHeaderPortal`
- `@/features/ui/swimlanes/useSwimlanesGroupSearchState`
- `@/features/ui/swimlanes/swimlanes.search`
- another module under `@/features/ui/swimlanes`

Also audit route or layout code that marks a Project route as a swimlane route.

## Ownership Rules

- Keep the route or screen entrypoint thin: it may own route search,
  cross-swimlane providers, and delegation to `<owner>.swimlanes.tsx`.
- Put `<Swimlanes>`, `Swimlanes.Group`, `Swimlanes.Lane`, lane id constants,
  grouped-lane configuration, and `useSwimlanesGroupSearchState` usage in
  `<owner>.swimlanes.tsx` one path above the named swimlane folders.
- Put each user-visible lane's content in `<domain>-swimlane/`, named from the
  product workflow rather than the component implementation.
- Name the lane entry component `<PascalThing>Swimlane.tsx` inside that
  `<thing>-swimlane/` folder. Use `<PascalThing>SwimlaneSkeleton.tsx` for the
  lane-level fallback and `<PascalThing>Swimlane.test.tsx` for its colocated
  test.
- When a swimlane owns several distinct product capabilities, keep only the
  lane shell files at the swimlane root and wrap each capability in a child
  feature folder named for that capability. Examples: `participation/`,
  `ai-rating/`, `rechtsgrundlage/`, `documents/`, `risk-warnings/`.
- Keep lane-specific tests, skeletons, view-model helpers, and dialogs beside
  that swimlane owner.
- Put cross-capability helpers in the nearest `shared/` folder inside the
  swimlane only when at least two child feature folders reuse them.
- Keep feature-wide data, collections, mutations, and schemas in the nearest
  `data/` owner when multiple swimlanes use them.
- If a lane capability is reused by multiple Project workflows, promote the
  capability to the nearest named Project subfeature. The consuming screen may
  still keep a small `<domain>-swimlane/` adapter when it wires that capability
  into its own swimlane layout.
- Do not rename or move `src/features/ui/swimlanes`; it remains the UI library
  primitive and must not import Project code.

## Target Examples

For `src/features/project/mvp/topic-detail-screen/`, prefer named swimlane
owners such as:

```text
topic-detail-screen/
├── TopicDetailScreen.tsx
├── mvp.search.ts
├── topic-detail-screen.swimlanes.tsx
├── rechtsgrundlage-swimlane/RechtsgrundlageSwimlane.tsx
├── fundstellen-swimlane/FundstellenSwimlane.tsx
├── documents-swimlane/DocumentsSwimlane.tsx
├── pdf-view-swimlane/PdfViewSwimlane.tsx
└── screen-data/
```

For RPB, use named owners for the route's swimlane workflows, such as:

```text
rpb/
├── RpbPage.tsx
├── rpb.search.ts
├── rpb.swimlanes.tsx
├── outline-swimlane/OutlineSwimlane.tsx
├── beschluss-swimlane/BeschlussSwimlane.tsx
├── ai-assistance-swimlane/
│   ├── AiAssistanceSwimlane.tsx
│   ├── participation/
│   ├── ai-rating/
│   ├── rechtsgrundlage/
│   ├── documents/
│   └── shared/
├── pdf-view-swimlane/PdfViewSwimlane.tsx
└── workspace-state/
```

For EWMS workspaces, derive names from the actual product lanes, for example
`arguments-swimlane/`, `objections-swimlane/`, `topics-swimlane/`, or
`preview-swimlane/` when those lanes own distinct content.

## Review Findings

Report:

- Project files that import `src/features/ui/swimlanes` while lane-specific code
  remains in broad folders such as `screen-content/`, `main-screen/`, `workspace/`,
  `components/`, or `shared-ui/`
- swimlane content named with the old `<thing>-lane` convention in Project
  workflows where `Swimlanes` is used
- Project swimlane roots missing a sibling `<owner>.swimlanes.tsx` file one
  path above the named swimlane folders
- `<owner>.swimlanes.tsx` files that contain lane-local content instead of
  delegating to `<thing>-swimlane/` owners
- `<thing>-swimlane/` folders whose lane entrypoint is not named
  `<PascalThing>Swimlane.tsx`, or whose skeleton/test names do not match that
  entrypoint stem
- `<thing>-swimlane/` entrypoints that import lane-local modules from broad
  folders instead of colocating those modules under the swimlane owner
- large `<thing>-swimlane/` folders with many flat files for separate product
  capabilities instead of child feature folders and a small lane shell
- `shared/` folders inside a swimlane that contain helpers used by only one
  child feature folder
- lane-specific hooks, tests, skeletons, or dialogs separated from their
  `<thing>-swimlane/` owner
- `src/features/ui/swimlanes` importing Project, support-feature, data, route,
  or domain code
- proposed swimlane moves that would require behavior, route, API, translation,
  or product decisions; mark these `blocked` instead of fixing silently
