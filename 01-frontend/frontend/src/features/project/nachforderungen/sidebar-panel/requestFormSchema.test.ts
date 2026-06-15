import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { createRequestFormSchema } from './requestFormSchema';

// Identity translator: the schema only needs the key string back to assert on.
const t = ((key: string) =>
  key) as unknown as TFunction<'SupplementaryRequests'>;

const schema = createRequestFormSchema(t);

describe('createRequestFormSchema', () => {
  it('rejects a whitespace-only title with the required message', () => {
    const result = schema.safeParse({
      priority: 'must',
      title: '   ',
      reason: 'A valid reason',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const titleIssue = result.error.issues.find((issue) =>
        issue.path.includes('title'),
      );
      expect(titleIssue?.message).toBe(
        'RequestListPanel.form.validation.titleRequired',
      );
    }
  });

  it('rejects a whitespace-only reason with the required message', () => {
    const result = schema.safeParse({
      priority: 'must',
      title: 'A valid title',
      reason: '   ',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const reasonIssue = result.error.issues.find((issue) =>
        issue.path.includes('reason'),
      );
      expect(reasonIssue?.message).toBe(
        'RequestListPanel.form.validation.reasonRequired',
      );
    }
  });

  it('accepts and trims title and reason with surrounding whitespace', () => {
    const result = schema.safeParse({
      priority: 'should',
      title: '  Real title  ',
      reason: '  Real reason  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Real title');
      expect(result.data.reason).toBe('Real reason');
    }
  });
});
