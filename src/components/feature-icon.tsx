import type { ReactElement } from "react";

const iconPaths: Record<string, ReactElement> = {
  room: (
    <g>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
      <path d="M8.5 15.5c0-2 3.5-2 3.5-2s3.5 0 3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </g>
  ),
  ai: (
    <g>
      <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </g>
  ),
  tasks: (
    <g>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M8 10l2.5 2.5L16 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="8" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  friends: (
    <g>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="16" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 19c0-3.5 3.5-5 7-5s7 1.5 7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M17 14c2.5 0 5 1 5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </g>
  ),
  timeline: (
    <g>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="6" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="18" r="2" fill="currentColor" />
      <line x1="14" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  expert: (
    <g>
      <circle cx="12" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M12 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 21c0-2.5 2-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M15 7l2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 7L7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 6V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
};

interface FeatureIconProps {
  icon: string;
  className?: string;
}

export default function FeatureIcon({ icon, className = "" }: FeatureIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${className}`}
      aria-hidden="true"
    >
      {iconPaths[icon] ?? iconPaths.ai}
    </svg>
  );
}
