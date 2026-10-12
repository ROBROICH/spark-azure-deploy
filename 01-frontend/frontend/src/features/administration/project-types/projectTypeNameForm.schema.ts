import { z } from 'zod';

export type ProjectTypeNameFormValues = {
  name: string;
};

export const createProjectTypeNameSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().trim().min(1, t('projectTypes.form.nameRequired')),
  });
