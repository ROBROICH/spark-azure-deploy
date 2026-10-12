import type { ComponentProps } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RechtsgrundlageDialog } from './RechtsgrundlageDialog';

type RechtsgrundlageDialogProps = ComponentProps<typeof RechtsgrundlageDialog>;

const {
  updateMock,
  deleteMock,
  transactMock,
  addLegalBasisNormsToProjectMock,
  experimentalRouteRemountMock,
  sentryCaptureExceptionMock,
  useAvailableRechtsgrundlageDataMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  transactMock: vi.fn(),
  addLegalBasisNormsToProjectMock: vi.fn(),
  experimentalRouteRemountMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  useAvailableRechtsgrundlageDataMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const BNATSCHG_44_SELECTION_KEY = 'bnatschg::44';
const BNATSCHG_45_SELECTION_KEY = 'bnatschg::45';
const ENWG_17_SELECTION_KEY = 'enwg::17';

const MOCK_AVAILABLE_NORM_ENTRIES = [
  {
    selectionKey: BNATSCHG_44_SELECTION_KEY,
    legalBasis: {
      jurabk: 'BNatSchG',
      paragraphNr: '44',
    },
    norm: {
      id: BNATSCHG_44_SELECTION_KEY,
      gesetzId: 'law-bnatschg',
      paragraphNr: '44',
      paragraphTitel:
        'Vorschriften fuer besonders geschuetzte und bestimmte andere Tier- und Pflanzenarten',
      text: 'Normtext 44',
    },
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    projectNorm: {
      id: 'norm-bnatschg-44',
      frontendParentIds: ['topic_norm:topic-norm-bnatschg-44'],
    },
    topicNorms: [
      {
        id: 'topic-norm-bnatschg-44',
        nodeType: 'topic_norm',
        jurabk: 'BNatSchG',
        paragraphNr: '44',
        updateType: 'automated',
      },
    ],
    topicNorm: {
      id: 'topic-norm-bnatschg-44',
      nodeType: 'topic_norm',
      jurabk: 'BNatSchG',
      paragraphNr: '44',
      updateType: 'automated',
    },
    topicNormLinks: [
      {
        norm: {
          id: 'norm-bnatschg-44',
          frontendParentIds: ['topic_norm:topic-norm-bnatschg-44'],
        },
        topicNorm: {
          id: 'topic-norm-bnatschg-44',
          nodeType: 'topic_norm',
          jurabk: 'BNatSchG',
          paragraphNr: '44',
          updateType: 'automated',
        },
      },
    ],
  },
  {
    selectionKey: BNATSCHG_45_SELECTION_KEY,
    legalBasis: {
      jurabk: 'BNatSchG',
      paragraphNr: '45',
    },
    norm: {
      id: BNATSCHG_45_SELECTION_KEY,
      gesetzId: 'law-bnatschg',
      paragraphNr: '45',
      paragraphTitel:
        'Ausnahmen; Ermaechtigung zum Erlass von Rechtsverordnungen',
      text: 'Normtext 45',
    },
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    projectNorm: null,
    topicNorms: [],
    topicNorm: null,
    topicNormLinks: [],
  },
  {
    selectionKey: ENWG_17_SELECTION_KEY,
    legalBasis: {
      jurabk: 'EnWG',
      paragraphNr: '17',
    },
    norm: {
      id: ENWG_17_SELECTION_KEY,
      gesetzId: 'law-enwg',
      paragraphNr: '17',
      paragraphTitel:
        'Verfahren; Ermaechtigung zum Erlass von Rechtsverordnungen',
      text: 'Normtext 17',
    },
    gesetz: {
      id: 'law-enwg',
      jurabk: 'EnWG',
    },
    projectNorm: null,
    topicNorms: [],
    topicNorm: null,
    topicNormLinks: [],
  },
] as const;

const MOCK_AVAILABLE_LAW_GROUPS = [
  {
    id: 'law-bnatschg',
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    norms: MOCK_AVAILABLE_NORM_ENTRIES.slice(0, 2),
  },
  {
    id: 'law-enwg',
    gesetz: {
      id: 'law-enwg',
      jurabk: 'EnWG',
    },
    norms: MOCK_AVAILABLE_NORM_ENTRIES.slice(2),
  },
] as const;

const getNormLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return `§ ${normEntry.norm.paragraphNr} ${normEntry.norm.paragraphTitel}`;
};

const getSelectNormCheckboxLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return getNormLabel(normEntry);
};

const getDeselectNormCheckboxLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return getNormLabel(normEntry);
};

const getSelectLawGroupCheckboxLabel = (lawGroup: string) => {
  return lawGroup;
};

