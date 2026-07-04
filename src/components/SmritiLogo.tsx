interface SmritiLogoProps {
  size?: number;
  className?: string;
}

export function SmritiLogo({ size = 40, className = "" }: SmritiLogoProps) {
  return (
    <svg
      className={`smriti-logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="smriti-ring" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB347" />
          <stop offset="0.45" stopColor="#FF6B6B" />
          <stop offset="1" stopColor="#C44BD4" />
        </linearGradient>
        <linearGradient id="smriti-petal" x1="32" y1="10" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD56B" />
          <stop offset="1" stopColor="#FF8C42" />
        </linearGradient>
        <radialGradient id="smriti-core" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(10)">
          <stop stopColor="#FFF4D6" />
          <stop offset="1" stopColor="#FFB347" />
        </radialGradient>
        <filter id="smriti-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="32" cy="32" r="28" stroke="url(#smriti-ring)" strokeWidth="1.5" opacity="0.55" />
      <circle cx="32" cy="32" r="22" stroke="url(#smriti-ring)" strokeWidth="0.75" opacity="0.25" strokeDasharray="3 5" />

      <g filter="url(#smriti-glow)">
        <path
          d="M32 14 C26 18 22 24 22 32 C22 40 26 46 32 50 C38 46 42 40 42 32 C42 24 38 18 32 14 Z"
          fill="url(#smriti-petal)"
          opacity="0.95"
        />
        <path
          d="M32 50 C28 44 24 38 14 36 C18 32 24 30 32 32 C40 30 46 32 50 36 C40 38 36 44 32 50 Z"
          fill="url(#smriti-petal)"
          opacity="0.75"
        />
        <path
          d="M32 50 C36 44 40 38 50 36 C46 32 40 30 32 32 C24 30 18 32 14 36 C24 38 28 44 32 50 Z"
          fill="url(#smriti-petal)"
          opacity="0.75"
        />
        <path
          d="M32 14 C38 18 42 24 42 32 C42 36 40 40 32 42 C24 40 22 36 22 32 C22 24 26 18 32 14 Z"
          fill="url(#smriti-petal)"
          opacity="0.55"
        />
      </g>

      <path
        d="M32 20 C29 26 28 32 32 38 C36 32 35 26 32 20 Z"
        fill="url(#smriti-core)"
      />
      <circle cx="32" cy="30" r="2.5" fill="#FFF8EB" />

      <path
        d="M32 8 L33.5 12.5 L32 11 L30.5 12.5 Z"
        fill="#FFD56B"
        opacity="0.9"
      />
    </svg>
  );
}
