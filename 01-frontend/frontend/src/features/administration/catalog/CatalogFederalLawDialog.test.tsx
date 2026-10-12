import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogFederalLawDialog } from './CatalogFederalLawDialog';
import {
  LEGAL_BASIS_NORMS_PAGE_SIZE,
  type LegalBasisNormItem,
} from './legalBasisNormQuery';

const getLegalBasisNormsMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationGetLegalBasisNorms: (...args: unknown[]) =>
    getLegalBasisNormsMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => {
      if (key === 'selectedCount') {
        return `${String(params?.count ?? 0)} selected`;
      }
      return key;
    },
  }),
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  Accordion: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionItem: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionTrigger: (props: { children: React.ReactNode }) => (
    <button type="button">{props.children}</button>
  ),
  AccordionContent: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionChevron: () => <span />,
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
  bundesland: string | null,
  extras: Partial<LegalBasisNormItem> = {},
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
    id: `law-${jurabk}`,
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
    gesetzId: `law-${jurabk}`,
    paragraphNr,
    paragraphTitel: `Title ${paragraphNr}`,
    text: 'Normtext should not render',
    regelungsgegenstand: null,
    doknr: null,
    prev: null,
    next: null,
    frontendParentIds: [],
    isOutdated: false,
  },
  isDeconstructed: extras.isDeconstructed ?? false,
  deconstructionId: null,
  deconstructionCreatedAt: null,
  ...extras,
});

const renderDialog = (
  overrides?: Partial<Parameters<typeof CatalogFederalLawDialog>[0]>,
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const props = {
    open: true,
    persistedPruefungsNorms: [],
    persistedVerfahrensNorms: [],
    onOpenChange: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  };
  const wrapper = (wrapperProps: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, wrapperProps.children);
  return {
    ...render(<CatalogFederalLawDialog {...props} />, { wrapper }),
    ...props,
  };
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getLegalBasisNormsMock.mockReset();
  toastErrorMock.mockReset();
});

