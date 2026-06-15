import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { BeschlussEditor } from './BeschlussEditor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: (props: { id: string }) => (
    <div id={props.id} data-testid="editor-content" />
  ),
  useEditor: () => null,
  useEditorState: () => null,
}));

const makeSection = (
  outlineNodeId: string,
  title: string,
  text: string,
): BeschlussSection => ({
  depth: 0,
  index: 0,
  isEditable: true,
  order: 0,
  parentVaeNodeId: null,
  text,
  title,
  vaeNodeId: outlineNodeId,
});

afterEach(cleanup);

describe('BeschlussEditor null editor state', () => {
  it('keeps the editor chrome stable until TipTap creates an editor instance', () => {
    render(
      <BeschlussEditor
        canExport={true}
        sections={[makeSection('node-a', 'A. Tenor', 'Alpha paragraph')]}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={vi.fn()}
        onExportClick={vi.fn()}
        onTextBlur={vi.fn()}
      />,
    );

    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'beschluss.toolbar.boldAria' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'beschluss.toolbar.underlineAria' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'beschluss.toolbar.italicAria' }),
    ).toBeDisabled();
  });
});
