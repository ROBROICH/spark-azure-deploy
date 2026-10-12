import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CellContext } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createActionColumn } from './columns.interactive';
import type { ColumnCallbacks, RowNode } from './columns.shared';

const createCallbacks = (): ColumnCallbacks => ({
  availableDocumentTypesStructured: [],
  canMutateProject: true,
  onAddComment: vi.fn(),
  onFileClick: vi.fn(),
  onManageCustomDocumentTypes: vi.fn(),
  onRequestDocument: vi.fn(),
  onSelectDocumentType: vi.fn(),
  t: ((key: string, options?: { name?: string }) => {
    if (key === 'redesign.documentsCard.actions.ariaLabel') {
      return `Aktionen fuer ${options?.name ?? ''}`;
    }

    if (key === 'common.actions.request') {
      return 'Nachfordern';
    }

    if (key === 'common.actions.addComment') {
      return 'Kommentar hinzufügen';
    }

    return key;
  }) as ColumnCallbacks['t'],
});

const createCellContext = (): CellContext<RowNode, unknown> =>
  ({
    row: {
      original: {
        filename: 'U01_Erlaeuterungsbericht.pdf',
        id: 'document-1',
        kind: 'document',
        status: 'Zugeordnet',
      },
    },
  }) as CellContext<RowNode, unknown>;

describe('createActionColumn', () => {
  it('restores request and comment row actions for documents', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const actionColumn = createActionColumn(callbacks);
    const renderCell = actionColumn.cell as (
      context: CellContext<RowNode, unknown>,
    ) => ReactNode;

    render(<>{renderCell(createCellContext())}</>);

    const trigger = screen.getByRole('button', {
      name: 'Aktionen fuer U01_Erlaeuterungsbericht.pdf',
    });

    await user.click(trigger);
    await user.click(await screen.findByText('Nachfordern'));

    expect(callbacks.onRequestDocument).toHaveBeenCalledWith(
      'U01_Erlaeuterungsbericht.pdf',
      'document-1',
      undefined,
    );

    await user.click(trigger);
    await user.click(await screen.findByText('Kommentar hinzufügen'));

    expect(callbacks.onAddComment).toHaveBeenCalledWith(
      'U01_Erlaeuterungsbericht.pdf',
    );
  });
});
