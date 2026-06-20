export function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

/** "2026-04" -> "April 2026" */
export function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
