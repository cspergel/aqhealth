import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { PnlStatement } from "../components/financial/PnlStatement";
import { ForecastChart } from "../components/financial/ForecastChart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PnlData {
  period: string;
  revenue: {
    capitation: number;
    raf_adjustment: number;
    quality_bonus: number;
    per_capture_fees: number;
    total: number;
  };
  expenses: {
    inpatient: number;
    pharmacy: number;
    professional: number;
    ed_observation: number;
    snf_postacute: number;
    home_health: number;
    dme: number;
    administrative: number;
    care_management: number;
    total: number;
  };
  surplus: number;
  mlr: number;
  member_count: number;
  per_member_margin: number;
  comparison: {
    budget: { revenue: number; expenses: number; surplus: number; mlr: number };
    prior_year: { revenue: number; expenses: number; surplus: number; mlr: number };
    prior_quarter: { revenue: number; expenses: number; surplus: number; mlr: number };
  };
}

interface PlanPnl {
  plan: string;
  members: number;
  revenue: number;
  expenses: number;
  surplus: number;
  mlr: number;
  per_member_margin: number;
}

interface GroupPnl {
  group: string;
  providers: number;
  members: number;
  revenue: number;
  expenses: number;
  surplus: number;
  mlr: number;
  per_member_margin: number;
}