describe('CatalogFederalLawDialog', () => {
  it('shows federal laws including non-deconstructed norms and hides state laws', async () => {
    getLegalBasisNormsMock.mockResolvedValue({
      data: [
        item('BNatSchG', '44', null, { isDeconstructed: false }),
        item('BayWaldG', '1', 'BY'),
      ],
    });

    renderDialog();

    expect(
      await screen.findByRole('checkbox', { name: 'BNatSchG' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: '§ 44 Title 44' }),
    ).toBeTruthy();
    expect(screen.queryByText('BayWaldG')).toBeNull();
    expect(screen.queryByText('Normtext should not render')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('loads every paginated norm of a law before applying a parent selection', async () => {
    const user = userEvent.setup();
    const firstPage = Array.from(
      { length: LEGAL_BASIS_NORMS_PAGE_SIZE },
      (_, index) => item('BNatSchG', String(index + 1), null),
    );
    const extra = item(
      'BNatSchG',
      String(LEGAL_BASIS_NORMS_PAGE_SIZE + 1),
      null,
    );
    getLegalBasisNormsMock.mockImplementation(
      (options: { query?: { jurabk?: string; offset?: number } }) => {
        if (options.query?.jurabk === 'BNatSchG') {
          if ((options.query.offset ?? 0) === 0) {
            return Promise.resolve({ data: firstPage });
          }
          return Promise.resolve({ data: [extra] });
        }
        return Promise.resolve({
          data: [item('BNatSchG', '1', null)],
        });
      },
    );

    const onApply = vi.fn();
    renderDialog({ onApply });
    await user.click(await screen.findByRole('checkbox', { name: 'BNatSchG' }));
    await waitFor(() => {
      expect(
        getLegalBasisNormsMock.mock.calls.some(
          (call) =>
            (call[0] as { query?: { jurabk?: string; offset?: number } }).query
              ?.jurabk === 'BNatSchG' &&
            (call[0] as { query?: { offset?: number } }).query?.offset ===
              LEGAL_BASIS_NORMS_PAGE_SIZE,
        ),
      ).toBe(true);
    });
    await user.click(
      screen.getByRole('button', { name: 'catalog.legalBasis.apply' }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          jurabk: 'BNatSchG',
          paragraphNr: String(LEGAL_BASIS_NORMS_PAGE_SIZE + 1),
        }),
      ]),
    );
    expect(onApply.mock.calls[0]?.[0]).toHaveLength(
      LEGAL_BASIS_NORMS_PAGE_SIZE + 1,
    );
  });

  it('keeps an existing verfahrensNorm in that list and adds new refs as pruefungsNorms after apply', async () => {
    const user = userEvent.setup();
    getLegalBasisNormsMock.mockResolvedValue({
      data: [item('VwVfG', '36', null), item('BNatSchG', '44', null)],
    });
    const { onApply } = renderDialog({
      persistedVerfahrensNorms: [
        {
          jurabk: 'VwVfG',
          paragraphNr: '36',
          absatz: null,
          satz: null,
          nummer: null,
        },
      ],
    });

    await user.click(
      await screen.findByRole('checkbox', { name: '§ 44 Title 44' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'catalog.legalBasis.apply' }),
    );

    expect(onApply).toHaveBeenCalledWith([
      expect.objectContaining({ jurabk: 'VwVfG', paragraphNr: '36' }),
      expect.objectContaining({ jurabk: 'BNatSchG', paragraphNr: '44' }),
    ]);
  });

  it('shows unavailable persisted refs that are missing from the current law database', async () => {
    getLegalBasisNormsMock.mockResolvedValue({ data: [] });
    renderDialog({
      persistedPruefungsNorms: [
        {
          jurabk: 'OldG',
          paragraphNr: '1',
          absatz: '2',
          satz: null,
          nummer: null,
        },
      ],
    });

    expect(await screen.findByText('unavailable')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '§ 1 Abs. 2' })).toBeTruthy();
  });

  it('keeps Apply disabled until every concurrent whole-law load finishes', async () => {
    const user = userEvent.setup();
    let resolveA: (value: { data: LegalBasisNormItem[] }) => void = () => {};
    let resolveB: (value: { data: LegalBasisNormItem[] }) => void = () => {};
    const deferredA = new Promise<{ data: LegalBasisNormItem[] }>((resolve) => {
      resolveA = resolve;
    });
    const deferredB = new Promise<{ data: LegalBasisNormItem[] }>((resolve) => {
      resolveB = resolve;
    });
    getLegalBasisNormsMock.mockImplementation(
      (options: { query?: { jurabk?: string } }) => {
        if (options.query?.jurabk === 'LawA') {
          return deferredA;
        }
        if (options.query?.jurabk === 'LawB') {
          return deferredB;
        }
        return Promise.resolve({
          data: [item('LawA', '1', null), item('LawB', '1', null)],
        });
      },
    );

    renderDialog();
    const apply = screen.getByRole('button', {
      name: 'catalog.legalBasis.apply',
    });
    await user.click(await screen.findByRole('checkbox', { name: 'LawA' }));
    await user.click(screen.getByRole('checkbox', { name: 'LawB' }));
    expect(apply).toBeDisabled();

    resolveA({ data: [item('LawA', '1', null)] });
    await waitFor(() => expect(apply).toBeDisabled());
    resolveB({ data: [item('LawB', '1', null)] });
    await waitFor(() => expect(apply).toBeEnabled());
  });

  it('shows feedback and re-enables Apply when a whole-law load fails', async () => {
    const user = userEvent.setup();
    getLegalBasisNormsMock.mockImplementation(
      (options: { query?: { jurabk?: string } }) =>
        options.query?.jurabk
          ? Promise.reject(new Error('load failed'))
          : Promise.resolve({ data: [item('BNatSchG', '44', null)] }),
    );

    renderDialog();
    const apply = screen.getByRole('button', {
      name: 'catalog.legalBasis.apply',
    });
    await user.click(await screen.findByRole('checkbox', { name: 'BNatSchG' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'catalog.legalBasis.loadError',
      );
      expect(apply).toBeEnabled();
    });
  });
});
