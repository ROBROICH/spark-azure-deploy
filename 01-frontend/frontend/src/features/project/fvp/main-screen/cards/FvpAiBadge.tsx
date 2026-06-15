import { AI_SPARKLES_CHIP_BACKGROUND } from '@/features/ui/ai/AiSparklesChip';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

const SPARKLE_PATH =
  'M13.3336 1.3337V4.0003M14.667 2.667H12.0003M7.345 1.8763C7.3735 1.7234 7.4547 1.5852 7.5744 1.4858C7.694 1.3864 7.8447 1.332 8.0003 1.332C8.1559 1.332 8.3065 1.3864 8.4262 1.4858C8.5459 1.5852 8.6271 1.7234 8.6556 1.8763L9.3563 5.5816C9.4061 5.8451 9.5341 6.0874 9.7236 6.2769C9.9132 6.4665 10.1555 6.5945 10.419 6.6443L14.1243 7.345C14.2772 7.3735 14.4154 7.4547 14.5147 7.5744C14.6141 7.694 14.6686 7.8447 14.6686 8.0003C14.6686 8.1559 14.6141 8.3065 14.5147 8.4262C14.4154 8.5459 14.2772 8.6271 14.1243 8.6556L10.419 9.3563C10.1555 9.4061 9.9132 9.5341 9.7236 9.7236C9.5341 9.9132 9.4061 10.1555 9.3563 10.419L8.6556 14.1243C8.6271 14.2772 8.5459 14.4154 8.4262 14.5147C8.3065 14.6141 8.1559 14.6686 8.0003 14.6686C7.8447 14.6686 7.694 14.6141 7.5744 14.5147C7.4547 14.4154 7.3735 14.2772 7.345 14.1243L6.6443 10.419C6.5945 10.1555 6.4665 9.9132 6.2769 9.7236C6.0874 9.5341 5.8451 9.4061 5.5816 9.3563L1.8763 8.6556C1.7234 8.6271 1.5852 8.5459 1.4858 8.4262C1.3864 8.3065 1.332 8.1559 1.332 8.0003C1.332 7.8447 1.3864 7.694 1.4858 7.5744C1.5852 7.4547 1.7234 7.3735 1.8763 7.345L5.5816 6.6443C5.8451 6.5945 6.0874 6.4665 6.2769 6.2769C6.4665 6.0874 6.5945 5.8451 6.6443 5.5816L7.345 1.8763ZM4.0003 13.3337C4.0003 14.07 3.4033 14.667 2.667 14.667C1.9306 14.667 1.3336 14.07 1.3336 13.3337C1.3336 12.5973 1.9306 12.0003 2.667 12.0003C3.4033 12.0003 4.0003 12.5973 4.0003 13.3337Z';

export const FvpAiBadge = () => {
  const { t } = useTranslation('shared');
  const rawId = useId();
  const gradientId = `fvpAiIcon${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <span
      role="img"
      aria-label={t('aiSuggestionBadge.label')}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-[4px] border-[0.5px] border-transparent shadow-elevated"
      style={{ background: AI_SPARKLES_CHIP_BACKGROUND }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="8"
            y1="1.332"
            x2="8"
            y2="14.6686"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#9333EA" />
            <stop offset="100%" stopColor="#581C87" />
          </linearGradient>
        </defs>
        <path
          d={SPARKLE_PATH}
          stroke={`url(#${gradientId})`}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};