interface ForecastData {
  months: number;
  projections: {
    month_offset: number;
    label: string;
    revenue: number;
    expense: number;
    margin: number;
    revenue_low: number;
    revenue_high: number;
    expense_low: number;
    expense_high: number;
  }[];
  summary: {
    total_projected_revenue: number;
    total_projected_expense: number;
    total_projected_margin: number;
    avg_monthly_margin: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// MLR Gauge
// ---------------------------------------------------------------------------

function MlrGauge({ mlr }: { mlr: number }) {
  const mlrPct = mlr * 100;
  // Gauge from 70% to 110%
  const min = 70;
  const max = 110;
  const clampedPct = Math.max(min, Math.min(max, mlrPct));
  const angle = ((clampedPct - min) / (max - min)) * 180 - 90; // -90 to 90
  const isHealthy = mlrPct <= 85;
  const isWarning = mlrPct > 85 && mlrPct <= 95;

  return (
    <div
      className="rounded-xl border bg-white p-6 flex flex-col items-center"
      style={{ borderColor: tokens.border }}
    >
      <div className="text-[11px] uppercase font-semibold tracking-wider mb-3" style={{ color: tokens.textMuted }}>
        Medical Loss Ratio
      </div>

      {/* Gauge SVG */}
      <svg viewBox="0 0 200 120" width="200" height="120">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={tokens.borderSoft}
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Green zone (70-85%) */}
        <path
          d="M 20 100 A 80 80 0 0 1 74 28"
          fill="none"
          stroke={tokens.accent}
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.3"
        />
        {/* Amber zone (85-95%) */}
        <path
          d="M 74 28 A 80 80 0 0 1 140 28"
          fill="none"
          stroke={tokens.amber}
          strokeWidth="12"
          opacity="0.3"
        />
        {/* Red zone (95-110%) */}
        <path
          d="M 140 28 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={tokens.red}
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.3"
        />
        {/* Needle */}
        <line
          x1="100"
          y1="100"
          x2={100 + 65 * Math.cos((angle * Math.PI) / 180)}
          y2={100 - 65 * Math.sin((angle * Math.PI) / 180)}
          stroke={isHealthy ? tokens.accent : isWarning ? tokens.amber : tokens.red}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="5" fill={isHealthy ? tokens.accent : isWarning ? tokens.amber : tokens.red} />
      </svg>

      <div
        className="text-2xl font-bold mt-2"
        style={{
          fontFamily: fonts.code,
          color: isHealthy ? tokens.accentText : isWarning ? tokens.amber : tokens.red,
        }}
      >
        {mlrPct.toFixed(1)}%
      </div>
      <div className="text-[11px] mt-1" style={{ color: tokens.textMuted }}>
        {isHealthy ? "Healthy" : isWarning ? "Monitor closely" : "Above target"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Margin Table (for plans or groups)
// ---------------------------------------------------------------------------

function MarginTable({
  title,
  rows,
  nameKey,
}: {
  title: string;
  rows: (PlanPnl | GroupPnl)[];
  nameKey: "plan" | "group";
}) {
  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: tokens.border }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: tokens.border }}>
        <h3
          className="text-[14px] font-semibold"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          {title}
        </h3>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ background: tokens.surfaceAlt }}>
            {["Name", "Members", "Revenue", "Expenses", "Margin", "MLR"].map((h) => (
              <th
                key={h}
                className="text-left text-[11px] font-semibold px-4 py-2 uppercase tracking-wider"
                style={{ color: tokens.textMuted }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const name = (r as unknown as Record<string, unknown>)[nameKey] as string;
            return (
              <tr
                key={name}
                className="border-b hover:bg-stone-50/50 transition-colors"
                style={{ borderColor: tokens.borderSoft }}
              >
                <td className="px-4 py-2.5 text-[13px] font-medium" style={{ color: tokens.text }}>
                  {name}
                </td>
                <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                  {r.members.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {fmt(r.revenue)}
                </td>
                <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {fmt(r.expenses)}
                </td>
                <td
                  className="px-4 py-2.5 text-[13px] font-bold"
                  style={{
                    fontFamily: fonts.code,
                    color: r.surplus >= 0 ? tokens.accentText : tokens.red,
                  }}
                >
                  {r.surplus >= 0 ? "+" : ""}{fmt(r.surplus)}
                </td>
                <td
                  className="px-4 py-2.5 text-[13px] font-medium"
                  style={{
                    fontFamily: fonts.code,
                    color: r.mlr <= 0.85 ? tokens.accentText : r.mlr <= 0.95 ? tokens.amber : tokens.red,
                  }}
                >
                  {pct(r.mlr)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financial Page
// ---------------------------------------------------------------------------

export function FinancialPage() {
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [byPlan, setByPlan] = useState<PlanPnl[]>([]);
  const [byGroup, setByGroup] = useState<GroupPnl[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get("/api/financial/pnl"),
      api.get("/api/financial/pnl/by-plan"),
      api.get("/api/financial/pnl/by-group"),
      api.get("/api/financial/forecast"),
    ])
      .then(([pnlRes, planRes, groupRes, forecastRes]) => {
        setPnl(pnlRes.data);
        setByPlan(planRes.data);
        setByGroup(groupRes.data);
        setForecast(forecastRes.data);
      })
      .catch((err) => {
        console.error("Failed to load financial data:", err);
        setError("Failed to load financial data.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: tokens.textMuted }}>
          Loading financial analytics...
        </div>
      </div>
    );
  }

  if (error || !pnl) {
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
      <div className="mb-6">
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Financial Performance
        </h1>
        <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
          MSO profit & loss analysis across {pnl.member_count.toLocaleString()} members
        </p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Total Revenue"
          value={fmt(pnl.revenue.total)}
          trend={`+${fmt(pnl.revenue.total - pnl.comparison.prior_year.revenue)} vs PY`}
          trendDirection="up"
        />
        <MetricCard
          label="Total Expenses"
          value={fmt(pnl.expenses.total)}
          trend={`+${fmt(pnl.expenses.total - pnl.comparison.prior_year.expenses)} vs PY`}
          trendDirection="up"
        />
        <MetricCard
          label="Net Surplus"
          value={fmt(pnl.surplus)}
          trend={`${pnl.surplus > pnl.comparison.budget.surplus ? "+" : ""}${fmt(pnl.surplus - pnl.comparison.budget.surplus)} vs Budget`}
          trendDirection={pnl.surplus > pnl.comparison.budget.surplus ? "up" : "down"}
        />
        <MetricCard
          label="Per-Member Margin"
          value={`$${pnl.per_member_margin.toFixed(2)}`}
        />
      </div>

      {/* P&L Statement + MLR Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="lg:col-span-3">
          <PnlStatement data={pnl} />
        </div>
        <div>
          <MlrGauge mlr={pnl.mlr} />
        </div>
      </div>

      {/* P&L by Plan and Group */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <MarginTable title="P&L by Health Plan" rows={byPlan} nameKey="plan" />
        <MarginTable title="P&L by Provider Group" rows={byGroup} nameKey="group" />
      </div>

      {/* Revenue Forecast */}
      {forecast && <ForecastChart data={forecast} />}
    </div>
  );
}
