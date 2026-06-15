# Co-Locate Form Schemas with Feature Forms

- Keep the Zod schema next to the form that uses it inside the feature folder.
- Prefer dedicated schema files such as `schema.ts`, `requestFormSchema.ts`, or `commentFormSchema.ts` over shared catch-all validation modules.
- Let the TanStack Form setup import the local schema instead of redefining validation inline across multiple files.
- Only extract a form schema into shared code when multiple real feature forms use the same contract.

## Bad Example

```tsx
// src/features/shared/forms/schemas.ts
export const requestFormSchema = z.object({
  title: z.string().min(1),
});

// src/features/project/nachforderungen/sidebar-panel/RequestForm.tsx
import { requestFormSchema } from '@/features/shared/forms/schemas';
```

## Good Example

```tsx
// src/features/project/nachforderungen/sidebar-panel/requestFormSchema.ts
export const requestFormSchema = z.object({
  title: z.string().min(1),
});

// src/features/project/nachforderungen/sidebar-panel/RequestForm.tsx
import { requestFormSchema } from './requestFormSchema';
```
