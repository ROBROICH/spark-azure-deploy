import { describe, expect, it } from 'vitest';
import { parseEwmsFileReviewResult } from './ewmsFileReviewResult';

describe('parseEwmsFileReviewResult', () => {
  it('parses successful EWMS document ingestion results', () => {
    const result = parseEwmsFileReviewResult({
      successful: [
        {
          file_id: '971d7533-6ba7-4f3d-a5e3-3f92c2e693a9',
          filename: 'contains-invalid-files/ABC-S8689_8243804475-typed.pdf',
          action: 'INGEST',
        },
      ],
      failed: [],
      summary: {
        total: 1,
        succeeded: 1,
        failed: 0,
      },
      status: 'APPROVED',
    });

    expect(result.successful).toEqual([
      {
        file_id: '971d7533-6ba7-4f3d-a5e3-3f92c2e693a9',
        filename: 'contains-invalid-files/ABC-S8689_8243804475-typed.pdf',
        action: 'INGEST',
      },
    ]);
    expect(result.failed).toEqual([]);
    expect(result.summary?.succeeded).toBe(1);
  });

  it('accepts failed review entries without a file id', () => {
    const result = parseEwmsFileReviewResult({
      successful: [],
      failed: [
        {
          filename: 'contains-invalid-files/not-a-pdf.txt',
          reason: 'Unsupported file type',
        },
      ],
    });

    expect(result.failed).toEqual([
      {
        filename: 'contains-invalid-files/not-a-pdf.txt',
        reason: 'Unsupported file type',
      },
    ]);
  });

  it('rejects malformed workflow results', () => {
    expect(() =>
      parseEwmsFileReviewResult({
        successful: [{ filename: 'missing-file-id.pdf' }],
        failed: [],
      }),
    ).toThrow();
  });
});
