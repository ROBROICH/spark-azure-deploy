# Regression Taxonomy

Use this file as the source of truth for what counts as a regression in a `dev...HEAD` review.

## Definition

A regression is a negative change in supported behavior or quality relative to `dev`.

To count as a regression, all of the following must be true:

1. The branch changes the relevant runtime code.
2. The behavior on `dev` is better, safer, more correct, or more stable.
3. The branch makes that behavior worse for users, operators, or downstream code.

If the same issue already exists on `dev`, it is not a regression from this branch.

## Confirmed Regression Categories

### Functional regressions

Behavior that previously worked on `dev` no longer works or now behaves incorrectly.

Examples:

- Buttons, forms, dialogs, or menus stop working
- A branch breaks selection, filtering, sorting, navigation, or saving
- New logic inserts content in the wrong place
- A refactor changes the visible result of an existing flow

### State and lifecycle regressions

The branch introduces broken synchronization, stale state, lost updates, or incorrect initialization.

Examples:

- State no longer updates after prop, route, or language changes
- Effects stop reacting to required dependencies
- Reinitialization wipes user edits that `dev` preserved
- A new async path races or duplicates updates

### Routing and URL-state regressions

Existing supported navigation or URL behavior gets worse.

Examples:

- Query params stop syncing
- Back/forward navigation breaks
- Route transitions drop state or misread params
- Existing deep links no longer restore the same screen state

### Data contract regressions

The branch becomes less compatible with existing backend responses, persisted state, or expected shapes.

Examples:

- Parsing now throws on values accepted on `dev`
- Existing optional fields are treated as required
- Mapping logic drops or renames fields incorrectly
- A patch/create payload omits data `dev` sent correctly

### Error-handling regressions

The branch makes failures less safe or less understandable than `dev`.

Examples:

- Errors are swallowed with no user feedback
- Existing fallback UI disappears
- A previously safe failure path now crashes
- Retry, reset, or recovery behavior gets worse

### Accessibility regressions

The branch makes an existing flow harder or impossible to use with assistive technology or keyboard input.

Examples:

- Accessible names are removed or become misleading
- Keyboard interaction stops working
- Language metadata becomes incorrect
- New labels or live text are hard-coded in the wrong language

### i18n regressions

The branch makes an existing localized experience worse than `dev`.

Examples:

- New runtime text is hard-coded instead of translated
- Locale changes break behavior or content placement
- Existing translated flows now mix languages
- Exported content stops matching the active locale

### Security regressions

The branch weakens an existing protection or increases exposure versus `dev`.

Examples:

- Sanitization is removed or bypassed
- Unsafe HTML or URLs are newly allowed
- Sensitive data is newly logged, stored, or rendered
- Access-control checks become UI-only

### Performance regressions

Only count these when the branch makes real runtime behavior noticeably worse versus `dev`.

Examples:

- New heavy recomputation on every keystroke
- Avoidable rerender loops
- More network requests than `dev`
- Large-list rendering without previous safeguards

### Compatibility regressions

The branch breaks existing supported content, documents, URLs, or persisted data that `dev` still handles.

Examples:

- Legacy editor content no longer loads correctly
- Old data shapes are no longer read
- Existing exports or imports stop working
- Backward-compatible fallback paths are removed

## What Is Not A Regression

- A bug already present on `dev`
- A code smell without changed runtime behavior
- Pure formatting, naming, extraction, or file moves
- Test-only failures when runtime behavior is unchanged
- A deliberate product change that does not break previous supported behavior

## Review Heuristics

For each suspected issue:

1. Show the branch-side behavior.
2. Show the `dev` baseline.
3. Explain why the branch is worse.

If you cannot prove step 2, do not report it as a confirmed regression.
