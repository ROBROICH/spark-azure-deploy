import { AiButton } from '@/features/ui/ai/AiButton';
import { Button } from '@/features/ui/button/Button';
import { InfoCard } from '@/features/ui/info-card/InfoCard';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type AiOutdatedTriggerCardAction = {
  disabled?: boolean;
  label: string;
  onClick?: () => void;
};

type AiOutdatedTriggerCardRefreshAction = AiOutdatedTriggerCardAction & {
  disabledTooltip?: ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
};

type AiOutdatedTriggerCardProps = {
  ariaLabel?: string;
  body: ReactNode;
  className?: string;
  initialCollapsed?: boolean;
  name: string;
  refreshAction?: AiOutdatedTriggerCardRefreshAction;
  title: ReactNode;
  versionAction?: AiOutdatedTriggerCardAction;
};

const warningIcon = <CircleAlert className="size-4" aria-hidden="true" />;
const loadingIcon = (
  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
);

/**
 * Renders the shared yellow outdated-KI trigger card with persisted collapse
 * state and optional version/refresh actions.
 *
 * @param props Card copy, collapse configuration, and optional action models.
 * @returns A collapsible warning card for outdated generated results.
 */
export function AiOutdatedTriggerCard(props: AiOutdatedTriggerCardProps) {
  const {
    ariaLabel,
    body,
    className,
    initialCollapsed = false,
    name,
    refreshAction,
    title,
    versionAction,
  } = props;
  const refreshLabel =
    refreshAction?.isLoading && refreshAction.loadingLabel
      ? refreshAction.loadingLabel
      : refreshAction?.label;
  const hasActions = versionAction !== undefined || refreshAction !== undefined;
  const footer = hasActions ? (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 [&>span]:max-w-full [&>span]:min-w-0">
      {versionAction ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={versionAction.disabled || !versionAction.onClick}
          onClick={versionAction.onClick}
        >
          {versionAction.label}
        </Button>
      ) : null}
      {refreshAction && refreshLabel ? (
        <AiButton
          size="sm"
          className="h-8 max-w-full gap-2 rounded-lg pr-3 pl-2"
          label={refreshLabel}
          isLoading={refreshAction.isLoading}
          isDisabled={
            refreshAction.disabled ||
            refreshAction.isLoading ||
            !refreshAction.onClick
          }
          disabledTooltip={refreshAction.disabledTooltip}
          onClick={refreshAction.onClick}
        />
      ) : null}
    </div>
  ) : null;

  return (
    <InfoCard
      ariaLabel={ariaLabel}
      body={body}
      className={className}
      footer={footer}
      initialCollapsed={initialCollapsed}
      isCollapsible
      collapsedLeadingIcon={
        refreshAction?.isLoading ? loadingIcon : warningIcon
      }
      leadingIcon={warningIcon}
      name={name}
      title={title}
      variant="warning"
    />
  );
}
