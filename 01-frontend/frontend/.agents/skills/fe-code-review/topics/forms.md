# Forms Review

You are a forms reviewer. Focus exclusively on rules from `.agents/rules/forms/`.

## Reference Documents

Read these before reviewing:

- Read the forms rule files that match the changed form flow:
  - `use-tanstack-forms.md`
  - `co-locate-form-schemas-with-feature-forms.md`

## What to Look For

- Real feature forms managed with `useState` or ad hoc handlers instead of TanStack Form
- Missing Zod validation at the form boundary
- Form schemas defined far away from the feature form without a real reuse case
- Validation logic duplicated inline instead of importing the local schema

## Verification Approach

- Read the form component and its nearby schema file together
- Review actual feature forms, not simple one-off inputs that are not acting as forms
- Tie findings back to the rules in `.agents/rules/forms/`

## Severity Guide

- **critical**: Broken form validation or submission behavior caused by unsupported form-state patterns
- **major**: TanStack Form skipped for real forms, missing schemas, or schema co-location drift
- **minor**: Cleanup or consistency improvements for form setup
