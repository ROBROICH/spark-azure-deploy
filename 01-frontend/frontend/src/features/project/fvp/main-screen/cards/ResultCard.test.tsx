import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultCard } from './ResultCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    MoreVertical: () => <svg data-testid="more-vertical-icon" />,
  };
});

afterEach(() => {
  cleanup();
});

const renderResultCard = (actions: [] | [{ id: string }]) =>
  render(
    <TooltipProvider>
      <ResultCard
        processed={0}
        total={1}
        statusTextKey="status"
        titleKey="title"
        infoTooltipKey="info"
        infoTooltipAriaLabelKey="infoLabel"
        descriptionKey="description"
        hintsHeadingKey="hintsHeading"
        hints={[
          {
            id: 'hint-1',
            label: 'Hinweis A',
            menuAriaLabelKey: 'menuLabel',
            actions: actions.map((action) => ({
              ...action,
              labelKey: 'actionLabel',
              onSelect: () => undefined,
            })),
          },
        ]}
      />
    </TooltipProvider>,
  );

describe('ResultCard', () => {
  it('does not show a hint action menu affordance when no actions are available', () => {
    renderResultCard([]);

    expect(screen.getByText('Hinweis A')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'menuLabel' })).toBeNull();
    expect(screen.queryByTestId('more-vertical-icon')).toBeNull();
  });

  it('shows a hint action menu when actions are available', () => {
    renderResultCard([{ id: 'edit' }]);

    expect(screen.getByRole('button', { name: 'menuLabel' })).toBeTruthy();
    expect(screen.getByTestId('more-vertical-icon')).toBeTruthy();
  });
});
