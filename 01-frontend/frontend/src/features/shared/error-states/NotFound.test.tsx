import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotFound } from './NotFound';

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: React.ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../DynamicAsset', () => ({
  DynamicAsset: (props: { className?: string; name: string }) => (
    <div
      aria-hidden="true"
      data-testid="not-found-asset"
      data-class-name={props.className}
      data-name={props.name}
    />
  ),
}));

describe('NotFound', () => {
  it('renders the 404 page with key-backed copy and decorative media', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText('notFound.description')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'notFound.dashboard' }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByTestId('not-found-asset')).toHaveAttribute(
      'data-name',
      'owl-404',
    );
    expect(screen.queryByLabelText('404 media')).not.toBeInTheDocument();
  });
});
