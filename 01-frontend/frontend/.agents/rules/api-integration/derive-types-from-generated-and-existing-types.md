# Derive Types from Generated and Existing Types

- Do not redefine API shapes manually when a generated type already exists.
- Prefer deriving narrower types with `Pick`, `Omit`, or `ComponentProps`.
- Reuse existing types before introducing new copies of the same shape.

## Bad Example

```tsx
type User = {
  id: string;
  name: string;
  email: string;
};
```

## Good Example

```tsx
import type { User } from '@/api-clients/types';

type UserSummary = Pick<User, 'id' | 'name'>;
```
