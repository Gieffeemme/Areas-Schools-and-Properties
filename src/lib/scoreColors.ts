// Shared score → colour bands. green = good · amber = caution · red = bad.
export function p8Color(v: number): string {
  return v >= 0 ? "#16a34a" : v >= -0.5 ? "#d97706" : "#dc2626";
}

export function happyColor(pct: number): string {
  return pct >= 85 ? "#16a34a" : pct >= 65 ? "#d97706" : "#dc2626";
}

// KS2 progress scores span a wider range than Progress 8.
export function progressColor(v: number): string {
  return v >= 0 ? "#16a34a" : v >= -2 ? "#d97706" : "#dc2626";
}

// For percentage measures (RWM expected, EBacc entry/achieved).
export function pctColor(pct: number): string {
  return pct >= 65 ? "#16a34a" : pct >= 45 ? "#d97706" : "#dc2626";
}

// A-level average grade → colour. A/B = strong, C = average, D/E/U = weak.
export function gradeColor(grade: string): string {
  const c = grade.replace("*", "").charAt(0).toUpperCase();
  if (c === "A" || c === "B") return "#16a34a";
  if (c === "C") return "#d97706";
  return "#dc2626";
}
