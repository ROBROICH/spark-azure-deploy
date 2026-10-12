import { cn } from '@/features/ui/style/cn';
import { useId } from 'react';
import { Star } from 'lucide-react';
import { TooltipWrapper } from '../tooltip/TooltipWrapper';
import { Button } from '../button/Button';

type StarButtonProps = {
  isFavorite: boolean;
  onToggle: () => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  limitTooltip?: string;
};

export const StarButton = (props: StarButtonProps) => {
  const {
    isFavorite,
    onToggle,
    ariaLabel,
    className,
    size = 'default',
    limitTooltip,
  } = props;

  const limitDescId = useId();
  const showLimitTooltip = !!limitTooltip && !isFavorite;

  const button = (
    <Button
      iconOnly
      variant="ghost"
      className="group"
      size={size}
      aria-label={ariaLabel}
      aria-pressed={isFavorite}
      aria-describedby={showLimitTooltip ? limitDescId : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
    >
      <Star
        className={cn(
          // Windows Contrast Mode doesn't remap the brand-blue fill/stroke, so it
          // vanishes on dark themes; pin the icon to system colors. (A11y 399)
          'mx-0 transition-all duration-200 group-active:scale-110 forced-colors:text-[color:CanvasText]',
          isFavorite
            ? 'fill-brand-950 text-brand-950 forced-colors:fill-[CanvasText]'
            : showLimitTooltip
              ? 'text-brand-950 opacity-40'
              : 'text-brand-950 group-hover:fill-brand-950 group-hover:text-brand-950 forced-colors:group-hover:fill-[CanvasText]',
          className,
        )}
      />
      {showLimitTooltip && (
        <span id={limitDescId} className="sr-only">
          {limitTooltip}
        </span>
      )}
    </Button>
  );

  if (showLimitTooltip) {
    return <TooltipWrapper content={limitTooltip}>{button}</TooltipWrapper>;
  }

  return button;
};
