import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
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

// The toolbar/editor render path under test does not depend on which exact items
// are returned, only that at least one item is included so the editor mounts.
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

vi.mock('@tanstack/react-db', () => ({
  eq: vi.fn(),
  useLiveQuery: () => ({ data: liveQueryItems }),
}));

vi.mock(
  '@/features/project/nachforderungen/data/collections/requestItems.collection',
  () => ({
    requestItemsCollection: {},
  }),
);

// Render the editor's real editable region from the configured editorProps so
// the test asserts the accessible name and focus styling land on that node,
// not on the EditorContent wrapper.
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
  it('labels the real editable region and gives it a visible focus ring', () => {
    render(<SupplementaryRequestLetter />);

    // The toolbar shares the same accessible name, so isolate the editable
    // region (it carries the editor body styling, not the toolbar role).
    const labelled = screen.getAllByLabelText(
      'SupplementaryRequestLetter.title',
    );
    const editable = labelled.find(
      (element) => element.getAttribute('role') !== 'toolbar',
    );
    expect(editable).toBeDefined();
    expect(editable).toHaveClass('focus-ring');
    // The removed focus:outline-none must not silently reappear.
    expect(editable?.className).not.toContain('focus:outline-none');
  });

  it('exposes the toolbar separators as vertically oriented separators', () => {
    render(<SupplementaryRequestLetter />);

    const separators = screen.getAllByRole('separator');
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators) {
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    }
  });

  it('exposes the active formatting state on each toolbar button', () => {
    render(<SupplementaryRequestLetter />);

    const toolbar = screen.getByRole('toolbar');
    const boldButton = within(toolbar).getByLabelText(
      'SupplementaryRequestLetter.toolbar.bold',
    );
    expect(boldButton).toHaveAttribute('aria-pressed', 'false');
  });
});
