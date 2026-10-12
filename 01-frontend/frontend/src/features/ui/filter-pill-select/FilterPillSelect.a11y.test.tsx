import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterPillSelect } from './FilterPillSelect';

// Regression guard (BITV 9.4.1.2 / WCAG 4.1.2):
// sort/filter controls must NOT expose role="combobox" (announced as an editable
// input), and must expose the non-editable menu-button relationship instead.
// These assertions run against the real ActionMenu/Radix primitives, not a mock.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe('FilterPillSelect — a11y role (menu, not combobox)', () => {
  const options = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ] as const;

  it('does not expose the trigger as a combobox', () => {
    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={undefined}
        fallbackLabel="Sort"
        onValueChange={() => {}}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('exposes the trigger as a collapsed menu button', () => {
    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={undefined}
        fallbackLabel="Sort"
        onValueChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Sort/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
