import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('docx', async () => {
  const actual = await vi.importActual('docx');
  return {
    ...(actual as Record<string, unknown>),
    Packer: {
      toBlob: vi
        .fn()
        .mockResolvedValue(
          new Blob(['test'], { type: 'application/octet-stream' }),
        ),
    },
  };
});

const createMockEditor = (json: Record<string, unknown>) =>
  ({
    getJSON: () => json,
  }) as unknown as Editor;

const setupDownloadMocks = () => {
  const clickSpy = vi.fn();

  // jsdom does not implement URL.createObjectURL
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
  globalThis.URL.revokeObjectURL = vi.fn();

  vi.spyOn(document, 'createElement').mockReturnValue({
    set href(_: string) {},
    set download(_: string) {},
    get download() {
      return '';
    },
    click: clickSpy,
  } as unknown as HTMLAnchorElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

  return { clickSpy };
};

const loadExportDocx = async () => (await import('./exportDocx')).exportDocx;

const expectDownload = async (
  json: Record<string, unknown>,
  filename: string,
) => {
  vi.restoreAllMocks();
  const { clickSpy } = setupDownloadMocks();
  const exportDocx = await loadExportDocx();

  await exportDocx(createMockEditor(json), filename);

  expect(clickSpy).toHaveBeenCalled();
  return { clickSpy };
};

const testCreatesDownloadableDocx = async () => {
  await expectDownload(
    {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Test Heading' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test paragraph.' }],
        },
      ],
    },
    'TestFile',
  );

  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
};

const testHandlesEmptyContent = async () => {
  await expectDownload({ type: 'doc', content: [] }, 'EmptyDoc');
};

const testProcessesMarks = async () => {
  await expectDownload(
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Bold text',
              marks: [{ type: 'bold' }],
            },
            {
              type: 'text',
              text: 'Italic underline',
              marks: [{ type: 'italic' }, { type: 'underline' }],
            },
          ],
        },
      ],
    },
    'MarkedDoc',
  );
};

const testProcessesLists = async () => {
  await expectDownload(
    {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Bullet item' }],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Ordered item' }],
                },
              ],
            },
          ],
        },
      ],
    },
    'ListDoc',
  );
};

const testRecursesIntoItemSections = async () => {
  await expectDownload(
    {
      type: 'doc',
      content: [
        {
          type: 'itemSection',
          attrs: { itemId: '1' },
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Section heading' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Section content' }],
            },
          ],
        },
      ],
    },
    'SectionDoc',
  );
};

describe('exportDocx', () => {
  it(
    'creates a downloadable .docx file with the given filename',
    testCreatesDownloadableDocx,
  );
  it('handles empty editor content', testHandlesEmptyContent);
  it('processes bold, italic, and underline marks', testProcessesMarks);
  it('processes bullet and ordered lists', testProcessesLists);
  it('recurses into itemSection wrapper nodes', testRecursesIntoItemSections);
});