let mockSelectedNormIds = new Set<string>();
vi.mock('../../screen-data/useRechtsgrundlageData', () => ({
  useAvailableRechtsgrundlageData: () => useAvailableRechtsgrundlageDataMock(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationAddLegalBasisNormsToProject: addLegalBasisNormsToProjectMock,
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 7,
}));

vi.mock('@/integrations/router/routeRemount', () => ({
  experimentalRouteRemount: experimentalRouteRemountMock,
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    update: updateMock,
    delete: deleteMock,
    transact: transactMock,
  }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: sentryCaptureExceptionMock,
}));

vi.mock('@/features/ui/button/Button', async () => {
  const React = await import('react');

  return {
    Button: (props: {
      children: React.ReactNode;
      disabled?: boolean;
      loading?: boolean;
      onClick?: () => void;
      type?: 'button' | 'submit' | 'reset';
    }) =>
      React.createElement(
        'button',
        {
          type: props.type ?? 'button',
          disabled: props.disabled || props.loading,
          'aria-busy': props.loading ? 'true' : 'false',
          onClick: props.onClick,
        },
        props.loading
          ? [
              React.createElement('svg', {
                key: 'spinner',
                className: 'animate-spin',
              }),
              props.children,
            ]
          : props.children,
      ),
  };
});

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({
      topicName: 'topic-1',
      verfahrenId: 'verfahren-1',
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations = {
        'RechtsgrundlageDialog.title': 'Rechtsgrundlage',
        'RechtsgrundlageDialog.description':
          'Die Rechtsgrundlagen enthalten „Startnormen“, die im vorliegenden Thema einschlägig sein könnten. Prüfen Sie diese in Bezug auf das gegenständliche Verfahren und editieren oder ergänzen Sie weitere Normen bei Bedarf.',
        'RechtsgrundlageDialog.cancel': 'Abbrechen',
        'RechtsgrundlageDialog.save': 'Speichern',
        'RechtsgrundlageDialog.errors.missingLawReference':
          'Mindestens eine ausgewählte Norm kann ohne zugeordnetes Gesetz nicht gespeichert werden.',
        'RechtsgrundlageDialog.errors.saveFailed':
          'Änderungen konnten nicht gespeichert werden.',
      } satisfies Record<string, string>;
      if (
        key === 'selectedCount' ||
        key === 'RechtsgrundlageDialog.selectedCount'
      ) {
        return `${String(params?.count ?? 0)} ausgewaehlt`;
      }
      if (
        key === 'groupCheckboxSelectHint' ||
        key === 'RechtsgrundlageDialog.groupCheckboxSelectHint'
      ) {
        return `Aktivierung waehlt auch ${String(params?.count ?? 0)} zugehoerige Normen aus.`;
      }
      if (
        key === 'groupCheckboxDeselectHint' ||
        key === 'RechtsgrundlageDialog.groupCheckboxDeselectHint'
      ) {
        return `Deaktivierung hebt die Auswahl von ${String(params?.count ?? 0)} zugehoerigen Normen auf.`;
      }
      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/ui/dialog/Dialog', async () => {
  const React = await import('react');

  let wasPreviouslyOpen = false;

  const MockDialog = (props: {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    children: React.ReactNode;
  }) => {
    React.useEffect(() => {
      if (props.open && !wasPreviouslyOpen) {
        props.onOpenChange(true);
      }
      wasPreviouslyOpen = props.open;
    });

    return props.open
      ? React.createElement('div', { 'data-testid': 'dialog' }, props.children)
      : null;
  };

  return {
    Dialog: MockDialog,
    DialogContent: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogHeader: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogTitle: (props: { children: React.ReactNode }) =>
      React.createElement('h2', null, props.children),
    DialogDescription: (props: { children: React.ReactNode }) =>
      React.createElement('p', null, props.children),
  };
});

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
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockSelectedNormIds = new Set<string>();
  updateMock.mockReset();
  deleteMock.mockReset();
  transactMock.mockReset();
  addLegalBasisNormsToProjectMock.mockReset();
  addLegalBasisNormsToProjectMock.mockResolvedValue({ data: { items: [] } });
  experimentalRouteRemountMock.mockReset();
  experimentalRouteRemountMock.mockResolvedValue(undefined);
  sentryCaptureExceptionMock.mockReset();
  toastErrorMock.mockReset();
  useAvailableRechtsgrundlageDataMock.mockReset();
  useAvailableRechtsgrundlageDataMock.mockImplementation(() => ({
    availableLawGroups: MOCK_AVAILABLE_LAW_GROUPS,
    availableNormEntries: MOCK_AVAILABLE_NORM_ENTRIES,
    selectedNormIds: mockSelectedNormIds,
  }));
  transactMock.mockImplementation((callback: () => void) => {
    callback();
    return {
      isPersisted: {
        promise: Promise.resolve(),
      },
    };
  });
});

