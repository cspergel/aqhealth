import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { RafDistribution } from "../components/dashboard/RafDistribution";
import { InsightPanel } from "../components/dashboard/InsightPanel";
import { ProviderLeaderboard } from "../components/dashboard/ProviderLeaderboard";
import { SystemPerformance } from "../components/dashboard/SystemPerformance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuspectInventory {
  count: number;
  total_raf_value: number;
  total_annual_value: number;
}

interface Metrics {
  total_lives: number;
  avg_raf: number;
  recapture_rate: number;
  suspect_inventory: SuspectInventory;
  total_pmpm: number;
  mlr: number;
}

interface RafBucket {
  range: string;
  count: number;
}

interface RevenueOpportunity {
  hcc_code: number;
  hcc_label: string;
  member_count: number;
  total_raf: number;
  total_value: number;
}

interface CostHotspot {
  category: string;
  total_spend: number;
  claim_count: number;
  pmpm: number;
  benchmark_pmpm: number;
  variance_pct: number;
}

interface ProviderRow {
  id: number;
  name: string;
  specialty: string | null;
  panel_size: number | null;
  capture_rate: number;
}

interface CareGap {
  measure_code: string;
  measure_name: string;
  category: string | null;
  total_gaps: number;
  open_count: number;
  closed_count: number;
  closure_rate: number;
}

interface DashboardData {
  metrics: Metrics;
  raf_distribution: RafBucket[];
  revenue_opportunities: RevenueOpportunity[];
  cost_hotspots: CostHotspot[];
  provider_leaderboard: { top: ProviderRow[]; bottom: ProviderRow[] };
  care_gap_summary: CareGap[];
}

interface DashboardActions {
  pending_auths: number;
  overdue_auths: number;
  past_due_care_plan_goals: number;
  members_not_contacted: number;
  critical_care_gaps: number;
  unacknowledged_adt_alerts: number;
  triggered_alert_rules: number;
  total_action_items: number;
}

