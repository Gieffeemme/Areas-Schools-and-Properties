// The official Locale logo: the hexagon mark + the "locale" wordmark, inline so the foreground
// (outer hexagon outline + wordmark) follows `currentColor` - white on the dark nav, dark on a light
// surface - while the indigo accent (inner hexagon + centre dot) stays fixed. Size it by setting a
// height on the element via `className` (e.g. `h-8 w-auto`); the viewBox is cropped to the artwork so
// there's no trailing whitespace. Geometry/typography are taken verbatim from the supplied asset.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 210 80"
      className={className}
      role="img"
      aria-label="Locale"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Locale</title>
      <g transform="translate(0, 12)">
        {/* Outer hexagon - follows the text colour */}
        <polygon
          points="24,0 48,14 48,42 24,56 0,42 0,14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {/* Inner hexagon: a subtle indigo tint + outline */}
        <polygon points="24,10 38,18 38,38 24,46 10,38 10,18" fill="#6366f1" opacity="0.15" />
        <polygon
          points="24,10 38,18 38,38 24,46 10,38 10,18"
          fill="none"
          stroke="#6366f1"
          strokeWidth="1"
        />
        {/* Centre dot */}
        <circle cx="24" cy="28" r="4" fill="#6366f1" />
        {/* Wordmark - follows the text colour */}
        <text
          x="64"
          y="33"
          fontFamily="-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
          fontWeight="200"
          fontSize="40"
          letterSpacing="-1.5"
          fill="currentColor"
        >
          locale
        </text>
      </g>
    </svg>
  );
}
