import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { InsightCard } from "../components/ui/InsightCard";
import { CategoryCard } from "../components/expenditure/CategoryCard";
import { DrillDown } from "../components/expenditure/DrillDown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  key: string;
  label: string;
  total_spend: number;
  pmpm: number;
  pct_of_total: number;
  claim_count: number;
  trend_vs_prior: number;
}

interface Overview {
  total_spend: number;
  pmpm: number;
  mlr: number;
  member_count: number;
  categories: Category[];
}

interface InsightData {
  id: number;
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
  category: string;
}

interface PartData {
  part: string;
  label: string;
  total_spend: number;
  pmpm: number;
  claim_count: number;
  member_count: number;
  trend: number;
}

interface PartAnalysis {
  parts: Record<string, PartData>;
  total_spend: number;
  member_count: number;
  member_months: number;
}

interface PeriodData {
  period: string;
  total_spend: number;
  pmpm: number;
  by_category: Record<string, number>;
  by_part: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PART_COLORS: Record<string, string> = {
  A: "#2563eb",
  B: "#16a34a",
  C: "#d97706",
  D: "#dc2626",
};

export function ExpenditurePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, _setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"categories" | "parts" | "trends">("categories");
  const [partAnalysis, setPartAnalysis] = useState<PartAnalysis | null>(null);
  const [periodData, setPeriodData] = useState<PeriodData[]>([]);
  const [periodGroupBy, setPeriodGroupBy] = useState<"month" | "quarter" | "year">("month");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get("/api/expenditure"),
      api.get("/api/expenditure/by-part"),
      api.get(`/api/expenditure/by-period?group_by=${periodGroupBy}`),
    ])
      .then(([overviewRes, partRes, periodRes]) => {
        setOverview(overviewRes.data);
        setPartAnalysis(partRes.data);
        setPeriodData(periodRes.data);
      })
      .catch((err) => {
        console.error("Failed to load expenditure overview:", err);
        setError("Failed to load expenditure data.");
      })
      .finally(() => setLoading(false));
  }, [periodGroupBy]);

  // If a category is selected, show the drill-down
  if (selectedCategory) {
    return (
      <div className="p-7">
        <DrillDown
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: tokens.textMuted }}>
          Loading expenditure analytics...
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-7 text-center">
        <div className="text-sm" style={{ color: tokens.red }}>
          {error || "No data available."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Expenditure Analytics
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Total medical spend across {(overview.member_count ?? 0).toLocaleString()} members
          </p>
        </div>
        <button
          onClick={() => {
            window.open(
              `${api.defaults.baseURL}/api/expenditure/export`,
              "_blank"
            );
          }}
          className="text-[13px] px-4 py-2 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Export CSV
        </button>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <MetricCard
          label="Total Spend"
          value={formatDollars(overview.total_spend)}
        />
        <MetricCard
          label="PMPM"
          value={`$${(overview.pmpm ?? 0).toFixed(2)}`}
        />
        <MetricCard
          label="Medical Loss Ratio"
          value={`${((overview.mlr ?? 0) * 100).toFixed(1)}%`}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b mb-6" style={{ borderColor: tokens.border }}>
        {([
          { key: "categories" as const, label: "By Category" },
          { key: "parts" as const, label: "Medicare Parts" },
          { key: "trends" as const, label: "Period Trends" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 text-[13px] font-medium transition-colors relative"
            style={{
              color: activeTab === tab.key ? tokens.accentText : tokens.textSecondary,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: tokens.accent }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Category tab */}
      {activeTab === "categories" && (
        <>
          <h2
            className="text-[14px] font-semibold mb-4"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Spend by Service Category
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {(overview.categories ?? []).map((cat) => (
              <CategoryCard
                key={cat.key}
                categoryKey={cat.key}
                label={cat.label}
                totalSpend={cat.total_spend}
                pmpm={cat.pmpm}
                pctOfTotal={cat.pct_of_total}
                trendVsPrior={cat.trend_vs_prior}
                onClick={() => setSelectedCategory(cat.key)}
              />
            ))}
          </div>
        </>
      )}

      {/* Medicare Parts tab */}
      {activeTab === "parts" && partAnalysis && (
        <div className="mb-8">
          <h2
            className="text-[14px] font-semibold mb-4"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Medicare Part A / B / C / D Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Object.values(partAnalysis.parts).map((part) => {
              const pctOfTotal = partAnalysis.total_spend > 0
                ? ((part.total_spend / partAnalysis.total_spend) * 100).toFixed(1)
                : "0.0";
              return (
                <div
                  key={part.part}
                  className="rounded-[10px] border bg-white p-4"
                  style={{ borderColor: tokens.border }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: PART_COLORS[part.part] || tokens.textMuted }}
                    />
                    <span className="text-[13px] font-semibold" style={{ color: tokens.text }}>
                      Part {part.part}
                    </span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: tokens.text, fontFamily: fonts.code }}>
                    {formatDollars(part.total_spend)}
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: tokens.textMuted }}>
                    {pctOfTotal}% of total
                  </div>
                  <div className="flex justify-between mt-2 text-[11px]" style={{ color: tokens.textSecondary }}>
                    <span>PMPM: ${part.pmpm}</span>
                    <span>{part.claim_count.toLocaleString()} claims</span>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: tokens.textMuted }}>
                    {part.member_count.toLocaleString()} members
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stacked proportion bar */}
          <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text, fontFamily: fonts.heading }}>
              Spend Distribution
            </h3>
            <div className="h-6 rounded-full overflow-hidden flex" style={{ background: tokens.surfaceAlt }}>
              {Object.values(partAnalysis.parts).map((part) => {
                const pct = partAnalysis.total_spend > 0
                  ? (part.total_spend / partAnalysis.total_spend) * 100
                  : 0;
                return (
                  <div
                    key={part.part}
                    style={{ width: `${pct}%`, background: PART_COLORS[part.part] || "#ccc" }}
                    title={`Part ${part.part}: ${formatDollars(part.total_spend)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex gap-4 mt-2">
              {Object.values(partAnalysis.parts).map((part) => (
                <div key={part.part} className="flex items-center gap-1.5 text-[11px]" style={{ color: tokens.textSecondary }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: PART_COLORS[part.part] }} />
                  Part {part.part}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Period Trends tab */}
      {activeTab === "trends" && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-[14px] font-semibold"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Expenditure Trends
            </h2>
            <div className="flex gap-1">
              {(["month", "quarter", "year"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setPeriodGroupBy(g)}
                  className="text-[12px] px-3 py-1.5 rounded-full border transition-colors"
                  style={{
                    borderColor: periodGroupBy === g ? tokens.accent : tokens.border,
                    background: periodGroupBy === g ? tokens.accentSoft : "transparent",
                    color: periodGroupBy === g ? tokens.accentText : tokens.textSecondary,
                    fontWeight: periodGroupBy === g ? 600 : 400,
                  }}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}ly
                </button>
              ))}
            </div>
          </div>

          {/* Period table */}
          <div className="rounded-[10px] border bg-white" style={{ borderColor: tokens.border }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}>
                  <th className="text-left font-medium p-3 text-[11px]">Period</th>
                  <th className="text-right font-medium p-3 text-[11px]">Total Spend</th>
                  <th className="text-right font-medium p-3 text-[11px]">PMPM</th>
                  <th className="text-right font-medium p-3 text-[11px]">Part A</th>
                  <th className="text-right font-medium p-3 text-[11px]">Part B</th>
                  <th className="text-right font-medium p-3 text-[11px]">Part D</th>
                </tr>
              </thead>
              <tbody>
                {periodData.map((pd) => (
                  <tr key={pd.period} className="border-t" style={{ borderColor: tokens.borderSoft }}>
                    <td className="p-3 font-medium" style={{ color: tokens.text }}>{pd.period}</td>
                    <td className="text-right p-3" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                      {formatDollars(pd.total_spend)}
                    </td>
                    <td className="text-right p-3" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                      ${pd.pmpm.toLocaleString()}
                    </td>
                    <td className="text-right p-3" style={{ fontFamily: fonts.code, color: PART_COLORS.A }}>
                      {formatDollars(pd.by_part?.A || 0)}
                    </td>
                    <td className="text-right p-3" style={{ fontFamily: fonts.code, color: PART_COLORS.B }}>
                      {formatDollars(pd.by_part?.B || 0)}
                    </td>
                    <td className="text-right p-3" style={{ fontFamily: fonts.code, color: PART_COLORS.D }}>
                      {formatDollars(pd.by_part?.D || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visual bar chart */}
          <div className="rounded-[10px] border bg-white p-5 mt-4" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text, fontFamily: fonts.heading }}>
              Spend by Period
            </h3>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {periodData.map((pd) => {
                const maxSpend = Math.max(...periodData.map((p) => p.total_spend), 1);
                const height = (pd.total_spend / maxSpend) * 100;
                return (
                  <div key={pd.period} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm"
                      style={{ height: `${height}%`, background: tokens.accent, minHeight: 2 }}
                      title={`${pd.period}: ${formatDollars(pd.total_spend)}`}
                    />
                    <span className="text-[9px]" style={{ color: tokens.textMuted }}>
                      {pd.period.slice(-2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Insights */}
      {insights.length > 0 && (
        <div>
          <h2
            className="text-[14px] font-semibold mb-4"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            AI Cost Recommendations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                title={insight.title}
                description={insight.description}
                impact={
                  insight.dollar_impact
                    ? `$${insight.dollar_impact.toLocaleString("en-US")} potential savings`
                    : undefined
                }
                category="cost"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