interface DashboardInsight {
  id: number;
  category: "revenue" | "cost" | "quality" | "provider" | "trend" | "cross_module";
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDollar(value: number | null | undefined): string {
  const v = value ?? 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

const CATEGORY_LABELS: Record<string, string> = {
  inpatient: "Inpatient",
  ed_observation: "ED / Observation",
  professional: "Professional",
  snf_postacute: "SNF / Post-Acute",
  pharmacy: "Pharmacy",
  home_health: "Home Health",
  dme: "DME",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [actions, setActions] = useState<DashboardActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, insightRes, actionsRes] = await Promise.all([
        api.get("/api/dashboard"),
        api.get("/api/dashboard/insights"),
        api.get("/api/dashboard/actions"),
      ]);
      setData(dashRes.data);
      setInsights(insightRes.data);
      setActions(actionsRes.data);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load dashboard";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.textMuted }}>Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.red }}>{error || "No data available"}</div>
      </div>
    );
  }

  const metrics = data.metrics ?? {} as Metrics;
  const raf_distribution = data.raf_distribution ?? [];
  const revenue_opportunities = data.revenue_opportunities ?? [];
  const cost_hotspots = data.cost_hotspots ?? [];
  const provider_leaderboard = data.provider_leaderboard ?? { top: [], bottom: [] };
  const care_gap_summary = data.care_gap_summary ?? [];

  return (
    <div className="p-7 flex flex-col gap-6">
      {/* Page title */}
      <div>
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Population Dashboard
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: tokens.textMuted }}>
          Overview of your managed care population performance.
        </p>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Total Lives"
          value={fmtNumber(metrics.total_lives ?? 0)}
        />
        <MetricCard
          label="Avg RAF Score"
          value={(metrics.avg_raf ?? 0).toFixed(3)}
        />
        <MetricCard
          label="Recapture Rate"
          value={`${(metrics.recapture_rate ?? 0).toFixed(1)}%`}
        />
        <MetricCard
          label="Suspect Inventory"
          value={fmtNumber(metrics.suspect_inventory?.count ?? 0)}
          trend={fmtDollar(metrics.suspect_inventory?.total_annual_value ?? 0) + " opportunity"}
        />
        <MetricCard
          label="Total PMPM"
          value={`$${(metrics.total_pmpm ?? 0).toFixed(0)}`}
        />
        <MetricCard
          label="MLR"
          value={`${((metrics.mlr ?? 0) * 100).toFixed(1)}%`}
          trendDirection={(metrics.mlr ?? 0) > 0.85 ? "down" : "up"}
          trend={(metrics.mlr ?? 0) > 0.85 ? "Above target" : "On track"}
        />
      </div>

      {/* Needs Attention action bar */}
      {actions && actions.total_action_items > 0 && (
        <div
          className="rounded-[10px] border p-3 flex flex-wrap items-center gap-3"
          style={{ borderColor: tokens.amber, background: tokens.amberSoft }}
        >
          <span className="text-[13px] font-semibold" style={{ color: tokens.amber }}>
            Needs Attention:
          </span>
          {actions.overdue_auths > 0 && (
            <button
              onClick={() => navigate("/prior-auth")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.overdue_auths} overdue auth{actions.overdue_auths > 1 ? "s" : ""}
            </button>
          )}
          {actions.past_due_care_plan_goals > 0 && (
            <button
              onClick={() => navigate("/care-plans")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.past_due_care_plan_goals} care plan{actions.past_due_care_plan_goals > 1 ? "s" : ""} past due
            </button>
          )}
          {actions.members_not_contacted > 0 && (
            <button
              onClick={() => navigate("/case-management")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.members_not_contacted} member{actions.members_not_contacted > 1 ? "s" : ""} not contacted
            </button>
          )}
          {actions.critical_care_gaps > 0 && (
            <button
              onClick={() => navigate("/care-gaps")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.critical_care_gaps} critical gap{actions.critical_care_gaps > 1 ? "s" : ""}
            </button>
          )}
          {actions.unacknowledged_adt_alerts > 0 && (
            <button
              onClick={() => navigate("/alerts")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.unacknowledged_adt_alerts} ADT alert{actions.unacknowledged_adt_alerts > 1 ? "s" : ""}
            </button>
          )}
          {actions.triggered_alert_rules > 0 && (
            <button
              onClick={() => navigate("/alert-rules")}
              className="text-[12px] px-2.5 py-1 rounded-md border hover:bg-white/50 transition-colors"
              style={{ borderColor: tokens.amber, color: tokens.amber, background: "transparent", cursor: "pointer" }}
            >
              {actions.triggered_alert_rules} triggered rule{actions.triggered_alert_rules > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: 2/3 width */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* RAF Distribution chart */}
          <RafDistribution data={raf_distribution} />

          {/* Revenue Opportunities */}
          <div
            className="rounded-[10px] border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: tokens.text, fontFamily: fonts.heading }}
            >
              Revenue Opportunities
            </h3>
            {revenue_opportunities.length === 0 ? (
              <div className="text-[13px] py-4 text-center" style={{ color: tokens.textMuted }}>
                No open revenue opportunities.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: tokens.textMuted }}>
                    <th className="text-left font-medium pb-2 text-[11px]">HCC Category</th>
                    <th className="text-right font-medium pb-2 text-[11px]">Members</th>
                    <th className="text-right font-medium pb-2 text-[11px]">RAF Impact</th>
                    <th className="text-right font-medium pb-2 text-[11px]">$ Value</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue_opportunities.map((opp) => (
                    <tr key={opp.hcc_code} className="border-t" style={{ borderColor: tokens.borderSoft }}>
                      <td className="py-2" style={{ color: tokens.text }}>
                        <span className="font-medium">HCC {opp.hcc_code}</span>
                        <span className="ml-1.5" style={{ color: tokens.textSecondary }}>{opp.hcc_label}</span>
                      </td>
                      <td className="text-right py-2" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                        {opp.member_count}
                      </td>
                      <td className="text-right py-2" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                        {(opp.total_raf ?? 0).toFixed(2)}
                      </td>
                      <td className="text-right py-2 font-semibold" style={{ color: tokens.accentText, fontFamily: fonts.code, fontSize: 12 }}>
                        {fmtDollar(opp.total_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Cost Hotspots */}
          <div
            className="rounded-[10px] border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: tokens.text, fontFamily: fonts.heading }}
            >
              Cost Hotspots
            </h3>
            {cost_hotspots.length === 0 ? (
              <div className="text-[13px] py-4 text-center" style={{ color: tokens.textMuted }}>
                No cost data available.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: tokens.textMuted }}>
                    <th className="text-left font-medium pb-2 text-[11px]">Category</th>
                    <th className="text-right font-medium pb-2 text-[11px]">Total Spend</th>
                    <th className="text-right font-medium pb-2 text-[11px]">PMPM</th>
                    <th className="text-right font-medium pb-2 text-[11px]">Benchmark</th>
                    <th className="text-right font-medium pb-2 text-[11px]">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {cost_hotspots.map((spot) => {
                    const isOver = (spot.variance_pct ?? 0) > 0;
                    return (
                      <tr key={spot.category} className="border-t" style={{ borderColor: tokens.borderSoft }}>
                        <td className="py-2 font-medium" style={{ color: tokens.text }}>
                          {CATEGORY_LABELS[spot.category] || spot.category}
                        </td>
                        <td className="text-right py-2" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                          {fmtDollar(spot.total_spend)}
                        </td>
                        <td className="text-right py-2" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                          ${(spot.pmpm ?? 0).toFixed(0)}
                        </td>
                        <td className="text-right py-2" style={{ color: tokens.textMuted, fontFamily: fonts.code, fontSize: 12 }}>
                          ${(spot.benchmark_pmpm ?? 0).toFixed(0)}
                        </td>
                        <td
                          className="text-right py-2 font-semibold"
                          style={{
                            fontFamily: fonts.code,
                            fontSize: 12,
                            color: isOver ? tokens.red : tokens.accentText,
                          }}
                        >
                          {isOver ? "+" : ""}{(spot.variance_pct ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column: 1/3 width */}
        <div className="flex flex-col gap-6">
          {/* Insight Panel */}
          <InsightPanel
            insights={insights}
            lastDiscoveryAt={new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()}
            onRefresh={() => {
              api.get("/api/dashboard/insights").then((res) => setInsights(res.data));
            }}
          />

          {/* Provider Leaderboard */}
          <ProviderLeaderboard
            top={provider_leaderboard.top}
            bottom={provider_leaderboard.bottom}
          />

          {/* System Performance */}
          <SystemPerformance />

          {/* Care Gap Summary */}
          <div
            className="rounded-[10px] border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: tokens.text, fontFamily: fonts.heading }}
            >
              Care Gap Summary
            </h3>
            {care_gap_summary.length === 0 ? (
              <div className="text-[13px] py-4 text-center" style={{ color: tokens.textMuted }}>
                No care gap data available.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {care_gap_summary.map((gap) => (
                  <div key={gap.measure_code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium" style={{ color: tokens.text }}>
                        {gap.measure_name}
                      </span>
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: tokens.accentText, fontFamily: fonts.code }}
                      >
                        {(gap.closure_rate ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full" style={{ background: tokens.surfaceAlt }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${Math.min(gap.closure_rate ?? 0, 100)}%`,
                          background: tokens.accent,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                        {gap.open_count} open
                      </span>
                      <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                        {gap.closed_count} / {gap.total_gaps} closed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
