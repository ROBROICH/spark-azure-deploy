import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFinalizedProcedureBlob } from './finalizeProcedureDownload';

describe('downloadFinalizedProcedureBlob', () => {
  const createObjectURLMock = vi.fn();
  const revokeObjectURLMock = vi.fn();
  const clickMock = vi.fn();
  let createdAnchor: HTMLAnchorElement | null = null;

  beforeEach(() => {
    createObjectURLMock.mockReturnValue('blob:download-url');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        tagName,
      ) as HTMLAnchorElement;

      if (tagName === 'a') {
        createdAnchor = element;
        element.click = clickMock;
      }

      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createObjectURLMock.mockReset();
    revokeObjectURLMock.mockReset();
    clickMock.mockReset();
    createdAnchor = null;
  });

  it('uses an encoded filename from content disposition', () => {
    const blob = new Blob(['pdf']);

    downloadFinalizedProcedureBlob(
      blob,
      "attachment; filename*=UTF-8''Beschluss%20final.pdf",
      'pdf',
    );

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(createdAnchor?.download).toBe('Beschluss final.pdf');
    expect(clickMock).toHaveBeenCalledOnce();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:download-url');
  });

  it('uses a quoted filename from content disposition', () => {
    downloadFinalizedProcedureBlob(
      new Blob(['docx']),
      'attachment; filename="final.docx"',
      'docx',
    );

    expect(createdAnchor?.download).toBe('final.docx');
  });

  it('falls back to the format filename when content disposition is missing', () => {
    downloadFinalizedProcedureBlob(new Blob(['docx']), null, 'docx');

    expect(createdAnchor?.download).toBe('beschluss.docx');
  });
});
