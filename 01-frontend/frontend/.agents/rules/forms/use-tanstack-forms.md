---
ruleId: forms/use-tanstack-forms
---

# Use TanStack Forms

- Always use `@tanstack/react-form` for form handling
- Always create a Zod schema for validation
- Never use `useState` for form state management
- Form state belongs in the form, not in hooks or parent components

## Bad Example

```tsx
const [formData, setFormData] = useState({ name: '', email: '' });

const handleChange = (field: string, value: string) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
};

<input
  value={formData.name}
  onChange={(e) => handleChange('name', e.target.value)}
/>;
```

## Good Example

```tsx
// schema.ts
import * as z from 'zod';

export const formSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich.'),
  email: z.string().email('Ungültige E-Mail.'),
});

// Form.tsx
import { useForm } from '@tanstack/react-form';
import { formSchema } from './schema';

const form = useForm({
  defaultValues: { name: '', email: '' },
  validators: { onSubmit: formSchema },
  onSubmit: ({ value }) => console.log(value),
});

<form.Field
  name="name"
  children={(field) => (
    <input
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
    />
  )}
/>;
```
