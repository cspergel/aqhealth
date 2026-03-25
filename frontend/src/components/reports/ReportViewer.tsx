import { tokens, fonts } from "../../lib/tokens";

interface ReportSection {
  type: string;
  title: string;
  data: Record<string, any>;
  narrative: string;
}

interface GeneratedReport {
  id: number;
  template_id: number;
  title: string;
  period: string;
  status: string;
  content: Record<string, unknown> | null;
  ai_narrative: string | null;
  generated_by: number;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportViewerProps {
  report: GeneratedReport;
  onBack: () => void;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ReportViewer({ report, onBack }: ReportViewerProps) {
  // Handle both array and object shapes for content.sections
  const rawSections = (report.content as Record<string, unknown>)?.sections;
  const sections: ReportSection[] = Array.isArray(rawSections)
    ? rawSections
    : rawSections && typeof rawSections === "object"
      ? Object.entries(rawSections as Record<string, unknown>).map(([key, data]) => ({
          type: key,
          title: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          data: (typeof data === "object" && data !== null ? data : { value: data }) as Record<string, unknown>,
          narrative: "",
        }))
      : [];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 960 }}>
      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Back to Reports
        </button>
        <div className="flex-1" />
        <button
          className="text-xs px-3 py-1.5 rounded-md font-medium text-white"
          style={{ background: tokens.accent }}
          onClick={() => alert("PDF download would be generated here.")}
        >
          Download PDF
        </button>
        <button
          className="text-xs px-3 py-1.5 rounded-md font-medium border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          onClick={() => alert("Excel download would be generated here.")}
        >
          Download Excel
        </button>
      </div>

      {/* Title */}
      <div className="mb-6">
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            fontWeight: 700,
            color: tokens.text,
            marginBottom: 4,
          }}
        >
          {report.title}
        </h1>
        <div className="text-xs" style={{ color: tokens.textMuted }}>
          Period: {report.period} &middot; Generated: {new Date(report.created_at).toLocaleString()} &middot; Status: {report.status}
        </div>
      </div>

      {/* Executive Summary */}
      {report.ai_narrative && (
        <div
          className="rounded-[10px] border p-6 mb-8"
          style={{
            borderColor: "#bbf7d0",
            background: tokens.accentSoft,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: tokens.accent, color: "#fff" }}
            >
              AI
            </div>
            <h2
              style={{
                fontFamily: fonts.heading,
                fontSize: 14,
                fontWeight: 600,
                color: tokens.accentText,
              }}
            >
              Executive Summary
            </h2>
          </div>
          <div
            className="text-sm leading-relaxed whitespace-pre-line"
            style={{ color: tokens.accentText }}
          >
            {report.ai_narrative}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map((section, idx) => (
        <SectionCard key={idx} section={section} />
      ))}

      {sections.length === 0 && !report.ai_narrative && (
        <div
          className="rounded-[10px] border p-8 text-center"
          style={{ borderColor: tokens.border, background: tokens.surface }}
        >
          <div className="text-sm" style={{ color: tokens.textMuted }}>
            Report content is not available.
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ section }: { section: ReportSection }) {
  return (
    <div
      className="rounded-[10px] border bg-white mb-5"
      style={{ borderColor: tokens.border }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3"
        style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
      >
        <h3
          style={{
            fontFamily: fonts.heading,
            fontSize: 14,
            fontWeight: 600,
            color: tokens.text,
          }}
        >
          {section.title}
        </h3>
      </div>

      {/* Data display */}
      {section.data && Object.keys(section.data).length > 0 && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
          <SectionData type={section.type} data={section.data} />
        </div>
      )}

      {/* Narrative */}
      {section.narrative && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <div
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: tokens.accentSoft, color: tokens.accentText }}
            >
              AI Narrative
            </div>
          </div>
          <div
            className="text-sm leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {section.narrative}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionData({ type, data }: { type: string; data: Record<string, any> }) {
  switch (type) {
    case "financial_summary":
      return <FinancialSummaryData data={data} />;
    case "raf_summary":
      return <RafSummaryData data={data} />;
    case "quality_metrics":
      return <QualityMetricsData data={data} />;
    case "expenditure_overview":
      return <ExpenditureData data={data} />;
    case "provider_performance":
      return <ProviderPerformanceData data={data} />;
    default:
      return <GenericData data={data} />;
  }
}

function FinancialSummaryData({ data }: { data: any }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MiniMetric label="Total Revenue" value={formatCurrency(data.total_revenue)} />
      <MiniMetric label="Total Expenses" value={formatCurrency(data.total_expenses)} />
      <MiniMetric label="Surplus" value={formatCurrency(data.surplus)} accent />
      <MiniMetric label="MLR" value={`${data.mlr}%`} />
      <MiniMetric label="PMPM Revenue" value={formatCurrency(data.pmpm_revenue)} />
      <MiniMetric label="PMPM Expense" value={formatCurrency(data.pmpm_expense)} />
    </div>
  );
}

