import type { DeadlineResponse } from '@/api-clients/backend';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeadlineReadRow } from './DeadlineReadRow';

const deadline = {
  id: 'deadline-1',
  projectId: 'project-1',
  deadlineType: 'Einwendungsfrist',
  legalBasis: null,
  startAt: '2026-04-10',
  endAt: '2026-05-11',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
} satisfies DeadlineResponse;

describe('DeadlineReadRow', () => {
  it('formats dates with the optional active locale', () => {
    render(
      <table>
        <tbody>
          <tr>
            <DeadlineReadRow deadline={deadline} locale="en-GB" />
          </tr>
        </tbody>
      </table>,
    );

    expect(screen.getByText('10/04/2026')).not.toBeNull();
    expect(screen.getByText('11/05/2026')).not.toBeNull();
  });
});
