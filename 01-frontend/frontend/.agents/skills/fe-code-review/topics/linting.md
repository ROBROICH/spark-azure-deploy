# Linting Review

You are a linting reviewer. Run the required commands first, then interpret remaining findings with `.agents/rules/clean-code/` and any domain rule folder that owns the warning.

## Reference Documents

Always start from lint/type-check output. Then load only the matching rule files:

- `comments-jsdoc-suppressions.md` for disables, `@ts-expect-error`, required JSDoc, comment/console residue, and stale suppressions.
- `async-performance.md` for `no-await-in-loop`, manual `useMemo`/`useCallback`, waterfalls, and hot input side effects.
- `control-flow-and-size.md` for braces, `max-depth`, oversized files/functions, repeated domain literals, and chained ternaries.
- `components-and-jsx.md` for nested components and JSX extraction.
- `state-effects-routing.md` for `useState`, `useEffect`, router/search, `<Link>`, and controllable-state warnings.
- `types-imports-exports.md` for namespace imports, declaration order, non-null assertions, barrels, and handwritten type shapes.

## Required Command Check

- Run `pnpm exec eslint` against the TypeScript files in scope before writing findings.
- Run `pnpm run type-check` for every linting slice.
- During review, do not run `eslint --fix` or Prettier. Review is read-only.
- For diff-based scopes, lint changed `ts` and `tsx` files only.
- For feature-folder scopes, lint the assigned path but keep findings limited to `ts` and `tsx` files.
- If the scoped file list is empty, record that and stop.

### Exact Scoped Commands

#### Feature-folder scope

```bash
FILES=($(rg --files <folder> -g '*.ts' -g '*.tsx'))
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

#### Branch diff / PR scope

```bash
FILES=($(git diff dev...HEAD --name-only -- '*.ts' '*.tsx'))
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

#### Local uncommitted scope

```bash
FILES=(
  $(git diff HEAD --name-only -- '*.ts' '*.tsx')
  $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')
)
pnpm exec eslint "${FILES[@]}"
pnpm run type-check
```

## Review Output Rules

- Do not enumerate every lint warning line by line.
- Summarize lint output into at most two buckets with these exact titles when applicable:
  - `Autofixable lint findings`
  - `Lint findings fixable with AI help`
- Include counts, dominant rule names, affected files/areas, and the owning clean-code/domain rule file.
- Type-check failures outside the reviewed scope should be recorded as unrelated unless a reviewed file causes them.

## Verification Approach

- Use tool output as the signal, then inspect source before reporting.
- Respect later matching ESLint overrides; for `no-restricted-syntax`, a later override replaces the earlier selector list.
- Context provider memoization can be legitimate with React Compiler. Stale suppressions are findings when overrides now allow the code.
- Only report findings that are in scope and realistically fixable or triageable.

## Severity Guide

- **critical**: Lint/type issues likely to cause runtime breakage or severe maintainability risk.
- **major**: Clear in-scope lint violations with meaningful repo impact.
- **minor**: Lower-risk cleanup or structural follow-up.
