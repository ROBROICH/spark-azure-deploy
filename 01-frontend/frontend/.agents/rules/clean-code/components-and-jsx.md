---
ruleId: clean-code/components-and-jsx
---

# Components and JSX

Use when code changes React components, JSX structure, component files, render helpers, or navigation-owning UI.

## Rules

- Keep each component responsible for one coherent piece of UI behavior. Move complex computations and branching to module-scope helpers or file-based children.
- When a component renders multiple coherent UI regions, extract those sections into child component files. Keep orchestration, routing, and request wiring in the parent; move presentation-heavy regions out. If extraction would split workflow ownership, fix ownership first.
- Name extracted component files after the single component they export. Avoid grab-bag files such as `Parts`, `Helpers`, or generic component collections unless the pieces are explicitly named as one cohesive unit.
- Do not define component functions inside another component's render path, hook, or callback. Move nested components to module scope; if they become more than tiny render helpers, give them their own file.
- Do not create a dedicated component whose only job is wrapping one child in `Suspense` with a fixed fallback. Inline the boundary unless the component owns shared fallback selection, error coordination, or multi-child composition.
- When a feature-specific card, list item, or action primarily navigates, build
  the selected application's framework-native link or an anchor in that
  component. Use TanStack Router `<Link>` only when package and source evidence
  confirm TanStack Router. Pass destination data, not ready-made `linkSlot`,
  `renderLink`, or navigation elements, unless the component is genuinely
  shared across navigation models.
- Do not destructure component props in the function parameter. Accept one `props` object and destructure inside the body when needed.
- Model closely related UI modes as an explicit union value such as `selectedStep`, then derive titles, labels, switcher state, and optional translation params from mappings/helpers. Avoid parallel booleans or "prop exists vs missing" branching.
- Prefer the `children` prop pattern over render functions or element factories when a wrapper only owns layout/composition.

## Report When

Report giant JSX returns, nested component definitions, fixed Suspense wrapper components, vague component file names, over-broad mode props, prop-parameter destructuring, or navigation UI whose link semantics are owned by the wrong layer.

## Human Triage Suggestion

Suggest the smallest structural move: extract one named child file, move the nested component to module scope, inline the Suspense wrapper, replace booleans with one variant union, or let the feature item own its `<Link>`.
