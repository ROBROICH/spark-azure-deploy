import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { SupplementaryRequestLetter } from './SupplementaryRequestLetter';

const includedItem: RequestItem = {
  id: 'item-1',
  projectId: 'project-1',
  priority: 'must',
  title: 'Missing floor plan',
  reason: 'Please provide the floor plan.',
  createdAt: new Date('2026-03-12T12:00:00.000Z'),
  includedInLetter: true,
};

let liveQueryItems: RequestItem[] = [includedItem];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'de', resolvedLanguage: 'de-DE' },
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: liveQueryItems,
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock('@tiptap/react', () => {
  const editor = {
    options: {
      editorProps: {
        attributes: {} as Record<string, string>,
      },
    },
    isActive: () => false,
    chain: () => ({
      toggleHeading: () => ({ run: vi.fn() }),
      setParagraph: () => ({ run: vi.fn() }),
      toggleBold: () => ({ run: vi.fn() }),
      toggleItalic: () => ({ run: vi.fn() }),
      toggleUnderline: () => ({ run: vi.fn() }),
      toggleBulletList: () => ({ run: vi.fn() }),
      toggleOrderedList: () => ({ run: vi.fn() }),
    }),
    commands: { setContent: vi.fn() },
    state: { doc: { content: { size: 0 }, descendants: vi.fn() } },
  };

  return {
    Node: { create: () => ({}) },
    useEditor: (options: {
      editorProps?: { attributes?: Record<string, string> };
    }) => {
      editor.options.editorProps.attributes =
        options.editorProps?.attributes ?? {};
      return editor;
    },
    useEditorState: () => ({}),
    EditorContent: (props: { editor: typeof editor; className?: string }) => {
      const attributes = props.editor.options.editorProps.attributes;
      return <div {...attributes} className={attributes.class} />;
    },
  };
});

vi.mock('../export/exportPdf', () => ({ exportPdf: vi.fn() }));
vi.mock('../export/exportDocx', () => ({ exportDocx: vi.fn() }));
vi.mock('../export/letterHtml', () => ({
  syncEditorContent: () => ({
    newIds: new Set<string>(),
    wasInitialized: true,
  }),
}));

vi.mock('@/features/ui/swimlanes/SwimlaneHeaderPortal', () => ({
  SwimlaneHeaderPortal: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

afterEach(() => {
  liveQueryItems = [includedItem];
  cleanup();
});

describe('SupplementaryRequestLetter accessibility', () => {
  it('exposes the toolbar separators as vertically oriented separators', () => {
    render(<SupplementaryRequestLetter />);

    const separators = screen.getAllByRole('separator');
    for (const separator of separators) {
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    }
  });
});
