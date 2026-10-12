import {
  AccordionContent,
  AccordionItem,
} from '@/features/ui/accordion/Accordion';
import { OutlineConfirmDialog } from './OutlineConfirmDialog';
import { cn } from '@/features/ui/style/cn';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useRpbOutlineCheckState,
  useRpbVaeNodeUrlState,
} from '../workspace-state/RpbOutlineContext';
import { formatNodeNumber } from '../outline/outlineNumbering';
import {
  readRelevantCheckedField,
  type RpbOutlineTreeNode,
} from '../outline/rpbOutlineTree';
import { getOutlineRowStateClassName, OutlineRow } from './OutlineNodeRow';

type OutlineRoleCopyKey = 'assignee' | 'leader';

type OutlineNodeChildrenProps = {
  childrenNodes: RpbOutlineTreeNode[];
  depth: number;
  indexPath: number[];
  expandedNodeIdSet: Set<string>;
  canApproveFinalDecision: boolean;
};

type OutlineDialogCopy = {
  title: string;
  body: string;
  confirmLabel: string;
};

type TranslationFunction = ReturnType<typeof useTranslation<'Rpb'>>['t'];

const getRoleCopyKey = (
  canApproveFinalDecision: boolean,
): OutlineRoleCopyKey => (canApproveFinalDecision ? 'leader' : 'assignee');

const getAssigneeCompletedIndicator = (options: {
  canApproveFinalDecision: boolean;
  isAssigneeChecked: boolean;
  isLeaderChecked: boolean;
  label: string;
  t: TranslationFunction;
}) => {
  if (
    !options.canApproveFinalDecision ||
    !options.isAssigneeChecked ||
    options.isLeaderChecked
  ) {
    return undefined;
  }

  return {
    ariaLabel: options.t('gliederung.role.leader.assigneeCompletedAriaLabel', {
      chapter: options.label,
    }),
    tooltip: options.t('gliederung.role.leader.assigneeCompletedTooltip'),
  };
};

const getDisabledTooltipCopy = (options: {
  canApproveFinalDecision: boolean;
  canToggleChecked: boolean;
  t: TranslationFunction;
}) => {
  if (options.canApproveFinalDecision || options.canToggleChecked) {
    return undefined;
  }

  return options.t('gliederung.role.assignee.disabledNotAssignedTooltip');
};

const getDialogCopy = (options: {
  pendingAction: PendingAction;
  t: TranslationFunction;
}): OutlineDialogCopy => {
  const roleCopyKey = getRoleCopyKey(
    options.pendingAction.canApproveFinalDecision,
  );
  const actionCopyKey =
    options.pendingAction.action === 'unmark' ? 'unconfirm' : 'confirm';

  return {
    title: options.t(`gliederung.role.${roleCopyKey}.${actionCopyKey}Title`),
    body: options.t(`gliederung.role.${roleCopyKey}.${actionCopyKey}Body`),
    confirmLabel: options.t(
      `gliederung.role.${roleCopyKey}.${actionCopyKey}Mark`,
    ),
  };
};

const OutlineNodeChildren = (props: OutlineNodeChildrenProps) => {
  const {
    childrenNodes,
    depth,
    indexPath,
    expandedNodeIdSet,
    canApproveFinalDecision,
  } = props;

  if (childrenNodes.length === 0) {
    return null;
  }

  return (
    <AccordionContent className="flex flex-col gap-2 py-1 pl-4">
      {childrenNodes.map((child, childIndex) => (
        <OutlineNodeItem
          key={child.vaeNode.id}
          node={child}
          depth={depth + 1}
          indexPath={[...indexPath, childIndex]}
          expandedNodeIdSet={expandedNodeIdSet}
          canApproveFinalDecision={canApproveFinalDecision}
        />
      ))}
    </AccordionContent>
  );
};

type OutlineNodeItemProps = {
  node: RpbOutlineTreeNode;
  depth: number;
  indexPath: number[];
  expandedNodeIdSet: Set<string>;
  canApproveFinalDecision: boolean;
};

type PendingAction = {
  action: 'mark' | 'unmark';
  canApproveFinalDecision: boolean;
  nodeId: string;
};

/**
 * Renders one recursive outline row with selection, accordion expansion, and
 * the completion/final-decision toggle for the supported render depths.
 *
 * Both marking (false → true) and unmarking (true → false) route through a
 * confirmation dialog. The approval permission and node id are snapshotted
 * when the dialog opens so a mid-dialog role switch cannot change the action.
 */
