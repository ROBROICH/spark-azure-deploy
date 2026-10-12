import { Accordion } from '@/features/ui/accordion/Accordion';
import { CompletionIndicator } from '@/features/ui/completion-indicator/CompletionIndicator';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { ListOrdered } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useRpbOutlineCheckState,
  useRpbOutlineExpansionStateContext,
  useRpbOutlineTreeState,
} from '../workspace-state/RpbOutlineContext';
import { OutlineNodeItem } from './OutlineNodeItem';

export const OutlineSwimlane = () => {
  const { t } = useTranslation('Rpb');
  const { outlineTree } = useRpbOutlineTreeState();
  const { canApproveFinalDecision, outlineCheckedStateById } =
    useRpbOutlineCheckState();
  const { expandedNodeIds, expandedNodeIdSet, setExpandedNodeIds } =
    useRpbOutlineExpansionStateContext();
  const copyKey = canApproveFinalDecision ? 'leader' : 'assignee';
  const totalTopLevelOutlineItems = outlineTree.length;
  const checkedTopLevelOutlineItems = outlineTree.filter(
    (node) => outlineCheckedStateById.get(node.vaeNode.id) === true,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SwimlaneHeaderPortal>
        <span
          aria-hidden="true"
          className="hidden rounded-lg bg-bg-quaternary p-2 lg:inline-flex"
        >
          <ListOrdered className="size-4" />
        </span>
        <span className="flex-1 text-left">{t('gliederung.title')}</span>
        <CompletionIndicator
          completed={checkedTopLevelOutlineItems}
          total={totalTopLevelOutlineItems}
          className="shrink-0 px-0 py-0"
        >
          {t(`gliederung.role.${copyKey}.completedSummary`, {
            checked: checkedTopLevelOutlineItems,
            total: totalTopLevelOutlineItems,
          })}
        </CompletionIndicator>
      </SwimlaneHeaderPortal>
      <div className="flex-1 overflow-y-auto p-3 **:data-[slot=accordion-content]:overflow-x-visible **:data-[slot=accordion-content]:overflow-y-clip">
        <Accordion
          type="multiple"
          value={expandedNodeIds}
          onValueChange={setExpandedNodeIds}
          className="flex flex-col gap-2"
        >
          {outlineTree.map((node, index) => (
            <OutlineNodeItem
              key={node.vaeNode.id}
              node={node}
              depth={0}
              indexPath={[index]}
              expandedNodeIdSet={expandedNodeIdSet}
              canApproveFinalDecision={canApproveFinalDecision}
            />
          ))}
        </Accordion>
      </div>
    </div>
  );
};
