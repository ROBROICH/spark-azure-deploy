type StatusProgressRingProps = {
  processed: number;
  total: number;
};

const SIZE = 20;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const StatusProgressRing = (props: StatusProgressRingProps) => {
  const { processed, total } = props;
  const ratio = total > 0 ? Math.min(Math.max(processed / total, 0), 1) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <svg
      role="img"
      aria-hidden
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="text-border-secondary"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        className="text-green-800"
      />
    </svg>
  );
};
