import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ERVisit {
  id: string;
  member_id: string;
  name: string;
  date: string;
  time: string;
  facility: string;
  diagnosis: string;
  icd10: string;
  avoidable: boolean;
  alternative: string | null;
  pcp: string;
  pcp_visit_prior_7d: boolean;
  day_of_week: string;
  after_hours: boolean;
  cost: number;
  notes: string;
}

interface ProviderAnalysis {
  provider: string;
  pcp_id: number;
  panel_size: number;
  er_visits: number;
  avoidable_er: number;
  avoidable_rate: number;
  access_score: string;
  avg_3rd_available: number;
}

interface EducationItem {
  id: string;
  type: string;
  member_id?: string;
  provider_id?: number;
  name: string;
  reason: string;
  recommendation: string;
  pcp?: string;
  priority: string;
  estimated_savings: number;
}

interface AvoidableAnalysis {
  summary: {
    total_er_visits: number;
    avoidable_er_visits: number;
    potentially_avoidable_admissions: number;
    avoidable_readmissions: number;
    estimated_annual_savings: number;
    avoidable_er_pct: number;
    avoidable_admission_pct: number;
  };
  by_provider: ProviderAnalysis[];
  by_facility: { facility: string; er_visits: number; er_to_inpatient: number; conversion_rate: number }[];
  dollar_impact: {
    avoidable_er_cost: number;
    per_avoidable_er: number;
    avoidable_admission_cost: number;
    per_avoidable_admission: number;
    avoidable_readmission_cost: number;
    per_avoidable_readmission: number;
    total_annual_impact: number;
    description: string;
  };
}

