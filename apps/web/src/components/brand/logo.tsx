import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  animate?: boolean;
  style?: React.CSSProperties;
}

export function Logo({ className = 'h-6 w-6', animate = false, style }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className, animate && 'animate-glow-pulse')}
      style={style}
    >
      {/* Hexagonal crystal — "Cryo" = cold/tech */}
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        className="stroke-current"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner facets */}
      <path
        d="M16 2V16M4 9L16 16M28 9L16 16"
        className="stroke-current"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Center glow dot */}
      <circle cx="16" cy="16" r="2.5" className="fill-current" opacity="0.8" />
      {/* Top accent facet */}
      <path
        d="M16 2L28 9L16 16Z"
        className="fill-current"
        opacity="0.1"
      />
    </svg>
  );
}
