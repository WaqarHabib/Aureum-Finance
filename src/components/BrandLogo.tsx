type Props = {
  size?: number;
  className?: string;
  /** Show only the mark (no wordmark text). */
  markOnly?: boolean;
};

/**
 * BillFlow brand mark. A stylized "B" rendered in a premium
 * gradient (sapphire → emerald → champagne) sitting on a deep
 * obsidian tile, with a soft cash-flow wave and a single gold
 * accent — the entire mark is pure SVG so it stays crisp at
 * every size, in every theme.
 */
export function BrandLogo({ size = 44, className, markOnly = true }: Props) {
  const id = "bl-" + Math.random().toString(36).slice(2, 8);
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="BillFlow"
        style={{ display: "block", borderRadius: 14, boxShadow: "var(--shadow-gold)" }}
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0F2742" />
            <stop offset="100%" stopColor="#0A1B2E" />
          </linearGradient>
          <linearGradient id={`${id}-mark`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3DA9FC" />
            <stop offset="55%" stopColor="#26C6A4" />
            <stop offset="100%" stopColor="#F2C879" />
          </linearGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill={`url(#${id}-bg)`} />
        <rect width="64" height="64" rx="14" fill={`url(#${id}-sheen)`} />
        <path
          d="M10 47 C 20 39, 28 55, 38 45 S 54 37, 56 41"
          fill="none"
          stroke={`url(#${id}-mark)`}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M20 14 H34 c6.4 0 10.4 3.2 10.4 8.2 0 3.2-1.7 5.6-4.6 6.9 3.8 1.1 6.1 3.9 6.1 7.8 0 5.7-4.5 9.1-11.6 9.1 H20 V14 z
             M26.2 27.5 H33.4 c2.9 0 4.6-1.3 4.6-3.5 0-2.2-1.6-3.5-4.6-3.5 H26.2 v7 z
             M26.2 40.3 H34.4 c3.2 0 5-1.4 5-3.8 0-2.4-1.8-3.8-5-3.8 H26.2 v7.6 z"
          fill={`url(#${id}-mark)`}
        />
        <circle cx="50" cy="18" r="2.6" fill="#F2C879" />
      </svg>
      {!markOnly && (
        <span className="font-display text-2xl font-medium tracking-tight brand-text">
          BillFlow
        </span>
      )}
    </span>
  );
}
