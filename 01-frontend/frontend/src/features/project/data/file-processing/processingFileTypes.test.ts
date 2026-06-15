import type { ZipFileResponse } from '@/api-clients/dms-module';
import { describe, expect, it } from 'vitest';
import { filterProcessingFilesByType } from './processingFileTypes';

const makeZipFile = (
  id: string,
  type: ZipFileResponse['type'],
): ZipFileResponse => ({
  id,
  type,
  filename: `${id}.zip`,
  bucketPath: `${type}/${id}.zip`,
  projectId: 'project-1',
  workflowStatus: 'RUNNING',
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:00.000Z',
});

describe('filterProcessingFilesByType', () => {
  it('keeps regular project ZIP processing separate from EWMS ZIP processing', () => {
    const files = [
      makeZipFile('project-upload', 'zip'),
      makeZipFile('ewms-upload', 'ewms_zip'),
    ];

    expect(
      filterProcessingFilesByType(files, ['zip']).map((file) => file.id),
    ).toEqual(['project-upload']);
    expect(
      filterProcessingFilesByType(files, ['ewms_zip']).map((file) => file.id),
    ).toEqual(['ewms-upload']);
  });
});
