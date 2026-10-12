import { z } from 'zod';

export type CatalogNameFormValues = {
  name: string;
};

export const createCatalogNameSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().trim().min(1, t('catalog.form.nameRequired')),
  });
