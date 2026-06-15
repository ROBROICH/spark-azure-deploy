import { useId } from 'react';

export function RunningWorkflowsIcon() {
  const gradientId = useId();
  const maskId = useId();

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="28%" stopColor="#06b6d4" />
          <stop offset="62%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect x="0" y="0" width="24" height="24" fill="black" />
          <g
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="8" height="8" rx="2" />
            <path d="M7 11v4a2 2 0 0 0 2 2h4" />
            <rect x="13" y="13" width="8" height="8" rx="2" />
          </g>
        </mask>
      </defs>

      <rect
        x="0"
        y="0"
        width="24"
        height="24"
        fill={`url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