const renderDialog = (overrides?: {
  canMutateTopic?: boolean;
  onOpenChange?: RechtsgrundlageDialogProps['onOpenChange'];
  selectedNormIds?: Set<string>;
}) => {
  mockSelectedNormIds = overrides?.selectedNormIds ?? new Set<string>();

  const props = {
    canMutateTopic: true,
    onOpenChange: vi.fn<RechtsgrundlageDialogProps['onOpenChange']>(),
    open: true,
    ...overrides,
  };

  const result = render(
    <RechtsgrundlageDialog
      canMutateTopic={props.canMutateTopic}
      onOpenChange={props.onOpenChange}
      open={props.open}
    />,
  );

  return {
    ...result,
    ...props,
  };
};

describe('RechtsgrundlageDialog', () => {
  it('keeps existing linked norms checked and disabled', () => {
    const selectedNormIds = new Set<string>([BNATSCHG_44_SELECTION_KEY]);

    renderDialog({ selectedNormIds });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });

    expect(checkbox.getAttribute('data-state')).toBe('checked');
    expect(checkbox.hasAttribute('disabled')).toBe(false);
  });

  it('does not render norm text in selectable norm rows', () => {
    renderDialog();

    expect(screen.queryByText('Normtext 44')).toBeNull();
    expect(screen.queryByText('Normtext 45')).toBeNull();
    expect(screen.queryByText('Normtext 17')).toBeNull();
  });

  it('toggles a new norm locally when its checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    expect(checkbox.getAttribute('data-state')).toBe('unchecked');

    await user.click(checkbox);

    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });

  it('describes cascade behavior on the law group checkbox for screen readers', () => {
    renderDialog();

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    const describedByIds = (
      groupCheckbox.getAttribute('aria-describedby') ?? ''
    )
      .split(' ')
      .filter(Boolean);
    const describedTexts = describedByIds.map(
      (id) => document.getElementById(id)?.textContent ?? '',
    );

    expect(describedTexts).toContain(
      'Aktivierung waehlt auch 2 zugehoerige Normen aus.',
    );
  });

  it('announces the selected norm count in a polite live region', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]) });

    const liveRegion = screen.getByText('1 ausgewaehlt', {
      selector: '.sr-only',
    });
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    await user.click(groupCheckbox);

    expect(
      screen
        .getByText('2 ausgewaehlt', { selector: '.sr-only' })
        .getAttribute('aria-live'),
    ).toBe('polite');
  });

  it('selects all norms in a group when the group checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]) });

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    await user.click(groupCheckbox);

    const existingCheckbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    const newCheckbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });

    expect(existingCheckbox.getAttribute('data-state')).toBe('checked');
    expect(newCheckbox.getAttribute('data-state')).toBe('checked');
  });

  it('unselects an existing norm locally when its checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]) });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    expect(checkbox.getAttribute('data-state')).toBe('checked');

    await user.click(checkbox);

    expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  });

  it('bulk adds newly selected norms and remounts the MVP route', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<RechtsgrundlageDialogProps['onOpenChange']>();
    renderDialog({
      onOpenChange,
      selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]),
    });

    const newNormCheckbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(newNormCheckbox);
    await waitFor(() => {
      expect(newNormCheckbox.getAttribute('data-state')).toBe('checked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(addLegalBasisNormsToProjectMock).toHaveBeenCalledOnce();
      expect(transactMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(deleteMock).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(experimentalRouteRemountMock).toHaveBeenCalledWith('verfahren-1');
    });

    expect(onOpenChange.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      addLegalBasisNormsToProjectMock.mock.invocationCallOrder.at(0) ?? 0,
    );

    expect(addLegalBasisNormsToProjectMock).toHaveBeenCalledWith({
      body: {
        topicId: 'topic-1',
        type: 'pruefung',
        norms: [{ jurabk: 'BNatSchG', paragraphNr: '45' }],
      },
      path: { projectId: 'verfahren-1' },
      query: { projectVersion: 7 },
      throwOnError: true,
    });
  });

  it('does not persist selection changes without topic mutation rights', async () => {
    const user = userEvent.setup();
    renderDialog({ canMutateTopic: false });

    await user.click(
      screen.getByRole('checkbox', {
        name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
      }),
    );

    const saveButton = screen.getByRole('button', { name: 'Speichern' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    await user.click(saveButton);

    expect(transactMock).not.toHaveBeenCalled();
    expect(addLegalBasisNormsToProjectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(experimentalRouteRemountMock).not.toHaveBeenCalled();
  });

  it('shows a spinner in the save button while saving', async () => {
    const user = userEvent.setup();
    let resolveAddRequest: (() => void) | undefined;
    addLegalBasisNormsToProjectMock.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveAddRequest = () => {
          resolve({ data: { items: [] } });
        };
      });
    });
    renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('checked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saveButton = screen.getByRole('button', { name: 'Speichern' });
    expect(saveButton.getAttribute('aria-busy')).toBe('true');
    expect(saveButton.querySelector('svg.animate-spin')).not.toBeNull();

    resolveAddRequest?.();
  });

  it('deletes topic_norm nodes and cleans the norm edge for removed norms', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({
      selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]),
    });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('unchecked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(transactMock).toHaveBeenCalledOnce();
      expect(addLegalBasisNormsToProjectMock).not.toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalledOnce();
      expect(updateMock).toHaveBeenCalledOnce();
      expect(addLegalBasisNormsToProjectMock).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(experimentalRouteRemountMock).toHaveBeenCalledWith('verfahren-1');
    });

    expect(deleteMock).toHaveBeenCalledWith(
      MOCK_AVAILABLE_NORM_ENTRIES[0].topicNorm,
    );
    expect(updateMock).toHaveBeenCalledWith(
      MOCK_AVAILABLE_NORM_ENTRIES[0].projectNorm,
      expect.any(Function),
    );
  });

  it('deletes every linked topic_norm when removing a norm with duplicate links', async () => {
    const user = userEvent.setup();
    useAvailableRechtsgrundlageDataMock.mockImplementation(() => ({
      availableLawGroups: MOCK_AVAILABLE_LAW_GROUPS,
      availableNormEntries: [
        {
          ...MOCK_AVAILABLE_NORM_ENTRIES[0],
          topicNorms: [
            MOCK_AVAILABLE_NORM_ENTRIES[0].topicNorm,
            {
              id: 'topic-norm-bnatschg-44-duplicate',
              nodeType: 'topic_norm',
              jurabk: 'BNatSchG',
              paragraphNr: '44',
              updateType: 'manual',
              frontendParentIds: ['topic:topic-1'],
            },
          ],
          topicNormLinks: [
            {
              norm: MOCK_AVAILABLE_NORM_ENTRIES[0].projectNorm,
              topicNorm: MOCK_AVAILABLE_NORM_ENTRIES[0].topicNorm,
            },
            {
              norm: MOCK_AVAILABLE_NORM_ENTRIES[0].projectNorm,
              topicNorm: {
                id: 'topic-norm-bnatschg-44-duplicate',
                nodeType: 'topic_norm',
                jurabk: 'BNatSchG',
                paragraphNr: '44',
                updateType: 'manual',
                frontendParentIds: ['topic:topic-1'],
              },
            },
          ],
        },
        ...MOCK_AVAILABLE_NORM_ENTRIES.slice(1),
      ],
      selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]),
    }));
    const { onOpenChange } = renderDialog({
      selectedNormIds: new Set([BNATSCHG_44_SELECTION_KEY]),
    });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('unchecked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledTimes(2);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows an error when persisting new norms fails', async () => {
    const user = userEvent.setup();
    addLegalBasisNormsToProjectMock.mockRejectedValueOnce(
      new Error('save failed'),
    );
    const { onOpenChange } = renderDialog();

    await user.click(
      screen.getByRole('checkbox', {
        name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Änderungen konnten nicht gespeichert werden.',
      );
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(experimentalRouteRemountMock).not.toHaveBeenCalled();
  });

  it('closes without inserting when cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(addLegalBasisNormsToProjectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(experimentalRouteRemountMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets pending draft selections when reopened', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<RechtsgrundlageDialogProps['onOpenChange']>();

    const { rerender } = render(
      <RechtsgrundlageDialog
        canMutateTopic
        onOpenChange={onOpenChange}
        open={true}
      />,
    );

    const checkboxLabel = getSelectNormCheckboxLabel(
      MOCK_AVAILABLE_NORM_ENTRIES[1],
    );
    const checkbox = screen.getByRole('checkbox', {
      name: checkboxLabel,
    });
    await user.click(checkbox);
    expect(checkbox.getAttribute('data-state')).toBe('checked');

    rerender(null);
    rerender(
      <RechtsgrundlageDialog
        canMutateTopic
        onOpenChange={onOpenChange}
        open={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByRole('checkbox', {
            name: checkboxLabel,
          })
          .getAttribute('data-state'),
      ).toBe('unchecked');
    });
  });
});
