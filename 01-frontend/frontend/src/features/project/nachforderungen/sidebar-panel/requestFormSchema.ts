import * as z from 'zod';
import type { TFunction } from 'i18next';

const REQUEST_TEXT_MAX_LENGTH = 2000;

export const createRequestFormSchema = (
  t: TFunction<'SupplementaryRequests'>,
) =>
  z.object({
    priority: z.enum(['must', 'should']),
    title: z
      .string()
      .trim()
      .min(1, t('RequestListPanel.form.validation.titleRequired'))
      .max(
        REQUEST_TEXT_MAX_LENGTH,
        t('RequestListPanel.form.validation.titleMaxLength', {
          max: REQUEST_TEXT_MAX_LENGTH,
        }),
      ),
    reason: z
      .string()
      .trim()
      .min(1, t('RequestListPanel.form.validation.reasonRequired'))
      .max(
        REQUEST_TEXT_MAX_LENGTH,
        t('RequestListPanel.form.validation.reasonMaxLength', {
          max: REQUEST_TEXT_MAX_LENGTH,
        }),
      ),
  });
