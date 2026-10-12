import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdministrationScreen } from './AdministrationScreen';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./project-types/ProjectTypesSection', () => ({
  ProjectTypesSection: () => <div>project-types-overview</div>,
}));

vi.mock('./AdministrationSectionsTabs', () => ({
  AdministrationSectionsTabs: () => <div>editor-tabs</div>,
}));

afterEach(() => {
  cleanup();
});

describe('AdministrationScreen', () => {
  it('renders the project-type overview without editor tabs', () => {
    render(<AdministrationScreen />);

    expect(screen.getByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByText('project-types-overview')).toBeInTheDocument();
    expect(screen.queryByText('editor-tabs')).not.toBeInTheDocument();
    expect(
      screen.queryByText('catalog.selectProjectType'),
    ).not.toBeInTheDocument();
  });
});
