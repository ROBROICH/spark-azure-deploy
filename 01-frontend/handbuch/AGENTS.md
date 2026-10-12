# Handbuch frontend agent guide

Before direct planning or edits, read the frontend rule index in
[../frontend/.agents/CODE-STANDARDS.md](../frontend/.agents/CODE-STANDARDS.md) and select only rules supported
by this Waku, Fumadocs, and Base UI application. Skip rules with `paths` frontmatter; they belong to
`01-frontend/frontend`. Load TanStack, Radix, or nodes rules only when this application's own package or
source evidence establishes that technology.

Read [README.md](README.md), [package.json](package.json), and the existing
page or component before editing. Discover commands from `package.json`. Run
`pnpm types:check` and `pnpm build` before handoff when they apply. Preserve
Waku server/client boundaries and existing Fumadocs/Base UI conventions.
