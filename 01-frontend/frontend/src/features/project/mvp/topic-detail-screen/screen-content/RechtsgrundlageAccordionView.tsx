import { AggregatedLawChangeIndicatorView } from '@/features/project/law-changes/ui/AggregatedLawChangeIndicator';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
} from '@/features/ui/accordion/Accordion';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import {
  Header as AccordionHeader,
  Trigger as AccordionTriggerPrimitive,
} from '@radix-ui/react-accordion';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isTopicNormChecked,
  type TopicNormLawGroup,
} from '../screen-data/useRechtsgrundlageData.helpers';

type RechtsgrundlageAccordionViewProps = {
  lawGroups: TopicNormLawGroup[];
  lawChanges: LawChangeRecord[];
  openLawGroupId: string | null;
  onOpenLawGroupChange: (lawGroupId: string | null) => void;
  renderLawGroupContent: (lawGroup: TopicNormLawGroup) => ReactNode;
};

export const RechtsgrundlageAccordionView = (
  props: RechtsgrundlageAccordionViewProps,
) => {
  const {
    lawGroups,
    lawChanges,
    openLawGroupId,
    onOpenLawGroupChange,
    renderLawGroupContent,
  } = props;
  const { t } = useTranslation('MvpRedesign');

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <Accordion
          type="single"
          collapsible
          value={openLawGroupId ?? ''}
          onValueChange={(value) => {
            onOpenLawGroupChange(value || null);
          }}
        >
          {lawGroups.map((group) => {
            const isOpen = group.id === openLawGroupId;
            const lawGroupLabel = group.topicNorms.at(0)?.jurabk ?? group.id;
            const reviewedInGroup = group.topicNorms.filter((topicNorm) =>
              isTopicNormChecked(topicNorm),
            ).length;

            return (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionHeader className="flex" asChild>
                  <div className="flex items-center">
                    <AccordionTriggerPrimitive className="focus-ring flex flex-1 cursor-pointer flex-wrap items-center gap-2 px-2 py-2 disabled:pointer-events-none disabled:opacity-50">
                      <AccordionChevron />
                      <span className="flex-1 text-left text-[13px] font-semibold text-[#1E1D49]">
                        {lawGroupLabel}
                      </span>
                      <StatusBadge
                        variant={reviewedInGroup > 0 ? 'success' : 'default'}
                      >
                        {t('RechtsgrundlagePanel.normenGeprueft', {
                          done: reviewedInGroup,
                          total: group.topicNorms.length,
                        })}
                      </StatusBadge>
                    </AccordionTriggerPrimitive>
                    <span className="inline-flex shrink-0 pr-2">
                      <AggregatedLawChangeIndicatorView
                        lawChanges={lawChanges}
                        norms={group.topicNorms.map((topicNorm) => ({
                          jurabk: topicNorm.jurabk,
                          paragraphNr: topicNorm.paragraphNr,
                        }))}
                      />
                    </span>
                  </div>
                </AccordionHeader>
                <AccordionContent>
                  {isOpen ? renderLawGroupContent(group) : null}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
};
