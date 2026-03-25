import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { RiskTable, type RiskMember } from "../components/predictions/RiskTable";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "risk" | "costs" | "raf";

interface CostCategory {
  category: string;
  current_quarterly_spend: number;
  projected_quarterly_spend: number;
  change_pct: number;
  confidence_low: number;
  confidence_high: number;
  confidence_level: number;
}

interface CostProjection {
  projection_period: string;
  member_count: number;
  total_current_quarterly: number;
  total_projected_quarterly: number;
  total_change_pct: number;
  categories: CostCategory[];
}

interface RafScenario {
  label: string;
  avg_raf: number;
  total_raf: number;
  annual_revenue: number;
  revenue_uplift: number;
  raf_change: number;
  capture_rate: number;
  confidence: number;
}

interface RafProjection {
  current_state: {
    total_lives: number;
    avg_raf: number;
    total_raf: number;
    annual_revenue: number;
    capture_rate: number;
    open_suspects: number;
  };
  scenario_all_captured: RafScenario;
  scenario_80_recapture: RafScenario;
  suspect_summary: {
    open_count: number;
    captured_count: number;
    total_suspect_raf_value: number;
    total_suspect_annual_value: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  inpatient: "Inpatient",
  ed_observation: "ED/Obs",
  pharmacy: "Pharmacy",
  professional: "Professional",
  snf_postacute: "SNF/Post-Acute",
  home_health: "Home Health",
  dme: "DME",
  other: "Other",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "risk", label: "Risk Alerts" },
  { key: "costs", label: "Cost Projections" },
  { key: "raf", label: "RAF Projections" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PredictionsPage() {
  const [tab, setTab] = useState<Tab>("risk");
  const [riskMembers, setRiskMembers] = useState<RiskMember[]>([]);
  const [costProjection, setCostProjection] = useState<CostProjection | null>(null);
  const [rafProjection, setRafProjection] = useState<RafProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const endpoint =
      tab === "risk" ? "/api/predictions/hospitalization-risk" :
      tab === "costs" ? "/api/predictions/cost-trajectory" :
      "/api/predictions/raf-impact";

    api.get(endpoint)
      .then((res) => {
        if (tab === "risk") setRiskMembers(res.data);
        else if (tab === "costs") setCostProjection(res.data);
        else setRafProjection(res.data);
      })
      .catch((err) => {
        console.error("Failed to load predictions:", err);
        setError("Failed to load prediction data.");
      })
      .finally(() => setLoading(false));
  }, [tab]);

  // Risk summary stats
  const highRiskCount = riskMembers.filter((m) => m.risk_level === "high").length;
  const mediumRiskCount = riskMembers.filter((m) => m.risk_level === "medium").length;
  const avgRiskScore = riskMembers.length > 0
    ? (riskMembers.reduce((s, m) => s + m.risk_score, 0) / riskMembers.length).toFixed(1)
    : "0";

