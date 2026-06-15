import { describe, expect, it } from 'vitest';
import {
  estimateDurationFromFileSize,
  getRedactedFilename,
} from './schwaerzungsagentUtils';

describe('Schwaerzungsagent utilities', () => {
  it('creates the download filename from the original pdf filename', () => {
    expect(
      getRedactedFilename({
        filename: 'scan.pdf',
        redactedFilenameSuffix: '_geschwärzt',
      }),
    ).toBe('scan_geschwärzt.pdf');
    expect(
      getRedactedFilename({
        filename: 'scan.PDF',
        redactedFilenameSuffix: '_redacted',
      }),
    ).toBe('scan_redacted.pdf');
    expect(
      getRedactedFilename({
        filename: 'scan',
        redactedFilenameSuffix: '_redacted',
      }),
    ).toBe('scan_redacted.pdf');
  });

  it('estimates five minutes per twenty mebibytes', () => {
    const twentyMebibytes = 20 * 1024 * 1024;

    expect(estimateDurationFromFileSize(0)).toBe(300_000);
    expect(estimateDurationFromFileSize(twentyMebibytes)).toBe(300_000);
    expect(estimateDurationFromFileSize(twentyMebibytes + 1)).toBe(600_000);
  });
});