type ActiveTab = "summary" | "er-detail" | "providers" | "education";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const ACCESS_COLORS: Record<string, string> = {
  A: "#22c55e",
  "A-": "#22c55e",
  "B+": "#22c55e",
  B: "#3b82f6",
  "B-": "#3b82f6",
  C: "#f59e0b",
  D: "#ef4444",
  F: "#ef4444",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AvoidablePage() {
  const [analysis, setAnalysis] = useState<AvoidableAnalysis | null>(null);
  const [erDetail, setErDetail] = useState<ERVisit[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("summary");
  const [erFilter, setErFilter] = useState<"all" | "avoidable" | "not_avoidable">("all");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/avoidable/analysis"),
      api.get("/api/avoidable/er-detail"),
      api.get("/api/avoidable/education"),
    ])
      .then(([analysisRes, erRes, eduRes]) => {
        setAnalysis(analysisRes.data);
        setErDetail(Array.isArray(erRes.data) ? erRes.data : []);
        setEducation(Array.isArray(eduRes.data) ? eduRes.data : []);
      })
      .catch((err) => console.error("Failed to load avoidable analysis:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !analysis) {
    return (
      <div className="px-7 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-slate-200" />
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { summary, by_provider, by_facility, dollar_impact } = analysis;

  const filteredER = erFilter === "all" ? erDetail
    : erFilter === "avoidable" ? erDetail.filter((e) => e.avoidable)
    : erDetail.filter((e) => !e.avoidable);

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "summary", label: "Overview" },
    { key: "er-detail", label: "ER Visit Detail" },
    { key: "providers", label: "Provider Analysis" },
    { key: "education", label: "Education & Interventions" },
  ];

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Avoidable Admission Analysis
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            AI-driven classification of ER visits and admissions by avoidability
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: tokens.surfaceAlt }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2 text-sm font-medium rounded-md transition-all"
            style={{
              background: activeTab === t.key ? "#fff" : "transparent",
              color: activeTab === t.key ? tokens.accent : tokens.textMuted,
              boxShadow: activeTab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* SUMMARY TAB */}
      {/* ============================================================ */}
      {activeTab === "summary" && (
        <>
          {/* Top metrics */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <MetricCard label="Total ER Visits (90d)" value={String(summary.total_er_visits)} />
            <MetricCard label="Avoidable ER Visits" value={String(summary.avoidable_er_visits)} trend={`${summary.avoidable_er_pct}% of total`} trendDirection="down" />
            <MetricCard label="Avoidable Admissions" value={String(summary.potentially_avoidable_admissions)} trend={`${summary.avoidable_admission_pct}% of total`} trendDirection="down" />
            <MetricCard label="Avoidable Readmissions" value={String(summary.avoidable_readmissions)} trend="within 30 days" trendDirection="down" />
            <MetricCard label="Estimated Savings" value={fmt(summary.estimated_annual_savings)} trend="per year" trendDirection="up" />
          </div>

          {/* Dollar impact callout */}
          <div className="rounded-lg border-2 p-5 mb-6" style={{ borderColor: "#22c55e", background: "#f0fdf4" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#22c55e" }}>
                <span className="text-white text-lg font-bold">$</span>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: "#166534" }}>
                  {fmt(dollar_impact.total_annual_impact)}/year in potential savings
                </div>
                <div className="text-sm" style={{ color: "#15803d" }}>{dollar_impact.description}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div className="rounded-lg p-3" style={{ background: "#dcfce7" }}>
                <div className="text-xs font-medium" style={{ color: "#166534" }}>Avoidable ER Savings</div>
                <div className="text-lg font-bold mt-1" style={{ fontFamily: fonts.code, color: "#166534" }}>{fmt(dollar_impact.avoidable_er_cost)}</div>
                <div className="text-xs" style={{ color: "#15803d" }}>{fmt(dollar_impact.per_avoidable_er)} per visit</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "#dcfce7" }}>
                <div className="text-xs font-medium" style={{ color: "#166534" }}>Avoidable Admission Savings</div>
                <div className="text-lg font-bold mt-1" style={{ fontFamily: fonts.code, color: "#166534" }}>{fmt(dollar_impact.avoidable_admission_cost)}</div>
                <div className="text-xs" style={{ color: "#15803d" }}>{fmt(dollar_impact.per_avoidable_admission)} per admission</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "#dcfce7" }}>
                <div className="text-xs font-medium" style={{ color: "#166534" }}>Avoidable Readmission Savings</div>
                <div className="text-lg font-bold mt-1" style={{ fontFamily: fonts.code, color: "#166534" }}>{fmt(dollar_impact.avoidable_readmission_cost)}</div>
                <div className="text-xs" style={{ color: "#15803d" }}>{fmt(dollar_impact.per_avoidable_readmission)} per readmission</div>
              </div>
            </div>
          </div>

          {/* Facility ER conversion rates */}
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>ER-to-Inpatient Conversion by Facility</h3>
            <div className="grid grid-cols-4 gap-4">
              {by_facility.map((f) => (
                <div key={f.facility} className="rounded-lg border p-3" style={{ borderColor: tokens.border }}>
                  <div className="text-xs font-medium mb-2 truncate" style={{ color: tokens.textMuted }} title={f.facility}>
                    {f.facility.length > 25 ? f.facility.slice(0, 23) + "..." : f.facility}
                  </div>
                  <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: f.conversion_rate > 35 ? "#ef4444" : tokens.text }}>
                    {f.conversion_rate.toFixed(1)}%
                  </div>
                  <div className="text-xs mt-1" style={{ color: tokens.textMuted }}>
                    {f.er_to_inpatient} of {f.er_visits} ER visits admitted
                  </div>
                  {/* Bar */}
                  <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: tokens.border }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${f.conversion_rate}%`,
                        background: f.conversion_rate > 35 ? "#ef4444" : tokens.accent,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* ER DETAIL TAB */}
      {/* ============================================================ */}
      {activeTab === "er-detail" && (
        <>
          {/* Filter buttons */}
          <div className="flex gap-2 mb-4">
            {(["all", "avoidable", "not_avoidable"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setErFilter(f)}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  background: erFilter === f ? tokens.accent : "transparent",
                  color: erFilter === f ? "#fff" : tokens.textMuted,
                  border: `1px solid ${erFilter === f ? tokens.accent : tokens.border}`,
                }}
              >
                {f === "all" ? `All (${erDetail.length})` : f === "avoidable" ? `Avoidable (${erDetail.filter((e) => e.avoidable).length})` : `Not Avoidable (${erDetail.filter((e) => !e.avoidable).length})`}
              </button>
            ))}
          </div>

          <div className="rounded-lg border" style={{ borderColor: tokens.border, background: "#fff" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: tokens.textMuted, background: tokens.surfaceAlt }}>
                    <th className="text-left font-medium py-2.5 px-3">Status</th>
                    <th className="text-left font-medium py-2.5 px-3">Member</th>
                    <th className="text-left font-medium py-2.5 px-3">Date/Time</th>
                    <th className="text-left font-medium py-2.5 px-3">Diagnosis</th>
                    <th className="text-left font-medium py-2.5 px-3">Facility</th>
                    <th className="text-left font-medium py-2.5 px-3">PCP</th>
                    <th className="text-left font-medium py-2.5 px-3">PCP Visit 7d?</th>
                    <th className="text-left font-medium py-2.5 px-3">Alternative</th>
                    <th className="text-right font-medium py-2.5 px-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredER.map((er) => (
                    <tr key={er.id} className="border-t" style={{ borderColor: tokens.border }}>
                      <td className="py-2.5 px-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: er.avoidable ? "#fef2f2" : "#f0fdf4",
                            color: er.avoidable ? "#ef4444" : "#22c55e",
                          }}
                        >
                          {er.avoidable ? "Avoidable" : "Appropriate"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: tokens.accent }}>{er.name}</td>
                      <td className="py-2.5 px-3" style={{ color: tokens.text }}>
                        <div>{er.date}</div>
                        <div className="text-xs" style={{ color: tokens.textMuted }}>
                          {er.time} {er.after_hours && <span style={{ color: "#f59e0b" }}>(after-hours)</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-3" style={{ color: tokens.text }}>
                        <div>{er.diagnosis}</div>
                        <div className="text-xs font-mono" style={{ color: tokens.textMuted }}>{er.icd10}</div>
                      </td>
                      <td className="py-2.5 px-3 text-xs" style={{ color: tokens.text }}>
                        {er.facility.length > 20 ? er.facility.slice(0, 18) + "..." : er.facility}
                      </td>
                      <td className="py-2.5 px-3" style={{ color: tokens.text }}>{er.pcp}</td>
                      <td className="py-2.5 px-3 text-center">
                        {er.pcp_visit_prior_7d ? (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#dcfce7", color: "#166534" }}>Yes</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#fef2f2", color: "#ef4444" }}>No</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs" style={{ color: er.alternative ? "#f59e0b" : tokens.textMuted }}>
                        {er.alternative || "--"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono" style={{ color: tokens.text }}>{fmt(er.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* PROVIDER ANALYSIS TAB */}
      {/* ============================================================ */}
      {activeTab === "providers" && (
        <>
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: tokens.text }}>Provider ER Utilization Analysis</h3>
            <p className="text-xs mb-4" style={{ color: tokens.textMuted }}>
              Identifies PCPs whose patients have high avoidable ER rates, suggesting potential access problems.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: tokens.textMuted }}>
                  <th className="text-left font-medium pb-2">Provider</th>
                  <th className="text-right font-medium pb-2">Panel Size</th>
                  <th className="text-right font-medium pb-2">ER Visits</th>
                  <th className="text-right font-medium pb-2">Avoidable ER</th>
                  <th className="text-right font-medium pb-2">Avoidable %</th>
                  <th className="text-center font-medium pb-2">Access Score</th>
                  <th className="text-right font-medium pb-2">3rd Available (days)</th>
                </tr>
              </thead>
              <tbody>
                {by_provider.map((p) => (
                  <tr key={p.pcp_id} className="border-t" style={{ borderColor: tokens.border }}>
                    <td className="py-2.5 font-medium" style={{ color: tokens.text }}>{p.provider}</td>
                    <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{p.panel_size}</td>
                    <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{p.er_visits}</td>
                    <td className="py-2.5 text-right font-mono" style={{ color: p.avoidable_er > 0 ? "#ef4444" : tokens.text }}>{p.avoidable_er}</td>
                    <td className="py-2.5 text-right">
                      {p.avoidable_rate > 0 ? (
                        <span className="font-mono font-medium" style={{ color: p.avoidable_rate > 15 ? "#ef4444" : "#f59e0b" }}>
                          {p.avoidable_rate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="font-mono" style={{ color: "#22c55e" }}>0%</span>
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          background: (ACCESS_COLORS[p.access_score] || tokens.textMuted) + "18",
                          color: ACCESS_COLORS[p.access_score] || tokens.textMuted,
                        }}
                      >
                        {p.access_score}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono" style={{ color: p.avg_3rd_available > 5 ? "#ef4444" : tokens.text }}>
                      {p.avg_3rd_available.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Access insight callout */}
          <div className="rounded-lg border-2 p-4" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#f59e0b" }}>
                <span className="text-white text-sm font-bold">!</span>
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: "#92400e" }}>Access Improvement Opportunity</div>
                <div className="text-sm mt-1" style={{ color: "#a16207" }}>
                  Dr. Rivera has the highest avoidable ER rate (25.0%) with a 3rd-available appointment of 8.2 days.
                  Increasing same-day/next-day access could reduce avoidable ER visits by an estimated 60%, saving ~$18K/year.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* EDUCATION TAB */}
      {/* ============================================================ */}
      {activeTab === "education" && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <MetricCard label="Member Education" value={String(education.filter((e) => e.type === "member").length)} trend="patients need ER education" />
            <MetricCard label="Provider Access" value={String(education.filter((e) => e.type === "provider").length)} trend="providers need access improvement" />
            <MetricCard label="Readmission Prevention" value={String(education.filter((e) => e.type === "readmission").length)} trend="care plan adjustments needed" />
          </div>

          <div className="space-y-3">
            {education.map((item) => (
              <div key={item.id} className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: item.type === "member" ? "#dbeafe" : item.type === "provider" ? "#fef3c7" : "#fce7f3",
                        color: item.type === "member" ? "#1d4ed8" : item.type === "provider" ? "#92400e" : "#be185d",
                      }}
                    >
                      {item.type === "member" ? "Member Education" : item.type === "provider" ? "Provider Access" : "Readmission Prevention"}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: PRIORITY_COLORS[item.priority] + "18",
                        color: PRIORITY_COLORS[item.priority],
                      }}
                    >
                      {item.priority} priority
                    </span>
                  </div>
                  <div className="text-sm font-bold" style={{ fontFamily: fonts.code, color: "#22c55e" }}>
                    {fmt(item.estimated_savings)} savings
                  </div>
                </div>
                <div className="text-sm font-medium mb-1" style={{ color: tokens.text }}>
                  {item.name} {item.pcp && <span className="text-xs font-normal" style={{ color: tokens.textMuted }}>(PCP: {item.pcp})</span>}
                </div>
                <div className="text-sm mb-2" style={{ color: tokens.textMuted }}>{item.reason}</div>
                <div className="text-sm px-3 py-2 rounded" style={{ background: tokens.surfaceAlt, color: tokens.text }}>
                  <span className="font-medium">Recommendation: </span>{item.recommendation}
                </div>
              </div>
            ))}
          </div>

          {/* Total savings callout */}
          <div className="mt-6 rounded-lg p-4 text-center" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div className="text-sm" style={{ color: "#166534" }}>Total estimated savings from education interventions</div>
            <div className="text-2xl font-bold mt-1" style={{ fontFamily: fonts.code, color: "#166534" }}>
              {fmt(education.reduce((sum, e) => sum + e.estimated_savings, 0))}/year
            </div>
          </div>
        </>
      )}
    </div>
  );
}
