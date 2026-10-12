import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LawNormPicker } from './LawNormPicker';
import type { LawPickerGroup } from './legalBasisPicker.model';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => {
      if (key === 'selectedCount') {
        return `${String(params?.count ?? 0)} selected`;
      }
      if (key === 'groupCheckboxSelectHint') {
        return `select ${String(params?.count ?? 0)}`;
      }
      if (key === 'groupCheckboxDeselectHint') {
        return `clear ${String(params?.count ?? 0)}`;
      }
      return key;
    },
  }),
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  Accordion: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionItem: (props: { children: React.ReactNode; value: string }) => (
    <div data-value={props.value}>{props.children}</div>
  ),
  AccordionTrigger: (props: { children: React.ReactNode }) => (
    <button type="button">{props.children}</button>
  ),
  AccordionContent: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionChevron: () => <span />,
}));

afterEach(() => {
  cleanup();
});

const groups: LawPickerGroup[] = [
  {
    id: 'law-bnatschg',
    label: 'BNatSchG',
    isComplete: true,
    isLoadingComplete: false,
    norms: [
      { id: 'bnatschg-44', label: '§ 44 Title 44' },
      { id: 'bnatschg-45', label: '§ 45 Title 45' },
    ],
  },
];

describe('LawNormPicker', () => {
  it('supports selected, clear, and indeterminate parent states', async () => {
    const user = userEvent.setup();
    const onToggleNorm = vi.fn();
    const onToggleGroup = vi.fn();
    const selectedIds = new Set(['bnatschg-44']);

    const { rerender } = render(
      <LawNormPicker
        groups={groups}
        selectedIds={selectedIds}
        status="ready"
        onToggleNorm={onToggleNorm}
        onToggleGroup={onToggleGroup}
      />,
    );

    const parent = screen.getByRole('checkbox', { name: 'BNatSchG' });
    expect(parent.getAttribute('data-state')).toBe('indeterminate');

    rerender(
      <LawNormPicker
        groups={groups}
        selectedIds={new Set(['bnatschg-44', 'bnatschg-45'])}
        status="ready"
        onToggleNorm={onToggleNorm}
        onToggleGroup={onToggleGroup}
      />,
    );
    expect(
      screen
        .getByRole('checkbox', { name: 'BNatSchG' })
        .getAttribute('data-state'),
    ).toBe('checked');

    await user.click(screen.getByRole('checkbox', { name: '§ 44 Title 44' }));
    expect(onToggleNorm).toHaveBeenCalledWith('bnatschg-44');
  });

  it('does not treat an incomplete paginated law as fully selected', () => {
    const [bnatschg] = groups;
    if (!bnatschg) {
      throw new Error('Expected a BNatSchG group fixture');
    }
    render(
      <LawNormPicker
        groups={[
          {
            ...bnatschg,
            isComplete: false,
            norms: [{ id: 'bnatschg-44', label: '§ 44 Title 44' }],
          },
        ]}
        selectedIds={new Set(['bnatschg-44'])}
        status="ready"
        onToggleNorm={vi.fn()}
        onToggleGroup={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('checkbox', { name: 'BNatSchG' })
        .getAttribute('data-state'),
    ).toBe('indeterminate');
  });

  it('disables the parent action while the complete law is loading', () => {
    const [bnatschg] = groups;
    if (!bnatschg) {
      throw new Error('Expected a BNatSchG group fixture');
    }
    render(
      <LawNormPicker
        groups={[{ ...bnatschg, isLoadingComplete: true }]}
        selectedIds={new Set()}
        status="ready"
        onToggleNorm={vi.fn()}
        onToggleGroup={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('checkbox', { name: 'BNatSchG' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows unavailable persisted refs as clear-only copy without free-text fields', async () => {
    const user = userEvent.setup();
    const onToggleNorm = vi.fn();
    const unavailableGroups: LawPickerGroup[] = [
      {
        id: 'unavailable:OldG',
        label: 'OldG',
        isComplete: true,
        isLoadingComplete: false,
        norms: [
          {
            id: 'oldg-1',
            label: '§ 1 Abs. 2',
            unavailable: true,
          },
        ],
      },
    ];
    const { rerender } = render(
      <LawNormPicker
        groups={unavailableGroups}
        selectedIds={new Set(['oldg-1'])}
        status="ready"
        onToggleNorm={onToggleNorm}
        onToggleGroup={vi.fn()}
      />,
    );

    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    const leaf = screen.getByRole('checkbox', { name: '§ 1 Abs. 2' });
    expect(leaf).toBeEnabled();
    await user.click(leaf);
    expect(onToggleNorm).toHaveBeenCalledOnce();

    rerender(
      <LawNormPicker
        groups={unavailableGroups}
        selectedIds={new Set()}
        status="ready"
        onToggleNorm={onToggleNorm}
        onToggleGroup={vi.fn()}
      />,
    );
    const clearedLeaf = screen.getByRole('checkbox', { name: '§ 1 Abs. 2' });
    expect(clearedLeaf).toBeDisabled();
    await user.click(clearedLeaf);
    expect(onToggleNorm).toHaveBeenCalledOnce();
  });

  it('announces and performs the parent clear action when all selectable refs are selected', async () => {
    const user = userEvent.setup();
    const onToggleGroup = vi.fn();
    render(
      <LawNormPicker
        groups={[
          {
            id: 'mixed-law',
            label: 'MixedG',
            isComplete: true,
            isLoadingComplete: false,
            norms: [
              { id: 'available', label: '§ 1' },
              { id: 'unavailable', label: '§ 2', unavailable: true },
            ],
          },
        ]}
        selectedIds={new Set(['available'])}
        status="ready"
        onToggleNorm={vi.fn()}
        onToggleGroup={onToggleGroup}
      />,
    );

    const parent = screen.getByRole('checkbox', { name: 'MixedG' });
    expect(parent).toHaveAttribute('data-state', 'checked');
    expect(parent).toHaveAccessibleDescription('1 selected clear 1');
    await user.click(parent);
    expect(onToggleGroup).toHaveBeenCalledWith('mixed-law');
  });

  it('renders loading, empty, and error with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <LawNormPicker
        groups={[]}
        selectedIds={new Set()}
        status="loading"
        onToggleNorm={vi.fn()}
        onToggleGroup={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: 'loading' })).toBeInTheDocument();

    rerender(
      <LawNormPicker
        groups={[]}
        selectedIds={new Set()}
        status="empty"
        onToggleNorm={vi.fn()}
        onToggleGroup={vi.fn()}
      />,
    );
    expect(screen.getByText('empty')).toBeInTheDocument();

    rerender(
      <LawNormPicker
        groups={[]}
        selectedIds={new Set()}
        status="error"
        onToggleNorm={vi.fn()}
        onToggleGroup={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('error');
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
