import type { Metadata } from "next";
import Compare from "@/components/Compare";

export const metadata: Metadata = {
  title: "Compare areas or schools — Locale",
  description:
    "Compare UK areas or schools side by side: Ofsted, exam results, Parent View, crime, property prices and deprivation.",
};

// Next 16: searchParams is async.
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; postcodes?: string; schools?: string }>;
}) {
  const sp = await searchParams;
  const csv = (v?: string) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  const initialPostcodes = csv(sp.postcodes);
  const initialSchools = csv(sp.schools);
  const initialMode: "areas" | "schools" =
    sp.mode === "schools" || (initialSchools.length > 0 && initialPostcodes.length === 0)
      ? "schools"
      : "areas";
  return (
    <Compare
      initialMode={initialMode}
      initialPostcodes={initialPostcodes}
      initialSchools={initialSchools}
    />
  );
}
