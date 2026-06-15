import { cn } from '@/features/ui/style/cn';
import type { ComponentProps } from 'react';
import type React from 'react';
import { AiSparklesIcon } from './AiSparklesIcon';

export const AI_SPARKLES_CHIP_BACKGROUND =
  'linear-gradient(180deg, var(--effect-gradient-ai-fill-primary) 0%, var(--effect-gradient-ai-fill-secondary) 100%) padding-box, linear-gradient(180deg, var(--effect-gradient-ai-border-primary) 0%, var(--effect-gradient-ai-border-secondary) 100%) border-box';

const AI_SPARKLES_CHIP_BACKGROUND_HOVER =
  'linear-gradient(180deg, var(--effect-gradient-ai-fill-primary-hover) 0%, var(--effect-gradient-ai-fill-secondary-hover) 100%) padding-box, linear-gradient(180deg, var(--effect-gradient-ai-border-primary) 0%, var(--effect-gradient-ai-border-secondary) 100%) border-box';

export const getAiGradientHoverProps = <T extends HTMLElement>() => ({
  onPointerEnter: (e: React.PointerEvent<T>) => {
    e.currentTarget.style.background = AI_SPARKLES_CHIP_BACKGROUND_HOVER;
  },
  onPointerLeave: (e: React.PointerEvent<T>) => {
    e.currentTarget.style.background = AI_SPARKLES_CHIP_BACKGROUND;
  },
  onFocus: (e: React.FocusEvent<T>) => {
    e.currentTarget.style.background = AI_SPARKLES_CHIP_BACKGROUND_HOVER;
  },
  onBlur: (e: React.FocusEvent<T>) => {
    e.currentTarget.style.background = AI_SPARKLES_CHIP_BACKGROUND;
  },
});

const AI_SPARKLES_CHIP_SIZE_CLASSES = {
  sm: 'rounded-[4px] p-1',
  md: 'rounded-[8px] p-2',
} as const;

type AiSparklesChipProps = Omit<ComponentProps<'span'>, 'children'> & {
  size?: keyof typeof AI_SPARKLES_CHIP_SIZE_CLASSES;
  iconClassName?: string;
};

export function AiSparklesChip(props: AiSparklesChipProps) {
  const { size = 'md', className, iconClassName, style, ...restProps } = props;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border-[0.5px] border-transparent shadow-elevated',
        AI_SPARKLES_CHIP_SIZE_CLASSES[size],
        className,
      )}
      style={{
        ...style,
        background: AI_SPARKLES_CHIP_BACKGROUND,
      }}
      {...restProps}
    >
      <AiSparklesIcon className={cn('size-4', iconClassName)} />
    </span>
  );
}
