import { describe, expect, it } from 'vitest';
import { createCommentFormSchema } from './commentFormSchema';

const messages = {
  titleRequired: 'title-required',
  titleMaxLength: 'title-max',
  contentRequired: 'content-required',
  contentMaxLength: 'content-max',
  processStepRequired: 'process-step-required',
};

const schema = createCommentFormSchema(messages);

describe('createCommentFormSchema', () => {
  it('rejects a whitespace-only title with the required message', () => {
    const result = schema.safeParse({
      processStep: 'unsorted',
      title: '   ',
      content: 'Some content',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const titleIssue = result.error.issues.find((issue) =>
        issue.path.includes('title'),
      );
      expect(titleIssue?.message).toBe('title-required');
    }
  });

  it('rejects whitespace-only content with the required message', () => {
    const result = schema.safeParse({
      processStep: 'unsorted',
      title: 'A title',
      content: '   ',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const contentIssue = result.error.issues.find((issue) =>
        issue.path.includes('content'),
      );
      expect(contentIssue?.message).toBe('content-required');
    }
  });

  it('accepts a title and content with surrounding whitespace and trims them', () => {
    const result = schema.safeParse({
      processStep: 'unsorted',
      title: '  Real title  ',
      content: '  Real content  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Real title');
      expect(result.data.content).toBe('Real content');
    }
  });
});
