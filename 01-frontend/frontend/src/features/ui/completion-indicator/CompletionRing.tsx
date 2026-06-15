import { cn } from '@/features/ui/style/cn';

const CIRCLE_RADIUS = 10;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

type CompletionRingProps = {
  percentage: number;
  className?: string;
};

/** Small circular progress ring showing a percentage as a filled arc. */
export const CompletionRing = (props: CompletionRingProps) => {
  const { percentage, className } = props;
  const normalizedPercentage = Math.max(0, Math.min(100, percentage));
  const offset = CIRCLE_CIRCUMFERENCE * (1 - normalizedPercentage / 100);

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-4', className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r={CIRCLE_RADIUS}
        fill="none"
        stroke="#CBD5E1"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r={CIRCLE_RADIUS}
        fill="none"
        stroke="#166534"
        strokeWidth="2"
        strokeDasharray={`${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
};
