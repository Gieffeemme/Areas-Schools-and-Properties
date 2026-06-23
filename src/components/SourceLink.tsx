import type { ReactNode } from "react";

// A small "↗" source link, used in panel footers to point at the official source for that data.
// `dark` variant for the dark-themed Crime panel.
export default function SourceLink({
  href,
  children,
  dark = false,
}: {
  href: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-2 hover:no-underline ${
        dark ? "text-white/70 hover:text-white" : "text-[var(--primary)]"
      }`}
    >
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
