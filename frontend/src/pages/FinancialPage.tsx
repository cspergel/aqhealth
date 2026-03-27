import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { DataTierBadge } from "../components/ui/DataTierBadge";
import { PnlStatement } from "../components/financial/PnlStatement";
import { ForecastChart } from "../components/financial/ForecastChart";
import { ReconciliationReport, type ReconciliationData } from "../components/financial/ReconciliationReport";

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
  // Dual data tier additions
  ibnr_estimate?: number;
  ibnr_confidence?: number;
  projected?: {
    expenses: Record<string, number>;
    surplus: number;
    mlr: number;
    per_member_margin: number;
  };
  signal_estimates?: Record<string, number>;
  data_completeness?: number;
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

type ActiveTab = "pnl" | "reconciliation";
type PnlView = "confirmed" | "projected";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function pct(n: number | null | undefined): string {
  return `${((n ?? 0) * 100).toFixed(1)}%`;
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
                  {(r.members ?? 0).toLocaleString()}
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
// Data Completeness Indicator
// ---------------------------------------------------------------------------

function DataCompletenessBar({ pct: completeness }: { pct: number }) {
  return (
    <div
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: tokens.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: tokens.textMuted }}>
          Data Completeness
        </div>
        <div className="text-[12px] font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>
          {completeness}% Record
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: tokens.surfaceAlt }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${completeness}%`,
            background: `linear-gradient(90deg, ${tokens.accent} 0%, ${tokens.accent} ${completeness}%, ${tokens.amber} 100%)`,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
          <span className="text-[10px]" style={{ color: tokens.textMuted }}>Record (adjudicated)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.amber }} />
          <span className="text-[10px]" style={{ color: tokens.textMuted }}>Signal (estimated)</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IBNR Line Item
// ---------------------------------------------------------------------------

function IbnrCard({ amount, confidence }: { amount: number; confidence: number }) {
  return (
    <div
      className="rounded-xl border bg-white p-5"
      style={{ borderColor: tokens.border, borderStyle: "dashed" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: tokens.text }}>
              IBNR Reserve
            </span>
            <DataTierBadge tooltip="Incurred But Not Reported: estimated costs for events where claims have not arrived yet." />
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: tokens.textMuted }}>
            Estimated claims not yet received from payers
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-lg font-bold"
            style={{ fontFamily: fonts.code, color: tokens.amber }}
          >
            {fmt(amount)}
          </div>
          <div className="text-[11px]" style={{ color: tokens.textMuted }}>
            {confidence}% confidence
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projected P&L Summary
// ---------------------------------------------------------------------------

function ProjectedExpensesSummary({
  pnl,
}: {
  pnl: PnlData;
}) {
  if (!pnl.projected || !pnl.signal_estimates) return null;

  const expenseLabels: Record<string, string> = {
    inpatient: "Inpatient",
    pharmacy: "Pharmacy",
    professional: "Professional",
    ed_observation: "ED / Observation",
    snf_postacute: "SNF / Post-Acute",
    home_health: "Home Health",
    dme: "DME",
    administrative: "Administrative",
    care_management: "Care Management",
    ibnr_reserve: "IBNR Reserve",
  };

  const projExpenses = pnl.projected.expenses;

  return (
    <div
      className="rounded-xl border bg-white p-6"
      style={{ borderColor: tokens.border }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2
            className="text-[15px] font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Projected P&L (Record + Signal + IBNR)
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
            Includes estimated costs from ADT events and IBNR reserve
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-[13px] font-bold"
          style={{
            fontFamily: fonts.code,
            background: pnl.projected.surplus >= 0 ? tokens.accentSoft : tokens.redSoft,
            color: pnl.projected.surplus >= 0 ? tokens.accentText : tokens.red,
          }}
        >
          Projected {pnl.projected.surplus >= 0 ? "Surplus" : "Deficit"}: {fmt(Math.abs(pnl.projected.surplus))}
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b" style={{ borderColor: tokens.border }}>
            <th className="text-left text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Expense Line
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Record
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Signal Est.
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Projected Total
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(projExpenses).map(([key, val]) => {
            if (key === "total") return null;
            const recordVal = key === "ibnr_reserve" ? 0 : (pnl.expenses as Record<string, number>)[key] || 0;
            const signalVal = key === "ibnr_reserve" ? val : (pnl.signal_estimates?.[key] || 0);
            const isIbnr = key === "ibnr_reserve";
            return (
              <tr key={key} className="border-b" style={{ borderColor: tokens.borderSoft }}>
                <td className="py-1.5 text-[13px]" style={{ color: tokens.textSecondary, paddingLeft: 8 }}>
                  <span className="flex items-center gap-1.5">
                    {expenseLabels[key] || key}
                    {(signalVal > 0 || isIbnr) && <DataTierBadge compact />}
                  </span>
                </td>
                <td className="py-1.5 text-right text-[13px]" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {isIbnr ? "--" : fmt(recordVal)}
                </td>
                <td className="py-1.5 text-right text-[13px]" style={{ fontFamily: fonts.code, color: tokens.amber }}>
                  {signalVal > 0 ? fmt(signalVal) : "--"}
                </td>
                <td className="py-1.5 text-right text-[13px] font-medium" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {fmt(val)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2" style={{ borderColor: tokens.border }}>
            <td className="py-2 text-[13px] font-semibold" style={{ color: tokens.text, paddingLeft: 8 }}>
              Total Projected Expenses
            </td>
            <td className="py-2 text-right text-[13px] font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>
              {fmt(pnl.expenses.total)}
            </td>
            <td className="py-2 text-right text-[13px] font-bold" style={{ fontFamily: fonts.code, color: tokens.amber }}>
              {fmt(projExpenses.total - pnl.expenses.total)}
            </td>
            <td className="py-2 text-right text-[13px] font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>
              {fmt(projExpenses.total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bottom KPIs */}
      <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t" style={{ borderColor: tokens.border }}>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            Projected MLR
          </div>
          <div className="text-lg font-bold mt-0.5" style={{ fontFamily: fonts.code, color: tokens.amber }}>
            {pct(pnl.projected.mlr)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: tokens.textMuted }}>
            Confirmed: {pct(pnl.mlr)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            Projected Per-Member
          </div>
          <div
            className="text-lg font-bold mt-0.5"
            style={{
              fontFamily: fonts.code,
              color: pnl.projected.per_member_margin >= 0 ? tokens.accentText : tokens.red,
            }}
          >
            ${pnl.projected.per_member_margin.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            IBNR Impact
          </div>
          <div className="text-lg font-bold mt-0.5" style={{ fontFamily: fonts.code, color: tokens.amber }}>
            {fmt(pnl.ibnr_estimate || 0)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: tokens.textMuted }}>
            {pnl.ibnr_confidence || 0}% confidence
          </div>
        </div>
      </div>
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
  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("pnl");
  const [pnlView, setPnlView] = useState<PnlView>("confirmed");

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([
      api.get("/api/financial/pnl"),
      api.get("/api/financial/pnl/by-plan"),
      api.get("/api/financial/pnl/by-group"),
      api.get("/api/financial/forecast"),
      api.get("/api/reconciliation/report"),
    ])
      .then(([pnlRes, planRes, groupRes, forecastRes, reconRes]) => {
        if (pnlRes.status === "fulfilled") setPnl(pnlRes.value.data);
        else { setError("Failed to load P&L data."); return; }
        if (planRes.status === "fulfilled") setByPlan(Array.isArray(planRes.value.data) ? planRes.value.data : []);
        if (groupRes.status === "fulfilled") setByGroup(Array.isArray(groupRes.value.data) ? groupRes.value.data : []);
        if (forecastRes.status === "fulfilled") setForecast(forecastRes.value.data);
        if (reconRes.status === "fulfilled") setReconciliation(reconRes.value.data);
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

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "pnl", label: "Profit & Loss" },
    { key: "reconciliation", label: "Reconciliation" },
  ];

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Financial Performance
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            MSO profit & loss analysis across {(pnl.member_count ?? 0).toLocaleString()} members
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: tokens.surfaceAlt }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className="px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
              style={{
                background: activeTab === tab.key ? tokens.surface : "transparent",
                color: activeTab === tab.key ? tokens.text : tokens.textMuted,
                boxShadow: activeTab === tab.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "pnl" && (
        <>
          {/* Confirmed / Projected toggle */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: tokens.surfaceAlt }}>
              <button
                className="px-3 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background: pnlView === "confirmed" ? tokens.surface : "transparent",
                  color: pnlView === "confirmed" ? tokens.accentText : tokens.textMuted,
                  boxShadow: pnlView === "confirmed" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                onClick={() => setPnlView("confirmed")}
              >
                Confirmed
              </button>
              <button
                className="px-3 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background: pnlView === "projected" ? tokens.surface : "transparent",
                  color: pnlView === "projected" ? tokens.amber : tokens.textMuted,
                  boxShadow: pnlView === "projected" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                onClick={() => setPnlView("projected")}
              >
                Projected
              </button>
            </div>
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>
              {pnlView === "confirmed"
                ? "Record-tier only (adjudicated claims)"
                : "Record + Signal estimates + IBNR reserve"}
            </span>
            {pnl.data_completeness != null && (
              <span
                className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded"
                style={{
                  background: pnl.data_completeness >= 90 ? tokens.accentSoft : tokens.amberSoft,
                  color: pnl.data_completeness >= 90 ? tokens.accentText : tokens.amber,
                }}
              >
                {pnl.data_completeness}% complete
              </span>
            )}
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
              label={pnlView === "projected" ? "Projected Expenses" : "Total Expenses"}
              value={fmt(pnlView === "projected" && pnl.projected ? pnl.projected.expenses.total : pnl.expenses.total)}
              trend={`+${fmt(pnl.expenses.total - pnl.comparison.prior_year.expenses)} vs PY`}
              trendDirection="up"
            />
            <MetricCard
              label={pnlView === "projected" ? "Projected Surplus" : "Net Surplus"}
              value={fmt(pnlView === "projected" && pnl.projected ? pnl.projected.surplus : pnl.surplus)}
              trend={`${pnl.surplus > pnl.comparison.budget.surplus ? "+" : ""}${fmt(pnl.surplus - pnl.comparison.budget.surplus)} vs Budget`}
              trendDirection={pnl.surplus > pnl.comparison.budget.surplus ? "up" : "down"}
            />
            <MetricCard
              label="Per-Member Margin"
              value={`$${(pnlView === "projected" && pnl.projected ? pnl.projected.per_member_margin : pnl.per_member_margin).toFixed(2)}`}
            />
          </div>

          {pnlView === "confirmed" ? (
            <>
              {/* P&L Statement + MLR Gauge */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                <div className="lg:col-span-3">
                  <PnlStatement data={pnl} />
                </div>
                <div className="space-y-4">
                  <MlrGauge mlr={pnl.mlr} />
                  {pnl.data_completeness != null && (
                    <DataCompletenessBar pct={pnl.data_completeness} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Projected P&L with signal estimates + IBNR */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                <div className="lg:col-span-3">
                  <ProjectedExpensesSummary pnl={pnl} />
                </div>
                <div className="space-y-4">
                  <MlrGauge mlr={pnl.projected?.mlr || pnl.mlr} />
                  {pnl.ibnr_estimate != null && (
                    <IbnrCard
                      amount={pnl.ibnr_estimate}
                      confidence={pnl.ibnr_confidence || 0}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* P&L by Plan and Group */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <MarginTable title="P&L by Health Plan" rows={byPlan} nameKey="plan" />
            <MarginTable title="P&L by Provider Group" rows={byGroup} nameKey="group" />
          </div>

          {/* Revenue Forecast */}
          {forecast && <ForecastChart data={forecast} />}
        </>
      )}

      {activeTab === "reconciliation" && reconciliation && (
        <ReconciliationReport data={reconciliation} />
      )}

      {activeTab === "reconciliation" && !reconciliation && (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: tokens.textMuted }}>
            No reconciliation data available yet.
          </p>
        </div>
      )}
    </div>
  );
}
