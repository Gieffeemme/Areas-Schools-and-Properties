import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data sources, licences & disclaimers - Locale",
  description:
    "Where Locale's data comes from, the open-data licences it's used under, the required attributions, and important disclaimers.",
};

// Static informational page: data provenance, licences/attribution, and disclaimers. Kept as plain
// content (no client JS) so it's server-rendered and easy to keep accurate.
const SOURCES: { name: string; provider: string; licence: string }[] = [
  { name: "Schools register & metadata (GIAS)", provider: "Department for Education", licence: "OGL v3.0" },
  { name: "Ofsted ratings & Early Years report cards", provider: "Ofsted", licence: "OGL v3.0" },
  { name: "Exam & performance data (KS2/4/5, destinations, census, workforce, finance)", provider: "Department for Education", licence: "OGL v3.0" },
  { name: "Parent View survey", provider: "Ofsted", licence: "OGL v3.0" },
  { name: "Street-level crime", provider: "police.uk / data.police.uk", licence: "OGL v3.0" },
  { name: "Sold prices (Price Paid Data)", provider: "HM Land Registry", licence: "OGL v3.0 (see attribution)" },
  { name: "Deprivation (Indices of Deprivation 2019)", provider: "MHCLG", licence: "OGL v3.0" },
  { name: "Census 2021 demographics", provider: "Office for National Statistics (via Nomis)", licence: "OGL v3.0" },
  { name: "Council-tax bands (stock of properties) & levels", provider: "Valuation Office Agency / MHCLG", licence: "OGL v3.0" },
  { name: "Broadband coverage (Connected Nations)", provider: "Ofcom", licence: "OGL v3.0" },
  { name: "Mobile coverage (Connected Nations, 4G / 5G)", provider: "Ofcom", licence: "OGL v3.0" },
  { name: "Environmental noise (strategic noise mapping)", provider: "Defra", licence: "OGL v3.0" },
  { name: "Air quality (modelled background NO₂ / PM2.5, PCM 1 km maps)", provider: "Defra", licence: "OGL v3.0" },
  { name: "Health & care ratings (care directory with filters)", provider: "Care Quality Commission", licence: "OGL v3.0" },
  { name: "Flood risk & warnings", provider: "Environment Agency", licence: "OGL v3.0" },
  { name: "Energy performance certificates (EPC)", provider: "MHCLG - Get energy performance of buildings data", licence: "EPB reuse terms" },
  { name: "Planning applications", provider: "PlanIt (aggregates UK local-authority planning registers)", licence: "Third-party - see note" },
  { name: "Planning constraints (designations, listed buildings)", provider: "MHCLG planning.data.gov.uk (incl. Historic England)", licence: "OGL v3.0" },
  { name: "Amenities, stations & base map data", provider: "OpenStreetMap contributors", licence: "ODbL (data) · tiles © CARTO / © Mapbox" },
  { name: "Postcode & place geocoding", provider: "postcodes.io (ONS / OS Open Names / Royal Mail)", licence: "OGL v3.0" },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Data sources, licences &amp; disclaimers</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        Locale brings together free, publicly available data from official UK sources. Each dataset is
        used under its open-data licence, with attribution, as set out below. Last reviewed June 2026.
      </p>

      <Section title="Where the data comes from">
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Licence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {SOURCES.map((s) => (
                <tr key={s.name} className="align-top">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{s.provider}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--muted)]">{s.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Planning application data is provided by{" "}
          <ExtLink href="https://www.planit.org.uk/">PlanIt</ExtLink>, a third-party service that
          aggregates UK local-authority planning registers (there is no official national planning-
          application API). Each application links to the council&rsquo;s own record, which is the
          authoritative source for its status and detail.
        </p>
      </Section>

      <Section title="Attribution">
        <ul className="space-y-2 text-sm leading-relaxed text-[var(--muted)]">
          <li>Contains public sector information licensed under the Open Government Licence v3.0.</li>
          <li>
            Contains HM Land Registry data © Crown copyright and database right 2026. This data is
            licensed under the Open Government Licence v3.0.
          </li>
          <li>
            © OpenStreetMap contributors. OpenStreetMap data is available under the Open Database
            Licence (ODbL); map tiles © CARTO and © Mapbox.
          </li>
          <li>
            Contains OS data © Crown copyright and database right 2026; Royal Mail data © Royal Mail
            copyright and database right 2026; National Statistics data © Crown copyright and database
            right 2026 (via postcodes.io).
          </li>
          <li>Energy performance certificate data is used under the Energy Performance of Buildings reuse terms.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          The full Open Government Licence is at{" "}
          <ExtLink href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
            nationalarchives.gov.uk
          </ExtLink>{" "}
          and the Open Database Licence at{" "}
          <ExtLink href="https://opendatacommons.org/licenses/odbl/1-0/">opendatacommons.org</ExtLink>.
          The datasets Locale builds from OpenStreetMap are made available under the ODbL.
        </p>
      </Section>

      <Section title="Disclaimers">
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[var(--muted)]">
          <li>
            <strong className="text-[var(--foreground)]">Information only, no warranty.</strong> The
            information is compiled from third-party sources and provided “as is” for general
            information. It may be incomplete, out of date, approximate or contain errors, and is not
            guaranteed to be accurate or current.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Not professional advice.</strong> Nothing here
            is financial, legal, property, investment, tax or school-admissions advice. Do not rely on
            it for any decision without independent verification.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Verify with the official source.</strong>{" "}
            Always confirm before acting - school admissions and catchment with the local authority and
            school; council-tax band with the Valuation Office Agency; energy rating with the EPC
            certificate; school performance and inspection with Ofsted, the DfE and the school directly.
            Figures such as “nearest station”, prices and amenity counts are indicative.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">School inspection data.</strong> Ofsted/DfE
            information reflects the latest data published at the time of compilation; grades and
            judgements change, and some inspections no longer carry a single overall grade. Always check
            the live Ofsted report and the school’s own information for the current position.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">External links.</strong> Locale links to
            official and third-party websites for verification; we are not responsible for their content
            or availability.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">No affiliation.</strong> Locale is not
            affiliated with, endorsed by, or operated by any of the data providers named above.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Limitation of liability.</strong> To the
            fullest extent permitted by law, we accept no liability for any loss or damage arising from
            use of, or reliance on, this information. Nothing in these disclaimers excludes liability
            that cannot be excluded under applicable law.
          </li>
        </ol>
      </Section>

      <Section title="Privacy">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Locale shows information about places and buildings drawn from public data; it does not require
          an account and does not ask for personal information. Searches are processed to return results
          and are not used to identify you.
        </p>
      </Section>

      <p className="mt-10 text-xs text-[var(--muted)]">
        Spotted something wrong? Data is only as good as its source - please check the linked official
        source, which is authoritative.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--primary)] underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}
