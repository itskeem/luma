import type { ReactNode, SVGProps } from "react";

function Svg({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false" {...p}>
      {children}
    </svg>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const PlayIcon = () => (
  <Svg>
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" fill="currentColor" />
  </Svg>
);
export const PauseIcon = () => (
  <Svg>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </Svg>
);
export const NextIcon = () => (
  <Svg>
    <path d="M6 6.2v11.6a.6.6 0 0 0 .95.5l8.1-5.8a.6.6 0 0 0 0-1L6.95 5.7a.6.6 0 0 0-.95.5z" fill="currentColor" />
    <rect x="16.5" y="5.5" width="2.2" height="13" rx="1.1" fill="currentColor" />
  </Svg>
);
export const PrevIcon = () => (
  <Svg>
    <path d="M18 6.2v11.6a.6.6 0 0 1-.95.5l-8.1-5.8a.6.6 0 0 1 0-1l8.1-5.8a.6.6 0 0 1 .95.5z" fill="currentColor" />
    <rect x="5.3" y="5.5" width="2.2" height="13" rx="1.1" fill="currentColor" />
  </Svg>
);
export const NoteIcon = () => (
  <Svg {...stroke}>
    <path d="M9 18V6.5l10-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);
export const MusicIcon = NoteIcon;
export const TimerIcon = () => (
  <Svg {...stroke}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4.2l2.6 1.6M9.5 3.5h5" />
  </Svg>
);
export const SlidersIcon = () => (
  <Svg {...stroke}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);
export const ChevronUpIcon = () => (
  <Svg {...stroke}>
    <path d="M6.5 14.5 12 9l5.5 5.5" />
  </Svg>
);
export const ResetIcon = () => (
  <Svg {...stroke}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4" />
  </Svg>
);
export const SkipIcon = () => (
  <Svg {...stroke}>
    <path d="M6 6.5v11l8-5.5-8-5.5zM17.5 6v12" />
  </Svg>
);
