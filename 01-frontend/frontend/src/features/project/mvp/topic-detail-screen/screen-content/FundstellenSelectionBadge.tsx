import { Badge } from '@/features/ui/badge/Badge';
import { OverflowTooltip } from '@/features/ui/tooltip/Tooltip';
import { File, Scale, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type FundstellenSelectionBadgeProps = {
  kind: 'document' | 'norm';
  label: string;
  onRemove: () => void;
};

export function FundstellenSelectionBadge(
  props: FundstellenSelectionBadgeProps,
) {
  const { kind, label, onRemove } = props;
  const { t } = useTranslation('MvpRedesign');
  const Icon = kind === 'document' ? File : Scale;

  return (
    <Badge
      variant="secondary"
      size="small"
      className="inline-flex max-w-full min-w-0 translate-y-[-1px] items-center gap-1.5 align-middle"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <OverflowTooltip content={label} side="top">
        <span
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor inside TooltipTrigger asChild; tabIndex makes truncated text keyboard-accessible
          tabIndex={0}
          className="focus-ring max-w-56 min-w-0 truncate rounded sm:max-w-70"
        >
          {label}
        </span>
      </OverflowTooltip>
      <button
        type="button"
        className="focus-ring shrink-0 rounded-sm text-text-secondary transition-colors hover:text-text-primary"
        aria-label={t('FundstellenTabContent.removeSelectionAriaLabel', {
          label,
        })}
        onClick={onRemove}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}
