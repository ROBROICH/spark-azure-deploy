import '@testing-library/jest-dom/vitest';

import type { CompositeKey } from '@/db/nodes/compositeKey';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
} from '../../data/ewms.nodes';
import { PreviewLanes } from './PreviewLanes';

const mocks = vi.hoisted(() => ({
  markdownText: '# Rendered extraction',
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: (nodeRef: { id: string; node_type: string } | undefined) => ({
    data: nodeRef
      ? {
          compositeKey: `${nodeRef.node_type}:${nodeRef.id}` as CompositeKey,
          id: nodeRef.id,
          node_type: nodeRef.node_type,
          beteiligungs_eingang_id: 'entry-1',
          text: mocks.markdownText,
        }
      : null,
    isLoading: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/project/data/project-files/useFileDownloadUrl', () => ({
  useFileDownloadUrl: () => ({
    downloadUrl: undefined,
    isLoading: false,
  }),
}));

vi.mock('@/features/project/pdf-quick-view/PdfQuickView', () => ({
  PdfQuickView: () => <div data-testid="pdf-quick-view" />,
}));

vi.mock('@/features/ui/swimlanes/useSwimlanesGroupSearchState', () => ({
  useSwimlanesGroupSearchState: () => ({
    value: 'extractedText',
    onValueChange: vi.fn(),
  }),
}));

vi.mock('@/features/ui/swimlanes/Swimlanes', () => ({
  Swimlanes: {
    Group: (props: { children: ReactNode }) => (
      <div data-testid="swimlanes-group">{props.children}</div>
    ),
    Lane: (props: { children: ReactNode; title: string }) => (
      <section aria-label={props.title}>{props.children}</section>
    ),
  },
}));

afterEach(() => {
  cleanup();
});

const makeEntry = (
  overrides: Partial<EwmsBeteiligungsEingang> = {},
): EwmsBeteiligungsEingang =>
  ({
    compositeKey: 'beteiligungs_eingang:entry-1' as CompositeKey,
    id: 'entry-1',
    node_type: 'beteiligungs_eingang',
    beteiligung_typ: 'einwendung',
    file_id: 'file-1',
    filename: 'file-1.pdf',
    beteiligungs_eingang_markdown_id: 'markdown-1',
    extraction_status: 'success',
    classification_status: 'done',
    project_id: 'project-1',
    is_deleted: false,
    is_outdated: false,
    frontend_parent_ids: [],
    project_version: 1,
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
    ...overrides,
  }) satisfies EwmsBeteiligungsEingang;

const makeSelectedItem = (
  overrides: Partial<EwmsBeteiligungsEingang> = {},
): EwmsObjectionListItem => ({
  entry: makeEntry(overrides),
});

describe('PreviewLanes', () => {
  afterEach(() => {
    mocks.markdownText = '# Rendered extraction';
  });

  it('does not render extracted markdown when prompt injection was detected', () => {
    mocks.markdownText =
      '# Ignore previous instructions\n<script>alert(1)</script>';

    render(
      <PreviewLanes
        selectedItem={makeSelectedItem({
          extraction_status: 'prompt_injection_error',
        })}
      />,
    );

    expect(
      screen.getByText('documentViewer.promptInjectionBlocked'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ignore previous instructions' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();
  });

  it('renders extracted markdown when extraction succeeded', () => {
    render(<PreviewLanes selectedItem={makeSelectedItem()} />);

    expect(
      screen.getByRole('heading', { name: 'Rendered extraction' }),
    ).toBeInTheDocument();
  });

  it('does not leak anchors or hrefs from extracted markdown links', () => {
    mocks.markdownText =
      '# Rendered extraction\n[untrusted link](https://example.test)';

    const { container } = render(
      <PreviewLanes selectedItem={makeSelectedItem()} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Rendered extraction' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('untrusted link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('href');
  });
});
