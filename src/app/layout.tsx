import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Locale — UK area & school intelligence",
  description:
    "Enter a UK postcode and see schools, crime, and property prices nearby — from free, open data. No login.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-[1000] border-b border-[var(--border)] bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight">Locale</span>
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                UK area &amp; school intelligence
              </span>
            </a>
            <div className="flex items-center gap-4">
              <a
                href="/compare"
                className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--primary)]"
              >
                Compare areas
              </a>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
                MVP
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-8 border-t border-[var(--border)] py-5">
          <div className="mx-auto max-w-6xl space-y-1 px-4 text-xs text-[var(--muted)]">
            <p>
              Data: postcodes.io · OpenStreetMap (Overpass) · police.uk · HM Land Registry Price
              Paid. All free / open sources.
            </p>
            <p>
              Distance rings are guides, not catchment boundaries. Figures are indicative — verify
              before making decisions.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