export function OutlineNodeItem(props: OutlineNodeItemProps) {
  const { node, depth, indexPath, expandedNodeIdSet, canApproveFinalDecision } =
    props;
  const { t } = useTranslation('Rpb');
  const { onVaeNodeSelect, selectedVaeNodeId } = useRpbVaeNodeUrlState();
  const { canToggleOutlineNodeChecked, toggleOutlineNodeChecked } =
    useRpbOutlineCheckState();
  // eslint-disable-next-line no-restricted-syntax -- pending-action dialog state is ephemeral per-row UI that should not sit in the URL
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );

  const hasChildren = node.children.length > 0;
  const isSelected = selectedVaeNodeId === node.vaeNode.id;
  const isExpanded = expandedNodeIdSet.has(node.vaeNode.id);
  const isChecked = readRelevantCheckedField(
    node.vaeNode,
    canApproveFinalDecision,
  );
  const shouldRenderCheckSlot = depth < 3;
  const canToggleChecked = canToggleOutlineNodeChecked(node.vaeNode.id);
  const prefix = formatNodeNumber(depth, indexPath);
  const label = `${prefix}. ${node.vaeNode.title}`;

  const copyKey = getRoleCopyKey(canApproveFinalDecision);
  const markLabel = t(`gliederung.role.${copyKey}.markLabel`);
  const markedLabel = t(`gliederung.role.${copyKey}.markedLabel`);
  const unmarkLabel = t(`gliederung.role.${copyKey}.unmarkLabel`);
  const actionsMenuAriaLabel = t(
    `gliederung.role.${copyKey}.actionsMenuAriaLabel`,
    { chapter: label },
  );
  const assigneeCompletedIndicator = getAssigneeCompletedIndicator({
    canApproveFinalDecision,
    isAssigneeChecked: node.vaeNode.checkedByAssignee,
    isLeaderChecked: node.vaeNode.checkedByLeader,
    label,
    t,
  });
  const tooltipCopy = isChecked
    ? t(`gliederung.role.${copyKey}.unmarkTooltip`)
    : t(`gliederung.role.${copyKey}.markTooltip`);
  const disabledTooltipCopy = getDisabledTooltipCopy({
    canApproveFinalDecision,
    canToggleChecked,
    t,
  });
  const dialogCopy = pendingAction
    ? getDialogCopy({
        pendingAction,
        t,
      })
    : undefined;
  const cancelLabel = t('gliederung.confirmCancel');

  const rowClassName = cn(
    'focus-ring flex h-8 items-center gap-2 rounded-lg px-1 text-left text-[13px] leading-[18px] tracking-[-0.01em]',
    getOutlineRowStateClassName({ isChecked, isSelected }),
    isSelected && 'selected-ring',
  );

  const handleCheckedChange = (nextChecked: boolean) => {
    setPendingAction({
      action: nextChecked ? 'mark' : 'unmark',
      canApproveFinalDecision,
      nodeId: node.vaeNode.id,
    });
  };

  const handleConfirm = () => {
    if (!pendingAction) {
      return;
    }

    toggleOutlineNodeChecked(
      pendingAction.nodeId,
      pendingAction.canApproveFinalDecision,
    );

    setPendingAction(null);
  };

  return (
    <>
      <AccordionItem key={node.vaeNode.id} value={node.vaeNode.id}>
        <OutlineRow
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          isSelected={isSelected}
          rowClassName={rowClassName}
          label={label}
          nodeId={node.vaeNode.id}
          onSelect={onVaeNodeSelect}
          checkSlotProps={{
            isChecked,
            shouldRenderCheckSlot,
            canToggleChecked,
            markLabel,
            markedLabel,
            unmarkLabel,
            actionsMenuAriaLabel,
            tooltipCopy,
            disabledTooltipCopy,
            assigneeCompletedIndicator,
            onCheckedChange: handleCheckedChange,
          }}
        />
        <OutlineNodeChildren
          childrenNodes={node.children}
          depth={depth}
          indexPath={indexPath}
          expandedNodeIdSet={expandedNodeIdSet}
          canApproveFinalDecision={canApproveFinalDecision}
        />
      </AccordionItem>

      <OutlineConfirmDialog
        open={pendingAction !== null}
        title={dialogCopy?.title ?? ''}
        body={dialogCopy?.body ?? ''}
        confirmLabel={dialogCopy?.confirmLabel ?? ''}
        cancelLabel={cancelLabel}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