  // Chart data for cost projections
  const costChartData = costProjection?.categories.map((c) => ({
    name: CATEGORY_LABELS[c.category] || c.category,
    current: Math.round(c.current_quarterly_spend / 1000),
    projected: Math.round(c.projected_quarterly_spend / 1000),
    change_pct: c.change_pct,
  })) || [];

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold tracking-tight mb-1"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Predictive Analytics
        </h1>
        <p className="text-[13px]" style={{ color: tokens.textMuted }}>
          Risk scoring, cost projections, and RAF impact modeling
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: tokens.border }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px"
            style={{
              color: tab === t.key ? tokens.text : tokens.textMuted,
              borderBottomColor: tab === t.key ? tokens.accent : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg p-4 mb-4 text-[13px]" style={{ background: tokens.redSoft, color: tokens.red }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-20 text-center text-[13px]" style={{ color: tokens.textMuted }}>
          Loading predictions...
        </div>
      )}

      {/* =================== RISK ALERTS =================== */}
      {!loading && tab === "risk" && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Members Scored</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>{riskMembers.length}</div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.red + "30", background: tokens.redSoft }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.red }}>High Risk (&gt;70%)</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.red }}>{highRiskCount}</div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.amber + "30", background: tokens.amberSoft }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.amber }}>Medium Risk (40-70%)</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.amber }}>{mediumRiskCount}</div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Avg Risk Score</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>{avgRiskScore}%</div>
            </div>
          </div>

          {/* Risk table */}
          <div className="rounded-[10px] border p-5" style={{ borderColor: tokens.border, background: tokens.surface }}>
            <h2 className="text-[14px] font-semibold mb-4" style={{ fontFamily: fonts.heading, color: tokens.text }}>
              Top {riskMembers.length} Members by 30-Day Hospitalization Risk
            </h2>
            <RiskTable members={riskMembers} />
          </div>
        </div>
      )}

      {/* =================== COST PROJECTIONS =================== */}
      {!loading && tab === "costs" && costProjection && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Current Quarterly</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {formatDollars(costProjection.total_current_quarterly)}
              </div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.accent + "30", background: tokens.accentSoft }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.accentText }}>
                Projected ({costProjection.projection_period})
              </div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                {formatDollars(costProjection.total_projected_quarterly)}
              </div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Projected Change</div>
              <div
                className="text-2xl font-semibold"
                style={{
                  fontFamily: fonts.code,
                  color: costProjection.total_change_pct > 0 ? tokens.red : tokens.accentText,
                }}
              >
                {costProjection.total_change_pct > 0 ? "+" : ""}{costProjection.total_change_pct}%
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="rounded-[10px] border p-5 mb-6" style={{ borderColor: tokens.border, background: tokens.surface }}>
            <h2 className="text-[14px] font-semibold mb-4" style={{ fontFamily: fonts.heading, color: tokens.text }}>
              Current vs Projected Quarterly Spend by Category
            </h2>
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSoft} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.textMuted }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: tokens.textMuted }}
                    tickFormatter={(v: number) => `$${v}K`}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [`$${value}K`, String(name) === "current" ? "Current" : "Projected"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: tokens.border }}
                  />
                  <Legend
                    formatter={(value: string) => (value === "current" ? "Current Quarter" : "Projected Quarter")}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="current" fill={tokens.textMuted} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projected" radius={[4, 4, 0, 0]}>
                    {costChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.change_pct > 0 ? tokens.amber : tokens.accent} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category detail table */}
          <div className="rounded-[10px] border p-5" style={{ borderColor: tokens.border, background: tokens.surface }}>
            <h2 className="text-[14px] font-semibold mb-4" style={{ fontFamily: fonts.heading, color: tokens.text }}>
              Category Detail
            </h2>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider" style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium text-right">Current</th>
                  <th className="py-2 pr-3 font-medium text-right">Projected</th>
                  <th className="py-2 pr-3 font-medium text-right">Change</th>
                  <th className="py-2 pr-3 font-medium text-right">Confidence Range</th>
                  <th className="py-2 font-medium text-center">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {costProjection.categories.map((c) => (
                  <tr key={c.category} className="text-[13px]" style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td className="py-3 pr-3 font-medium" style={{ color: tokens.text }}>
                      {CATEGORY_LABELS[c.category] || c.category}
                    </td>
                    <td className="py-3 pr-3 text-right" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                      {formatDollars(c.current_quarterly_spend)}
                    </td>
                    <td className="py-3 pr-3 text-right font-medium" style={{ fontFamily: fonts.code, color: tokens.text }}>
                      {formatDollars(c.projected_quarterly_spend)}
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-medium"
                      style={{
                        fontFamily: fonts.code,
                        color: c.change_pct > 0 ? tokens.red : tokens.accentText,
                      }}
                    >
                      {c.change_pct > 0 ? "+" : ""}{c.change_pct}%
                    </td>
                    <td className="py-3 pr-3 text-right text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textMuted }}>
                      {formatDollars(c.confidence_low)} - {formatDollars(c.confidence_high)}
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded"
                        style={{
                          background: c.confidence_level >= 80 ? tokens.accentSoft : tokens.amberSoft,
                          color: c.confidence_level >= 80 ? tokens.accentText : tokens.amber,
                        }}
                      >
                        {c.confidence_level}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================== RAF PROJECTIONS =================== */}
      {!loading && tab === "raf" && rafProjection && (
        <div>
          {/* Current state summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Population Avg RAF</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {rafProjection.current_state.avg_raf}
              </div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Current Revenue</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {formatDollars(rafProjection.current_state.annual_revenue)}
              </div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Capture Rate</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {rafProjection.current_state.capture_rate}%
              </div>
            </div>
            <div className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Open Suspects</div>
              <div className="text-2xl font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {rafProjection.current_state.open_suspects.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            {/* Scenario: All Captured */}
            <div className="rounded-[10px] border p-5" style={{ borderColor: tokens.accent + "30", background: tokens.surface }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-semibold" style={{ fontFamily: fonts.heading, color: tokens.text }}>
                  {rafProjection.scenario_all_captured.label}
                </h3>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ background: tokens.amberSoft, color: tokens.amber }}
                >
                  {rafProjection.scenario_all_captured.confidence}% confidence
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[12px]" style={{ color: tokens.textSecondary }}>Avg RAF</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textMuted }}>
                      {rafProjection.current_state.avg_raf}
                    </span>
                    <span style={{ color: tokens.textMuted }}>{"-->"}</span>
                    <span className="text-[13px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                      {rafProjection.scenario_all_captured.avg_raf}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: tokens.accentText }}>
                      (+{rafProjection.scenario_all_captured.raf_change})
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px]" style={{ color: tokens.textSecondary }}>Annual Revenue</span>
                  <span className="text-[13px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    {formatDollars(rafProjection.scenario_all_captured.annual_revenue)}
                  </span>
                </div>
                <div
                  className="rounded-lg p-3 text-center mt-3"
                  style={{ background: tokens.accentSoft }}
                >
                  <div className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: tokens.accentText }}>Revenue Uplift</div>
                  <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    +{formatDollars(rafProjection.scenario_all_captured.revenue_uplift)}
                  </div>
                </div>
              </div>
            </div>

            {/* Scenario: 80% Recapture */}
            <div className="rounded-[10px] border p-5" style={{ borderColor: tokens.accent + "30", background: tokens.surface }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-semibold" style={{ fontFamily: fonts.heading, color: tokens.text }}>
                  {rafProjection.scenario_80_recapture.label}
                </h3>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ background: tokens.accentSoft, color: tokens.accentText }}
                >
                  {rafProjection.scenario_80_recapture.confidence}% confidence
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[12px]" style={{ color: tokens.textSecondary }}>Avg RAF</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textMuted }}>
                      {rafProjection.current_state.avg_raf}
                    </span>
                    <span style={{ color: tokens.textMuted }}>{"-->"}</span>
                    <span className="text-[13px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                      {rafProjection.scenario_80_recapture.avg_raf}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: tokens.accentText }}>
                      (+{rafProjection.scenario_80_recapture.raf_change})
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px]" style={{ color: tokens.textSecondary }}>Annual Revenue</span>
                  <span className="text-[13px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    {formatDollars(rafProjection.scenario_80_recapture.annual_revenue)}
                  </span>
                </div>
                <div
                  className="rounded-lg p-3 text-center mt-3"
                  style={{ background: tokens.accentSoft }}
                >
                  <div className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: tokens.accentText }}>Revenue Uplift</div>
                  <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    +{formatDollars(rafProjection.scenario_80_recapture.revenue_uplift)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Suspect summary */}
          <div className="rounded-[10px] border p-5" style={{ borderColor: tokens.border, background: tokens.surface }}>
            <h2 className="text-[14px] font-semibold mb-3" style={{ fontFamily: fonts.heading, color: tokens.text }}>
              Suspect Inventory Summary
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Open Suspects</div>
                <div className="text-lg font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {rafProjection.suspect_summary.open_count.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Captured</div>
                <div className="text-lg font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                  {rafProjection.suspect_summary.captured_count.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Total Suspect RAF</div>
                <div className="text-lg font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                  {rafProjection.suspect_summary.total_suspect_raf_value.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Total Annual Value</div>
                <div className="text-lg font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                  {formatDollars(rafProjection.suspect_summary.total_suspect_annual_value)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
