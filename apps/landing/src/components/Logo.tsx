import React from 'react';

interface LogoProps {
  className?: string;
  animate?: boolean;
  style?: React.CSSProperties;
}

export const Logo: React.FC<LogoProps> = ({ className = 'h-6 w-6', animate = false, style }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${animate ? 'animate-pulse' : ''}`}
      style={style}
    >
      {/* Hexagonal crystal — "Cryo" = cold/tech */}
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        className="stroke-current"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner facets */}
      <path
        d="M16 2V16M4 9L16 16M28 9L16 16"
        className="stroke-current"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* Center glow dot */}
      <circle cx="16" cy="16" r="2.5" className="fill-current" opacity="0.9" />
      {/* Top accent facet */}
      <path
        d="M16 2L28 9L16 16Z"
        className="fill-current"
        opacity="0.15"
      />
    </svg>
  );
};
