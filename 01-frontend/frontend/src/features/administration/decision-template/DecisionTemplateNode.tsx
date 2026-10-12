import { Button } from '@/features/ui/button/Button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdministrationDeleteButton } from '../AdministrationDeleteButton';
import type { BeschlussTreeNode } from './beschlussTree';
import { useDecisionTemplateContext } from './DecisionTemplateContext';
import { DecisionTemplateNodeFields } from './DecisionTemplateNodeFields';

export type DecisionTemplateNodeProps = {
  treeNode: BeschlussTreeNode;
  siblingIndex: number;
  siblingCount: number;
};

/**
 * Renders one Beschluss template node and recursively nests its children.
 *
 * Recursion matches the nested parent_vae_node_id tree; structural actions stay
 * on the row so create-below and sibling reorder cannot form cycles.
 *
 * @param props Tree node and sibling position for up/down buttons.
 * @returns The expandable node row, editor, and child nodes.
 */
export function DecisionTemplateNode(props: DecisionTemplateNodeProps) {
  const { treeNode, siblingIndex, siblingCount } = props;
  const { node, children } = treeNode;
  const { t } = useTranslation('Administration');
  const { disabled, onDispatch, onAddChild, onRemove } =
    useDecisionTemplateContext();
  // eslint-disable-next-line no-restricted-syntax -- expanded node only controls local tree visibility
  const [open, setOpen] = useState(false);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblingCount - 1;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-1">
        <div className="flex min-h-8 items-center gap-1 rounded-[8px] border border-border-primary bg-neutral-white px-2 py-1">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t(
                open ? 'decisionTemplate.collapse' : 'decisionTemplate.expand',
                { title: node.title },
              )}
            >
              {open ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          </CollapsibleTrigger>
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {node.title}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            disabled={disabled || !canMoveUp}
            aria-label={t('decisionTemplate.moveUp', { title: node.title })}
            onClick={() =>
              onDispatch({
                type: 'moveSibling',
                nodeId: node.id,
                direction: 'up',
              })
            }
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            disabled={disabled || !canMoveDown}
            aria-label={t('decisionTemplate.moveDown', { title: node.title })}
            onClick={() =>
              onDispatch({
                type: 'moveSibling',
                nodeId: node.id,
                direction: 'down',
              })
            }
          >
            <ArrowDown aria-hidden />
          </Button>
          {node.can_add_child ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              disabled={disabled}
              aria-label={t('decisionTemplate.addChildAria', {
                title: node.title,
              })}
              onClick={() => onAddChild(node.id)}
            >
              <Plus aria-hidden />
            </Button>
          ) : null}
          <AdministrationDeleteButton
            variant="ghost"
            size="sm"
            iconOnly
            className="shrink-0"
            disabled={disabled}
            aria-label={t('decisionTemplate.removeNode', { title: node.title })}
            onConfirm={() => onRemove(node.id)}
          >
            <Trash2 aria-hidden />
          </AdministrationDeleteButton>
        </div>
        <CollapsibleContent>
          <DecisionTemplateNodeFields node={node} />
          {children.length > 0 ? (
            <div className="ml-4 flex flex-col gap-1">
              {children.map((child, index) => (
                <DecisionTemplateNode
                  key={child.node.id}
                  treeNode={child}
                  siblingIndex={index}
                  siblingCount={children.length}
                />
              ))}
            </div>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
