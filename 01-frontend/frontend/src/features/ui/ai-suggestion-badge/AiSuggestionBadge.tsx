// Replaces Badge variant="ai" (flat chip with Zap icon, pending deprecation).
// This component uses the gradient-border pill design for AI-generated field values
// in form and review contexts — a more prominent visual treatment than the legacy chip.
import { cn } from '@/features/ui/style/cn';
import { AI_SPARKLES_CHIP_BACKGROUND } from '@/features/ui/ai/AiSparklesChip';
import { AiSparklesIcon } from '@/features/ui/ai/AiSparklesIcon';
import { useTranslation } from 'react-i18next';

type AiSuggestionBadgeProps = {
  iconOnly?: boolean;
};

const AiSuggestionBadge = (props: AiSuggestionBadgeProps) => {
  const { iconOnly = false } = props;
  const { t } = useTranslation('shared');

  return (
    <span
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? t('aiSuggestionBadge.label') : undefined}
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded border-[0.5px] border-transparent',
        'shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1),inset_0px_-4px_8px_0px_rgba(2,6,23,0.05)]',
        iconOnly ? 'p-1' : 'gap-1.5 py-1 pr-2 pl-1',
      )}
      style={{ background: AI_SPARKLES_CHIP_BACKGROUND }}
    >
      <AiSparklesIcon />
      {!iconOnly && (
        <span className="bg-linear-to-b from-[rgba(147,51,234,1)] to-[rgba(88,28,135,1)] bg-clip-text text-[11px] leading-4 font-medium tracking-[0.02em] text-transparent">
          {t('aiSuggestionBadge.label')}
        </span>
      )}
    </span>
  );
};

export { AiSuggestionBadge };
