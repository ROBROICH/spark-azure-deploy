import { AiButton } from '@/features/ui/ai/AiButton';
import { InfoCard } from '@/features/ui/info-card/InfoCard';
import { CircleCheck, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export type AiTriggerCardStatus = 'empty' | 'progress' | 'success';

type AiTriggerCardProps = {
  ariaLabel?: string;
  body?: ReactNode;
  className?: string;
  collapsedTitle?: ReactNode;
  initialCollapsed?: boolean;
  isStartDisabled?: boolean;
  name: string;
  onStart?: () => void;
  progressActionLabel?: string;
  startDisabledTooltip?: ReactNode;
  startActionLabel?: string;
  status: AiTriggerCardStatus;
  title: ReactNode;
};

const renderLeadingIcon = (status: AiTriggerCardStatus) => {
  if (status === 'success') {
    return <CircleCheck className="size-4" aria-hidden="true" />;
  }

  return <Sparkles className="size-4" aria-hidden="true" />;
};

const renderCollapsedLeadingIcon = (status: AiTriggerCardStatus) => {
  if (status === 'progress') {
    return <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />;
  }

  return renderLeadingIcon(status);
};

/**
 * Shared AI trigger card for first-run, in-progress, and success analysis
 * states.
 */
export function AiTriggerCard(props: AiTriggerCardProps) {
  const {
    ariaLabel,
    body,
    className,
    collapsedTitle,
    initialCollapsed,
    isStartDisabled = false,
    name,
    onStart,
    progressActionLabel,
    startDisabledTooltip,
    startActionLabel,
    status,
    title,
  } = props;
  const action =
    status === 'progress' ? (
      progressActionLabel ? (
        <AiButton
          label={progressActionLabel}
          isLoading
          isDisabled
          className="bg-white"
        />
      ) : null
    ) : startActionLabel ? (
      <AiButton
        label={startActionLabel}
        isDisabled={isStartDisabled || !onStart}
        disabledTooltip={startDisabledTooltip}
        onClick={onStart}
      />
    ) : null;
  const collapsedHeaderAction =
    status === 'empty' && startActionLabel ? (
      <AiButton
        size="sm"
        label={startActionLabel}
        isDisabled={isStartDisabled || !onStart}
        disabledTooltip={startDisabledTooltip}
        onClick={onStart}
      />
    ) : null;
  const resolvedInitialCollapsed =
    initialCollapsed ?? (status === 'success' ? true : false);

  return (
    <InfoCard
      ariaLabel={ariaLabel}
      body={body}
      className={className}
      collapsedHeaderAction={collapsedHeaderAction}
      collapsedTitle={collapsedTitle}
      footer={action}
      initialCollapsed={resolvedInitialCollapsed}
      isCollapsible
      collapsedLeadingIcon={renderCollapsedLeadingIcon(status)}
      leadingIcon={renderLeadingIcon(status)}
      name={name}
      title={title}
      variant="ai"
    />
  );
}
