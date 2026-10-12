import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Accordion } from '@/features/ui/accordion/Accordion';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { RpbOutlineTreeNode } from '../outline/rpbOutlineTree';
import { OutlineNodeItem } from './OutlineNodeItem';

// Stub `matchMedia` for `useBelowLg`; tests target the compact code path.
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

const mocks = vi.hoisted(() => ({
  canToggleOutlineNodeCheckedMock: vi.fn(),
  onVaeNodeSelectMock: vi.fn(),
  toggleOutlineNodeCheckedMock: vi.fn(),
}));

const translations: Record<string, string> = {
  'gliederung.role.assignee.markLabel': 'Abschließen',
  'gliederung.role.assignee.markedLabel': 'Abgeschlossen',
  'gliederung.role.assignee.unmarkLabel': 'Abschluss aufheben',
  'gliederung.role.assignee.actionsMenuAriaLabel':
    'Aktionen für Kapitel {{chapter}}',
  'gliederung.role.assignee.markTooltip': 'Kapitel als abgeschlossen markieren',
  'gliederung.role.assignee.unmarkTooltip':
    'Markierung als abgeschlossen aufheben',
  'gliederung.role.assignee.disabledNotAssignedTooltip':
    'Sie können dieses Kapitel nicht abschließen, weil Ihnen das Thema nicht zugewiesen ist.',
  'gliederung.role.assignee.confirmTitle': 'Kapitel abschließen',
  'gliederung.role.assignee.confirmBody':
    'Die Verfahrensleitung wird über den Abschluss des Kapitels informiert.',
  'gliederung.role.assignee.confirmMark': 'Abschließen',
  'gliederung.role.assignee.unconfirmTitle': 'Abschluss aufheben',
  'gliederung.role.assignee.unconfirmBody':
    'Die Verfahrensleitung wird über die Aufhebung des Abschlusses informiert.',
  'gliederung.role.assignee.unconfirmMark': 'Aufheben',
  'gliederung.role.leader.markLabel': 'Freigeben',
  'gliederung.role.leader.markedLabel': 'Freigegeben',
  'gliederung.role.leader.unmarkLabel': 'Freigabe aufheben',
  'gliederung.role.leader.actionsMenuAriaLabel':
    'Aktionen für Kapitel {{chapter}}',
  'gliederung.role.leader.markTooltip': 'Kapitel als freigegeben markieren',
  'gliederung.role.leader.unmarkTooltip': 'Freigabe aufheben',
  'gliederung.role.leader.assigneeCompletedAriaLabel':
    'Kapitel A. Outline node wurde vom Bearbeitenden als abgeschlossen markiert',
  'gliederung.role.leader.assigneeCompletedTooltip':
    'Kapitel wurde vom Bearbeitenden\nals abgeschlossen markiert',
  'gliederung.role.leader.confirmTitle': 'Kapitel freigeben',
  'gliederung.role.leader.confirmBody':
    'Das Kapitel wird für alle Bearbeitenden sichtbar als freigegeben markiert.',
  'gliederung.role.leader.confirmMark': 'Freigeben',
  'gliederung.role.leader.unconfirmTitle': 'Freigabe aufheben',
  'gliederung.role.leader.unconfirmBody':
    'Das Kapitel wird als nicht freigegeben markiert.',
  'gliederung.role.leader.unconfirmMark': 'Aufheben',
  'gliederung.inProgress': 'In Bearbeitung',
  'gliederung.confirmCancel': 'Abbrechen',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const template = translations[key] ?? key;
      if (!options) {
        return template;
      }
      return Object.entries(options).reduce(
        (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, value),
        template,
      );
    },
  }),
}));

vi.mock('../workspace-state/RpbOutlineContext', () => ({
  useRpbOutlineCheckState: () => ({
    canToggleOutlineNodeChecked: mocks.canToggleOutlineNodeCheckedMock,
    toggleOutlineNodeChecked: mocks.toggleOutlineNodeCheckedMock,
  }),
  useRpbVaeNodeUrlState: () => ({
    onVaeNodeSelect: mocks.onVaeNodeSelectMock,
    selectedVaeNodeId: 'other-node',
  }),
}));

vi.mock('./OutlineConfirmDialog', () => ({
  OutlineConfirmDialog: (props: {
    cancelLabel: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
    open: boolean;
  }) =>
    props.open ? (
      <div role="dialog">
        <button type="button" onClick={props.onCancel}>
          {props.cancelLabel}
        </button>
        <button type="button" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    ) : null,
}));

const createOutlineNode = (
  overrides: Partial<RpbOutlineTreeNode['vaeNode']> = {},
): RpbOutlineTreeNode => ({
  children: [],
  vaeNode: {
    checkedByAssignee: false,
    checkedByLeader: false,
    id: 'outline-node',
    isDeleted: false,
    isHidden: false,
    order: 1,
    parentVaeNodeId: null,
    title: 'Outline node',
    topicId: 'topic-1',
    ...overrides,
  },
});

const renderOutlineNodeItem = (
  options: {
    canApproveFinalDecision?: boolean;
    node?: RpbOutlineTreeNode;
  } = {},
) => {
  render(
    <Accordion type="multiple" value={[]} onValueChange={vi.fn()}>
      <OutlineNodeItem
        node={options.node ?? createOutlineNode()}
        depth={0}
        indexPath={[0]}
        expandedNodeIdSet={new Set()}
        canApproveFinalDecision={options.canApproveFinalDecision ?? false}
      />
    </Accordion>,
  );
};

