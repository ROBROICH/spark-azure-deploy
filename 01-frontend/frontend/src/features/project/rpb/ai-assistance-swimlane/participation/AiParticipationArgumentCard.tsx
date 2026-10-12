import {
  ArgumentCard,
  ArgumentCardBadge,
  ArgumentCardBody,
  ArgumentCardFooter,
  ArgumentCardHeader,
  ArgumentCardTitle,
} from '@/features/ui/cards/argument-card/ArgumentCard';
import { AiSuggestionBadge } from '@/features/ui/ai-suggestion-badge/AiSuggestionBadge';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { cn } from '@/features/ui/style/cn';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getRpbArgumentReference,
  type RpbArgumentNode,
} from './rpbParticipationArguments';

type AiParticipationArgumentCardProps = {
  argument: RpbArgumentNode;
  canMutate: boolean;
  onToggleInBeschluss: (argument: RpbArgumentNode) => void;
};

type ParticipationStatusButtonProps = {
  argumentReference: string;
  inBeschluss: boolean;
  disabled: boolean;
  onClick: () => void;
};

const ParticipationStatusButton = (props: ParticipationStatusButtonProps) => {
  const { argumentReference, disabled, inBeschluss, onClick } = props;
  const { t } = useTranslation('Rpb');
  const actionLabel = t(
    inBeschluss
      ? 'aiAssistance.participationDetailStatus.removeFromBeschluss'
      : 'aiAssistance.participationDetailStatus.addToBeschluss',
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={inBeschluss}
      aria-label={`${actionLabel}: ${argumentReference}`}
      className={cn(
        'focus-ring flex items-center rounded shadow-[0px_4px_16px_rgba(2,6,23,0.1),0px_2px_4px_rgba(2,6,23,0.1),inset_0px_-4px_8px_rgba(2,6,23,0.05)] disabled:cursor-not-allowed disabled:opacity-60',
        inBeschluss ? 'bg-green-800' : 'bg-brand-950',
      )}
    >
      <span className="px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-white">
        {t(
          inBeschluss
            ? 'aiAssistance.participationDetailStatus.imBeschluss'
            : 'aiAssistance.participationDetailStatus.offen',
        )}
      </span>
      <span className="border-l border-l-[0.5px] border-white/30 p-1">
        <Check
          aria-hidden="true"
          className="size-3 text-white/30"
          strokeWidth={3}
        />
      </span>
    </button>
  );
};

export const AiParticipationArgumentCard = (
  props: AiParticipationArgumentCardProps,
) => {
  const { argument, canMutate, onToggleInBeschluss } = props;
  const { t } = useTranslation('Rpb');
  const isValid = Boolean(argument.isValidArgument);
  const reference = getRpbArgumentReference(argument);
  const body =
    argument.text?.trim() ||
    argument.context?.trim() ||
    t('aiAssistance.participationArgumentEmptyText');

  return (
    <ArgumentCard
      variant={isValid && argument.inVae ? 'success' : 'default'}
      className={cn(!isValid && 'border-slate-200 bg-slate-50 shadow-none')}
    >
      <ArgumentCardHeader className={!isValid ? 'bg-slate-100' : undefined}>
        <ArgumentCardBadge className={!isValid ? 'opacity-50' : undefined}>
          <AiSuggestionBadge iconOnly />
        </ArgumentCardBadge>
        <ArgumentCardTitle
          className={
            !isValid
              ? 'bg-none text-slate-500 group-data-[variant=success]:text-slate-500'
              : undefined
          }
        >
          {reference}
        </ArgumentCardTitle>
      </ArgumentCardHeader>
      <ArgumentCardBody className={!isValid ? 'text-slate-500' : undefined}>
        {body}
      </ArgumentCardBody>
      {isValid ? (
        <ArgumentCardFooter>
          <ParticipationStatusButton
            argumentReference={reference}
            inBeschluss={argument.inVae}
            disabled={!canMutate}
            onClick={() => onToggleInBeschluss(argument)}
          />
        </ArgumentCardFooter>
      ) : null}
    </ArgumentCard>
  );
};

export const AiParticipationArgumentCardSkeleton = () => {
  return (
    <div className="overflow-hidden rounded-lg border-[0.5px] border-slate-300 bg-white">
      <div className="flex h-8 items-center gap-2 bg-slate-100 px-1">
        <Skeleton className="size-5 rounded-sm" aria-hidden />
        <Skeleton className="h-4 flex-1" aria-hidden />
      </div>
      <div className="flex flex-col gap-2 px-3 py-2">
        <Skeleton className="h-4 w-full" aria-hidden />
        <Skeleton className="h-4 w-11/12" aria-hidden />
        <Skeleton className="h-4 w-9/12" aria-hidden />
      </div>
      <div className="flex justify-end p-1">
        <Skeleton className="h-6 w-24 rounded" aria-hidden />
      </div>
    </div>
  );
};
