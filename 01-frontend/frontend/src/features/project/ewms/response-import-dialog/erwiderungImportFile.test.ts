import { describe, expect, it } from 'vitest';
import {
  IMPORT_FILE_ACCEPT,
  isErwiderungImportFile,
} from './erwiderungImportFile';

describe('isErwiderungImportFile', () => {
  it('allows only CSV files for response imports', () => {
    expect(
      isErwiderungImportFile(
        new File(['csv'], 'erwiderungen.csv', { type: 'text/csv' }),
      ),
    ).toBe(true);
    expect(
      isErwiderungImportFile(
        new File(['csv'], 'erwiderungen.CSV', { type: 'text/csv' }),
      ),
    ).toBe(true);

    expect(
      isErwiderungImportFile(
        new File(['excel'], 'erwiderungen.xls', {
          type: 'application/vnd.ms-excel',
        }),
      ),
    ).toBe(false);
    expect(
      isErwiderungImportFile(
        new File(['excel'], 'erwiderungen.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    ).toBe(false);
  });
});

describe('IMPORT_FILE_ACCEPT', () => {
  it('limits the file picker to CSV files', () => {
    expect(IMPORT_FILE_ACCEPT).toBe('.csv');
  });
});
