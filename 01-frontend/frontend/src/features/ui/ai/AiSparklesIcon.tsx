import { Sparkles } from 'lucide-react';
import { useId } from 'react';

type AiSparklesIconProps = {
  className?: string;
  disabled?: boolean;
};

export function AiSparklesIcon(props: AiSparklesIconProps) {
  const { className, disabled = false } = props;
  const rawId = useId();
  const gradientId = `sg${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              offset="0%"
              stopColor={
                disabled
                  ? 'var(--effect-gradient-ai-text-icon-disabled)'
                  : 'var(--effect-gradient-ai-text-icon-primary)'
              }
            />
            <stop
              offset="100%"
              stopColor={
                disabled
                  ? 'var(--effect-gradient-ai-text-icon-disabled)'
                  : 'var(--effect-gradient-ai-text-icon-secondary)'
              }
            />
          </linearGradient>
        </defs>
      </svg>
      <Sparkles
        aria-hidden="true"
        className={className ?? 'size-4 shrink-0'}
        stroke={`url(#${gradientId})`}
      />
    </>
  );
}
