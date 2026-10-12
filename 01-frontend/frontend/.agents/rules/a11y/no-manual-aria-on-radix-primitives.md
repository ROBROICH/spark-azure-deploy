---
ruleId: a11y/no-manual-aria-on-radix-primitives
---

# Verify ARIA Issues at Runtime Before Flagging on Shadcn Components

- If you find missing ARIA attributes on a shadcn/Radix component, research what Radix injects at runtime for that specific component before flagging it. Radix injects ARIA via refs — the attributes are not visible in source code.
- Do not add ARIA attributes to shadcn/Radix components without confirming the attribute is genuinely missing. Adding on top of what Radix already provides can create duplicates or conflicts, which is worse for assistive technology than having none.
- This applies to all shadcn-generated components in `src/features/ui/` and any component that wraps or extends them.