describe('OutlineNodeItem', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.canToggleOutlineNodeCheckedMock.mockReset();
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(true);
    mocks.onVaeNodeSelectMock.mockReset();
    mocks.toggleOutlineNodeCheckedMock.mockReset();
  });

  it('renders a disabled action trigger for read-only unchecked rows', () => {
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(false);

    renderOutlineNodeItem();

    expect(
      screen.getByRole('button', {
        name: /Thema nicht zugewiesen/u,
      }),
    ).toBeDisabled();
  });

  it('explains disabled action triggers with an assignment tooltip', () => {
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(false);

    renderOutlineNodeItem();

    const button = screen.getByRole('button', {
      name: /Thema nicht zugewiesen/u,
    });

    expect(button).toHaveAttribute(
      'title',
      'Sie können dieses Kapitel nicht abschließen, weil Ihnen das Thema nicht zugewiesen ist.',
    );
    expect(button.parentElement).toHaveAttribute(
      'title',
      'Sie können dieses Kapitel nicht abschließen, weil Ihnen das Thema nicht zugewiesen ist.',
    );
  });

  it('renders a disabled action trigger for read-only checked rows', () => {
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(false);

    renderOutlineNodeItem({
      node: createOutlineNode({
        checkedByAssignee: true,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Thema nicht zugewiesen/u,
      }),
    ).toBeDisabled();
    expect(screen.getByTestId('outline-checked-indicator')).toBeInTheDocument();
  });

  it('reflects assignee unchecked state for disabled assignee triggers', () => {
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(false);

    renderOutlineNodeItem({
      node: createOutlineNode({
        checkedByLeader: true,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Thema nicht zugewiesen/u,
      }),
    ).toBeDisabled();
    expect(
      screen.queryByTestId('outline-checked-indicator'),
    ).not.toBeInTheDocument();
  });

  it('renders the assignee action trigger permanently for permitted rows', () => {
    renderOutlineNodeItem();

    const trigger = screen.getByRole('button', {
      name: /Kapitel als abgeschlossen markieren/u,
    });

    expect(trigger).toBeVisible();
    expect(trigger.parentElement).not.toHaveClass('opacity-0');
  });

  it('does not open confirmation from disabled read-only triggers', async () => {
    const user = userEvent.setup();
    mocks.canToggleOutlineNodeCheckedMock.mockReturnValue(false);
    renderOutlineNodeItem();

    await user.click(
      screen.getByRole('button', {
        name: /Thema nicht zugewiesen/u,
      }),
    );

    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.toggleOutlineNodeCheckedMock).not.toHaveBeenCalled();
  });

  it('renders the Freigeben trigger for leaders even before assignee completion', () => {
    renderOutlineNodeItem({
      canApproveFinalDecision: true,
      node: createOutlineNode({
        checkedByAssignee: false,
        checkedByLeader: false,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Kapitel als freigegeben markieren/u,
      }),
    ).toBeVisible();
    expect(screen.queryByText('In Bearbeitung')).not.toBeInTheDocument();
  });

  it('shows assignee completion beside the leader trigger while approval is pending', () => {
    renderOutlineNodeItem({
      canApproveFinalDecision: true,
      node: createOutlineNode({
        checkedByAssignee: true,
        checkedByLeader: false,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Kapitel als freigegeben markieren/u,
      }),
    ).toBeVisible();
    const indicator = screen.getByRole('img', {
      name: 'Kapitel A. Outline node wurde vom Bearbeitenden als abgeschlossen markiert',
    });
    expect(indicator).toBeVisible();
  });

  it('does not show the leader-only assignee completion indicator to assignees', () => {
    renderOutlineNodeItem({
      canApproveFinalDecision: false,
      node: createOutlineNode({
        checkedByAssignee: true,
        checkedByLeader: false,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Markierung als abgeschlossen aufheben/u,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('img', {
        name: /vom Bearbeitenden als abgeschlossen markiert/u,
      }),
    ).not.toBeInTheDocument();
  });

  it('hides the pending assignee completion indicator once leader approval is set', () => {
    renderOutlineNodeItem({
      canApproveFinalDecision: true,
      node: createOutlineNode({
        checkedByAssignee: true,
        checkedByLeader: true,
      }),
    });

    expect(
      screen.getByRole('button', {
        name: /Freigabe aufheben/u,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('img', {
        name: /vom Bearbeitenden als abgeschlossen markiert/u,
      }),
    ).not.toBeInTheDocument();
  });

  it('confirms early Freigabe for leaders before assignee completion', async () => {
    const user = userEvent.setup();
    renderOutlineNodeItem({
      canApproveFinalDecision: true,
      node: createOutlineNode({
        checkedByAssignee: false,
        checkedByLeader: false,
      }),
    });

    await user.click(
      screen.getByRole('button', {
        name: /Kapitel als freigegeben markieren/u,
      }),
    );
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Freigeben' }),
    );
    await user.click(screen.getByRole('button', { name: 'Freigeben' }));

    expect(mocks.toggleOutlineNodeCheckedMock).toHaveBeenCalledWith(
      'outline-node',
      true,
    );
  });
});
