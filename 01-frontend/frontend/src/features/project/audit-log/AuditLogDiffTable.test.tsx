import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryItem } from '@/api-clients/backend';
import { AuditLogDiffTable } from './AuditLogDiffTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

afterEach(cleanup);

const makeVaeNodeUpdate = (
  oldRow: HistoryItem['oldRow'],
  newRow: HistoryItem['newRow'],
): HistoryItem => ({
  timestamp: '2026-10-21T10:00:00Z',
  entityType: 'vae_node',
  entityId: 'vae-1',
  service: 'administrative_draft',
  serviceLabel: 'VAE',
  changeType: 'update',
  source: 'user',
  actorUserId: null,
  triggeredByUserId: null,
  workflowRunId: null,
  workflowType: null,
  actionType: null,
  requestId: null,
  oldRow,
  newRow,
  groupCount: 1,
});

describe('AuditLogDiffTable', () => {
  it('shows a formatted-content change as one labelled row without JSON', () => {
    render(
      <AuditLogDiffTable
        item={makeVaeNodeUpdate(
          {
            content: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Alt' }] },
              ],
            },
          },
          {
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', marks: [{ type: 'bold' }], text: 'Neu' },
                  ],
                },
              ],
            },
          },
        )}
      />,
    );

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(
      screen.getByRole('rowheader', { name: 'diff.formattedContentField' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('diff.formattedContentChanged'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Neu|Alt|paragraph/)).not.toBeInTheDocument();
  });
});
