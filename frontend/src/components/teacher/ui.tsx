export function MetricCard({
  label,
  value,
  highlight,
  danger,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
  /** When provided, the whole card becomes a link. Hash hrefs (e.g.
   *  "#struggling-concepts") jump to a same-page anchor. */
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-xl border bg-white px-5 py-5 transition ${
        highlight ? "border-[#ffb300]" : "border-[#e5e7eb]"
      } ${href ? "hover:border-[#0f0f0f]" : ""}`}
    >
      <p className="text-xs font-medium text-[#6b7280]">{label}</p>
      <p
        className={`mt-1.5 text-3xl font-bold ${
          danger ? "text-red-600" : "text-[#0f0f0f]"
        }`}
      >
        {value}
      </p>
      {href && (
        <p className="mt-2 text-[10px] font-medium uppercase tracking-widest text-[#6b7280]">
          View details ›
        </p>
      )}
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

export function LegendSwatch({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export function ChevronIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChartIcon({
  className = "h-6 w-6",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
