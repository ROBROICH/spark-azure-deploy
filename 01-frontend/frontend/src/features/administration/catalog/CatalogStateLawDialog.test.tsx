import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { federalStateCodes } from '@/features/project/data/project-details-form/federalStates';

import type { CatalogNorm } from '../data/usecaseApi';
import { CatalogStateLawDialog } from './CatalogStateLawDialog';
import type { LegalBasisNormItem } from './legalBasisNormQuery';

const getLegalBasisNormsMock = vi.hoisted(() => vi.fn());

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationGetLegalBasisNorms: (...args: unknown[]) =>
    getLegalBasisNormsMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/ui/dialog/Dialog', async () => {
  const React = await import('react');
  return {
    Dialog: (props: { open: boolean; children: React.ReactNode }) =>
      props.open ? React.createElement('div', null, props.children) : null,
    DialogContent: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogHeader: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogTitle: (props: { children: React.ReactNode }) =>
      React.createElement('h2', null, props.children),
    DialogDescription: (props: { children: React.ReactNode }) =>
      React.createElement('p', null, props.children),
    DialogFooter: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
  };
});

const item = (
  jurabk: string,
  paragraphNr: string,
  bundesland: 'BY' | 'BW',
): LegalBasisNormItem => ({
  jurabk,
  paragraphNr,
  paragraphTitel: `Title ${paragraphNr}`,
  gesetzTitel: null,
  gesetzKurztitel: null,
  doknr: null,
  bundesland,
  dokumentTyp: null,
  gesetz: {
    nodeType: 'gesetz',
    id: `law-${jurabk}-${bundesland}`,
    name: jurabk,
    jurabk,
    titel: null,
    kurztitel: null,
    doknr: null,
    bundesland,
    dokumentTyp: null,
    fundstelle: null,
    standangaben: [],
  },
  norm: {
    nodeType: 'norm',
    id: `norm-${jurabk}-${paragraphNr}`,
    gesetzId: `law-${jurabk}-${bundesland}`,
    paragraphNr,
    paragraphTitel: `Title ${paragraphNr}`,
    text: null,
    regelungsgegenstand: null,
    doknr: null,
    prev: null,
    next: null,
    frontendParentIds: [],
    isOutdated: false,
  },
  isDeconstructed: false,
  deconstructionId: null,
  deconstructionCreatedAt: null,
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getLegalBasisNormsMock.mockReset();
  getLegalBasisNormsMock.mockImplementation(
    (options: { query?: { bundesland?: string } }) => {
      if (options.query?.bundesland === 'BY') {
        return Promise.resolve({
          data: [item('BayWaldG', '1', 'BY')],
        });
      }
      if (options.query?.bundesland === 'BW') {
        return Promise.resolve({
          data: [item('LWaldG BW', '1', 'BW')],
        });
      }
      return Promise.resolve({ data: [] });
    },
  );
});

const emptyPersisted = federalStateCodes.reduce(
  (groups, code) => {
    groups[code] = [];
    return groups;
  },
  {} as Record<(typeof federalStateCodes)[number], CatalogNorm[]>,
);

describe('CatalogStateLawDialog', () => {
  it('lists all 16 states and queries only the expanded state code', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = (props: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, props.children);

    render(
      <CatalogStateLawDialog
        open
        persistedByState={emptyPersisted}
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /Bayern/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Baden-Württemberg/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hamburg/ })).toBeInTheDocument();
    expect(getLegalBasisNormsMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Bayern/ }));

    expect(
      await screen.findByRole('checkbox', { name: 'BayWaldG' }),
    ).toBeTruthy();
    expect(screen.queryByText('LWaldG BW')).toBeNull();
    await waitFor(() => {
      expect(getLegalBasisNormsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ bundesland: 'BY' }),
        }),
      );
    });
  });

  it('keeps Apply disabled until concurrent loads in different states finish', async () => {
    const user = userEvent.setup();
    let resolveBy: (value: { data: LegalBasisNormItem[] }) => void = () => {};
    let resolveBw: (value: { data: LegalBasisNormItem[] }) => void = () => {};
    const deferredBy = new Promise<{ data: LegalBasisNormItem[] }>(
      (resolve) => {
        resolveBy = resolve;
      },
    );
    const deferredBw = new Promise<{ data: LegalBasisNormItem[] }>(
      (resolve) => {
        resolveBw = resolve;
      },
    );
    getLegalBasisNormsMock.mockImplementation(
      (options: { query?: { bundesland?: string; jurabk?: string } }) => {
        if (options.query?.jurabk === 'BayWaldG') {
          return deferredBy;
        }
        if (options.query?.jurabk === 'LWaldG BW') {
          return deferredBw;
        }
        if (options.query?.bundesland === 'BY') {
          return Promise.resolve({ data: [item('BayWaldG', '1', 'BY')] });
        }
        if (options.query?.bundesland === 'BW') {
          return Promise.resolve({ data: [item('LWaldG BW', '1', 'BW')] });
        }
        return Promise.resolve({ data: [] });
      },
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = (props: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, props.children);

    render(
      <CatalogStateLawDialog
        open
        persistedByState={emptyPersisted}
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
      />,
      { wrapper },
    );
    const apply = screen.getByRole('button', {
      name: 'catalog.legalBasis.apply',
    });
    await user.click(screen.getByRole('button', { name: /Bayern/ }));
    await user.click(screen.getByRole('button', { name: /Baden-Württemberg/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'BayWaldG' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'LWaldG BW' }),
    );
    expect(apply).toBeDisabled();

    resolveBy({ data: [item('BayWaldG', '1', 'BY')] });
    await waitFor(() => expect(apply).toBeDisabled());
    resolveBw({ data: [item('LWaldG BW', '1', 'BW')] });
    await waitFor(() => expect(apply).toBeEnabled());
  });
});