function RafSummaryData({ data }: { data: any }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MiniMetric label="Total Lives" value={data.total_lives?.toLocaleString()} />
      <MiniMetric label="Avg RAF" value={data.avg_raf?.toFixed(3)} />
      <MiniMetric label="Projected RAF" value={data.projected_raf?.toFixed(3)} />
      <MiniMetric label="Recapture Rate" value={`${data.recapture_rate}%`} />
      <MiniMetric label="Open Suspects" value={data.open_suspects?.toLocaleString()} />
      <MiniMetric label="Suspect Value" value={formatCurrency(data.suspect_value)} accent />
    </div>
  );
}

function QualityMetricsData({ data }: { data: any }) {
  return (
    <div>
      {data.overall_stars && (
        <div className="mb-3">
          <span className="text-xs font-medium" style={{ color: tokens.textMuted }}>
            Estimated Stars Rating:{" "}
          </span>
          <span
            className="text-sm font-bold"
            style={{ color: data.overall_stars >= 4 ? tokens.accentText : tokens.amber, fontFamily: fonts.code }}
          >
            {data.overall_stars}
          </span>
        </div>
      )}
      {data.measures && (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: tokens.textMuted }}>
              <th className="text-left py-1.5 font-medium">Measure</th>
              <th className="text-right py-1.5 font-medium">Closure Rate</th>
              <th className="text-right py-1.5 font-medium">Target</th>
              <th className="text-right py-1.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {data.measures.map((m: any) => (
              <tr key={m.code} style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
                <td className="py-1.5" style={{ color: tokens.text }}>{m.name}</td>
                <td className="text-right py-1.5" style={{ color: tokens.text, fontFamily: fonts.code }}>
                  {m.closure_rate}%
                </td>
                <td className="text-right py-1.5" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
                  {m.target}%
                </td>
                <td
                  className="text-right py-1.5 font-medium"
                  style={{
                    color: m.closure_rate >= m.target ? tokens.accentText : tokens.red,
                    fontFamily: fonts.code,
                  }}
                >
                  {m.closure_rate >= m.target ? "Met" : `${(m.target - m.closure_rate).toFixed(1)}pp below`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExpenditureData({ data }: { data: any }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <MiniMetric label="Total Spend" value={formatCurrency(data.total_spend)} />
        <MiniMetric label="PMPM" value={`$${data.pmpm?.toLocaleString()}`} />
      </div>
      {data.categories && (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: tokens.textMuted }}>
              <th className="text-left py-1.5 font-medium">Category</th>
              <th className="text-right py-1.5 font-medium">Spend</th>
              <th className="text-right py-1.5 font-medium">PMPM</th>
              <th className="text-right py-1.5 font-medium">Benchmark</th>
              <th className="text-right py-1.5 font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c: any) => (
              <tr key={c.category} style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
                <td className="py-1.5" style={{ color: tokens.text }}>{c.category}</td>
                <td className="text-right py-1.5" style={{ color: tokens.text, fontFamily: fonts.code }}>
                  {formatCurrency(c.spend)}
                </td>
                <td className="text-right py-1.5" style={{ color: tokens.text, fontFamily: fonts.code }}>
                  ${c.pmpm}
                </td>
                <td className="text-right py-1.5" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
                  ${c.benchmark}
                </td>
                <td
                  className="text-right py-1.5 font-medium"
                  style={{ color: c.variance_pct > 10 ? tokens.red : c.variance_pct > 5 ? tokens.amber : tokens.accentText, fontFamily: fonts.code }}
                >
                  {c.variance_pct > 0 ? "+" : ""}{c.variance_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProviderPerformanceData({ data }: { data: any }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <MiniMetric label="Total Providers" value={String(data.total_providers)} />
        <MiniMetric label="Avg Capture Rate" value={`${data.avg_capture_rate}%`} />
        <MiniMetric label="Avg Gap Closure" value={`${data.avg_gap_closure}%`} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* Top performers */}
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: tokens.accentText }}>
            Top Performers
          </div>
          {data.top_performers?.map((p: any) => (
            <div key={p.name} className="flex items-center justify-between py-1" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
              <span className="text-xs" style={{ color: tokens.text }}>{p.name}</span>
              <span className="text-xs font-medium" style={{ color: tokens.accentText, fontFamily: fonts.code }}>
                {p.capture_rate}%
              </span>
            </div>
          ))}
        </div>
        {/* Bottom performers */}
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: tokens.red }}>
            Needs Improvement
          </div>
          {data.bottom_performers?.map((p: any) => (
            <div key={p.name} className="flex items-center justify-between py-1" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
              <span className="text-xs" style={{ color: tokens.text }}>{p.name}</span>
              <span className="text-xs font-medium" style={{ color: tokens.red, fontFamily: fonts.code }}>
                {p.capture_rate}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenericData({ data }: { data: any }) {
  const entries = Object.entries(data).filter(([, v]) => typeof v !== "object" || v === null);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-4">
      {entries.map(([key, val]) => (
        <MiniMetric key={key} label={key.replace(/_/g, " ")} value={String(val)} />
      ))}
    </div>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: tokens.textMuted }}>
        {label}
      </div>
      <div
        className="text-lg font-semibold"
        style={{ fontFamily: fonts.code, color: accent ? tokens.accentText : tokens.text }}
      >
        {value}
      </div>
    </div>
  );
}
