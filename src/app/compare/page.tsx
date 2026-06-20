import type { Metadata } from "next";
import Compare from "@/components/Compare";

export const metadata: Metadata = {
  title: "Compare areas — Locale",
  description: "Compare UK areas side by side: schools, crime, property prices, and deprivation.",
};

// Next 16: searchParams is async.
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ postcodes?: string }>;
}) {
  const sp = await searchParams;
  const initial = (sp.postcodes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return <Compare initialPostcodes={initial} />;
}
