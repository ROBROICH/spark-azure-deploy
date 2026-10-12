import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'test-project' }),
  }),
}));

vi.mock('./ProjectOverviewNavbarSection', () => ({
  ProjectOverviewNavbarSection: () => <div>Overview navbar section</div>,
}));

vi.mock('./ProjectMasterDataSection', () => ({
  ProjectMasterDataSection: () => <div>Master data section</div>,
}));

vi.mock('./deadlines-card/DeadlinesCard', () => ({
  DeadlinesCard: () => <div>Deadlines card</div>,
}));

vi.mock('./team-card/TeamCard', () => ({
  TeamCard: () => <div>Team card</div>,
}));

// The plan-document card owns upload/update controls, previews, and version
// browsing; EWMS-only mode must not mount it. Rendered text stands in for the
// observable section.
vi.mock('./read-only-documents-table/ReadOnlyDocumentsCard', () => ({
  ReadOnlyDocumentsCard: () => <div>Plan documents card</div>,
}));

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the component must load only after __APP_CONFIG__ is set.
const { SingleProject } = await import('./SingleProject');

afterEach(() => {
  cleanup();
});

describe('SingleProject in EWMS-only product mode', () => {
  it('omits plan documents while retaining the other overview sections', () => {
    render(<SingleProject />);

    expect(screen.queryByText('Plan documents card')).toBeNull();
    expect(screen.getByText('Overview navbar section')).toBeTruthy();
    expect(screen.getByText('Master data section')).toBeTruthy();
    expect(screen.getByText('Deadlines card')).toBeTruthy();
    expect(screen.getByText('Team card')).toBeTruthy();
  });
});
