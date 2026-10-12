import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamMembersTable } from './TeamMembersTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe('TeamMembersTable', () => {
  // Reflow (#207): the horizontally scrollable table must stay reachable for
  // keyboard and assistive-tech users, i.e. a labelled, focusable region.
  // Queried by role + accessible name (not class names) so the test pins the
  // a11y contract without coupling to markup.
  it('exposes the scrollable table as a labelled, focusable region', () => {
    render(
      <TeamMembersTable
        canMutateProject={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        teamMembers={[]}
        topics={[]}
      />,
    );

    const region = screen.getByRole('region', { name: 'Team.tableAriaLabel' });

    expect(region.getAttribute('tabindex')).toBe('0');
  });
});
