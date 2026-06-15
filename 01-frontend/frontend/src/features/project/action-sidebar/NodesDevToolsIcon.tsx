import { useId } from 'react';

export function NodesDevToolsIcon() {
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
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="24%" stopColor="#f59e0b" />
          <stop offset="48%" stopColor="#facc15" />
          <stop offset="72%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#f472b6" />
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
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
            <path d="M6.453 15h11.094" />
            <path d="M8.5 2h7" />
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
