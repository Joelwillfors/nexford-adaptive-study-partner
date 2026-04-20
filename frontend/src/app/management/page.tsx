import Link from "next/link";
import { ArrowRight, Coins, LineChart } from "lucide-react";
import { Nav } from "@/components/nav";

/**
 * Management overview — landing page for the new "Management" demo role.
 *
 * Two cards: the live Token Economics dashboard and a placeholder for
 * Longitudinal Cohort ROI (Phase 5). Keeps the role feeling deliberate
 * even though only one report is wired today.
 */
export default function ManagementOverviewPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
              Operations
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
              Management Overview
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#6b7280]">
              Reports built for the school&apos;s leadership team — what the
              platform costs, where the LLM spend lands, and how cohort
              outcomes trend over time.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <ReportCard
              href="/management/economics"
              title="Token economics"
              description="LLM spend by model, day, and concept. Spot the topics where the mentor is most expensive — those are the first candidates for cached or local handling."
              icon={<Coins className="h-4 w-4 text-[#92400e]" />}
              cta="Open dashboard"
              available
            />
            <ReportCard
              href="#"
              title="Longitudinal cohort ROI"
              description="Module-level efficacy across cohorts year over year. Built for accreditor reporting and renewal conversations with the school."
              icon={<LineChart className="h-4 w-4 text-[#6b7280]" />}
              cta="Coming in Phase 5"
              available={false}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function ReportCard({
  href,
  title,
  description,
  icon,
  cta,
  available,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  cta: string;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-6 opacity-70">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold text-[#0f0f0f]">{title}</h2>
          <span className="ml-auto rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
            Soon
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
          {description}
        </p>
        <p className="mt-4 text-xs font-semibold text-[#6b7280]">{cta}</p>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="group rounded-xl border border-[#e5e7eb] bg-white p-6 transition hover:border-[#0f0f0f]"
    >
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold text-[#0f0f0f]">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
        {description}
      </p>
      <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f0f0f] group-hover:text-[#92400e]">
        {cta}
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}
