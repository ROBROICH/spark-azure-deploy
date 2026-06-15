import {
  ArgumentCard,
  ArgumentCardBadge,
  ArgumentCardBody,
  ArgumentCardFooter,
  ArgumentCardHeader,
  ArgumentCardMetadata,
  ArgumentCardTags,
  ArgumentCardTitle,
} from '@/features/ui/cards/argument-card/ArgumentCard';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { MessageCircleWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import { resolveEwmsClassificationState } from '../../data/ewms.nodes';
import { ArgumentItemsList } from './ArgumentItemsList';

type ArgumentsListProps = {
  selectedObjection: EwmsObjectionListItem | undefined;
  isLoading: boolean;
  argumentsList: EwmsArgumentNode[];
  entriesById: Map<string, EwmsBeteiligungsEingang>;
  topics: EwmsTopicNode[];
  onDeleteArgument: (argument: EwmsArgumentNode) => void;
  onToggleArgument: (argument: EwmsArgumentNode) => void;
  onUpdateArgumentTopic: (argument: EwmsArgumentNode, topicId: string) => void;
  onUpdateArgumentSubtopic: (
    argument: EwmsArgumentNode,
    subtopicId: string,
  ) => void;
  onReviewArgumentClassification: (
    argument: EwmsArgumentNode,
    isAccepted: boolean,
  ) => void;
  onSelectArgument?: (argumentId: string, trigger: HTMLElement) => void;
};

const ARGUMENT_SKELETON_COUNT = 3;

const ArgumentsLoadingSkeleton = () => {
  const { t } = useTranslation('Ewms');

  return (
    <div
      role="status"
      aria-label={t('arguments.loading')}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
      {...skeletonListProps}
    >
      {Array.from({ length: ARGUMENT_SKELETON_COUNT }).map((_, index) => (
        <ArgumentCard key={index}>
          <ArgumentCardHeader>
            <ArgumentCardBadge>
              <Skeleton className="size-5 rounded-full" />
            </ArgumentCardBadge>
            <ArgumentCardTitle className="w-24">
              <Skeleton className="h-4 w-full" />
            </ArgumentCardTitle>
          </ArgumentCardHeader>
          <ArgumentCardBody className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </ArgumentCardBody>
          <ArgumentCardMetadata>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </ArgumentCardMetadata>
          <ArgumentCardFooter>
            <ArgumentCardTags>
              <Skeleton className="h-6 w-24 rounded" />
              <Skeleton className="h-6 w-28 rounded" />
            </ArgumentCardTags>
            <Skeleton className="h-7 w-20 rounded" />
          </ArgumentCardFooter>
        </ArgumentCard>
      ))}
    </div>
  );
};

export const ArgumentsList = (props: ArgumentsListProps) => {
  const {
    selectedObjection,
    isLoading,
    argumentsList,
    entriesById,
    topics,
    onDeleteArgument,
    onToggleArgument,
    onUpdateArgumentTopic,
    onUpdateArgumentSubtopic,
    onReviewArgumentClassification,
    onSelectArgument,
  } = props;
  const { t } = useTranslation('Ewms');
  const classificationState = resolveEwmsClassificationState(selectedObjection);
  const selectedEntryId = selectedObjection?.entry.id;

  if (!selectedObjection) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-text-secondary">
        <MessageCircleWarning className="size-8 opacity-40" />
        <p className="text-body-s">{t('arguments.empty')}</p>
      </div>
    );
  }

  if (
    classificationState === 'loading' ||
    (isLoading && argumentsList.length === 0)
  ) {
    return <ArgumentsLoadingSkeleton />;
  }

  if (classificationState === 'failed') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-text-secondary">
        <MessageCircleWarning className="size-8 opacity-40" />
        <p className="text-body-s">{t('arguments.classificationFailed')}</p>
      </div>
    );
  }

  if (!selectedEntryId || !entriesById.has(selectedEntryId)) {
    return <ArgumentsLoadingSkeleton />;
  }

  return (
    <ArgumentItemsList
      argumentsList={argumentsList}
      entriesById={entriesById}
      topics={topics}
      onDeleteArgument={onDeleteArgument}
      onToggleArgument={onToggleArgument}
      onUpdateArgumentTopic={onUpdateArgumentTopic}
      onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
      onReviewArgumentClassification={onReviewArgumentClassification}
      onSelectArgument={onSelectArgument}
    />
  );
};
