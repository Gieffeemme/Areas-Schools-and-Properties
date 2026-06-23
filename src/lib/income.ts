import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IncomeSummary } from "./types";

// Net (disposable) annual household income for the neighbourhood (MSOA), from a COMMITTED ONS dataset
// (build-income.mjs), read at runtime and keyed by MSOA code - which postcodes.io returns as
// codes.msoa21 / codes.msoa. England & Wales. The file is 2021-MSOA-vintage; we try the 2021 code first
// and fall back to the 2011 code (most are identical), so unchanged areas resolve either way.
interface IncomeFile {
  year: string;
  median: number;
  byMsoa: Record<string, number>;
}

let cached: IncomeFile | null | undefined;
function file(): IncomeFile | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "income-by-msoa.json"), "utf8"),
    ) as IncomeFile;
  } catch {
    cached = null;
  }
  return cached;
}

export function incomeForMsoa(msoa21Code?: string, msoaCode?: string): IncomeSummary | null {
  const data = file();
  if (!data) return null;
  const net =
    (msoa21Code ? data.byMsoa[msoa21Code] : undefined) ??
    (msoaCode ? data.byMsoa[msoaCode] : undefined) ??
    null;
  if (net == null) return null;
  return { net, median: data.median, year: data.year };
}
