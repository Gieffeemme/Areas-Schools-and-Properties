import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Locale - UK area & school intelligence",
  description:
    "Enter a UK postcode and see schools, crime, and property prices nearby - from free, open data. No login.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-[1000] bg-[var(--nav)] text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight">Locale</span>
              <span className="hidden text-xs text-white/45 sm:inline">
                UK area &amp; school intelligence
              </span>
            </a>
            <nav className="flex items-center gap-5 text-sm">
              <a href="/map" className="text-white/70 transition hover:text-white">
                Map
              </a>
              <a href="/compare" className="text-white/70 transition hover:text-white">
                Compare
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-8 border-t border-[var(--border)] py-5">
          <div className="mx-auto max-w-6xl space-y-1 px-4 text-xs text-[var(--muted)]">
            <p>
              Compiled from open data — postcodes.io · OpenStreetMap · police.uk · HM Land Registry ·
              DfE · Ofsted · VOA · Ofcom · Defra · Environment Agency · MHCLG.{" "}
              <a
                href="/sources"
                className="text-[var(--primary)] underline underline-offset-2 hover:no-underline"
              >
                Sources &amp; licences
              </a>
            </p>
            <p>
              Contains public sector information licensed under the Open Government Licence v3.0.
              © OpenStreetMap contributors (ODbL).
            </p>
            <p>
              <strong>Indicative information only — not professional advice.</strong> Figures may be
              incomplete or out of date; verify with the official source before relying on them.
            </p>
            <p>© GFM 2026 · Not affiliated with or endorsed by the data providers.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
