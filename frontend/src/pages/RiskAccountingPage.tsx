import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskDashboard {
  total_cap_revenue: number;
  total_medical_spend: number;
  total_admin_costs: number;
  surplus_deficit: number;
  mlr: number;
  ibnr_estimate: number;
  member_months: number;
  pmpm_revenue: number;
  pmpm_spend: number;
  by_plan: { plan_name: string; product_type: string; cap_revenue: number; medical_spend: number; mlr: number; member_count: number }[];
}

interface PlanPL {
  plan_name: string;
  cap_revenue: number;
  medical_spend: number;
  admin_costs: number;
  surplus_deficit: number;
  mlr: number;
}

interface GroupPL {
  group_name: string;
  members: number;
  cap_allocated: number;
  medical_spend: number;
  admin_costs: number;
  surplus_deficit: number;
  mlr: number;
}

interface RiskPoolItem {
  id: number;
  plan_name: string;
  pool_year: number;
  withhold_percentage: number;
  total_withheld: number;
  quality_bonus_earned: number | null;
  surplus_share: number | null;
  deficit_share: number | null;
  settlement_date: string | null;
  status: string;
}

interface IBNRData {
  total_estimate: number;
  confidence: number;
  completion_factor: number;
  as_of_date: string;
  by_category: { category: string; estimate: number; confidence: number; avg_lag_days: number }[];
}

interface CorridorData {
  target_mlr: number;
  actual_mlr: number;
  corridor_position: string;
  shared_risk_exposure: number;
  stop_loss_threshold: number;
  bands: { band: string; range: string; description: string; status: string; mlr_range: number[] }[];
}

interface CapPayment {
  id: number;
  plan_name: string;
  product_type: string;
  payment_month: string;
  member_count: number;
  pmpm_rate: number;
  total_payment: number;
  adjustment_amount: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtDollar = (n: number) => "$" + fmt(n);
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiskAccountingPage() {
  const [dashboard, setDashboard] = useState<RiskDashboard | null>(null);
  const [byPlan, setByPlan] = useState<PlanPL[]>([]);
  const [byGroup, setByGroup] = useState<GroupPL[]>([]);
  const [pools, setPools] = useState<RiskPoolItem[]>([]);
  const [ibnr, setIbnr] = useState<IBNRData | null>(null);
  const [corridor, setCorridor] = useState<CorridorData | null>(null);
  const [capPayments, setCapPayments] = useState<CapPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "plans" | "groups" | "capitation">("overview");

  // Capitation entry form
  const [showCapForm, setShowCapForm] = useState(false);
  const [capForm, setCapForm] = useState({ plan_name: "", product_type: "MA", payment_month: "", member_count: "", pmpm_rate: "", total_payment: "" });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/risk/dashboard"),
      api.get("/api/risk/surplus-deficit"),
      api.get("/api/risk/pools"),
      api.get("/api/risk/ibnr"),
      api.get("/api/risk/risk-corridor"),
      api.get("/api/risk/capitation"),
    ])
      .then(([dashRes, sdRes, poolRes, ibnrRes, corrRes, capRes]) => {
        setDashboard(dashRes.data);
        setByPlan(Array.isArray(sdRes.data?.by_plan) ? sdRes.data.by_plan : []);
        setByGroup(Array.isArray(sdRes.data?.by_group) ? sdRes.data.by_group : []);
        setPools(Array.isArray(poolRes.data) ? poolRes.data : []);
        setIbnr(ibnrRes.data);
        setCorridor(corrRes.data);
        setCapPayments(Array.isArray(capRes.data?.payments) ? capRes.data.payments : []);
      })
      .catch((err) => console.error("Failed to load risk data:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleCapSubmit = () => {
    const body = {
      plan_name: capForm.plan_name,
      product_type: capForm.product_type,
      payment_month: capForm.payment_month + "-01",
      member_count: parseInt(capForm.member_count),
      pmpm_rate: parseFloat(capForm.pmpm_rate),
      total_payment: parseFloat(capForm.total_payment),
    };
    api.post("/api/risk/capitation", body)
      .then(() => {
        setShowCapForm(false);
        setCapForm({ plan_name: "", product_type: "MA", payment_month: "", member_count: "", pmpm_rate: "", total_payment: "" });
      })
      .catch((err) => console.error("Failed to add capitation:", err));
  };

  const metricCard = (label: string, value: string, color?: string, sub?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading risk accounting data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: 0 }}>
          Risk / Capitation Accounting
        </h1>
        <p style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
          Full financial management for risk-bearing operations
        </p>
      </div>

      {/* Top Metrics */}
      {dashboard && (
        <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          {metricCard("Total Cap Revenue", fmtDollar(dashboard.total_cap_revenue), tokens.accent)}
          {metricCard("Total Medical Spend", fmtDollar(dashboard.total_medical_spend), tokens.red)}
          {metricCard("Surplus / Deficit", fmtDollar(dashboard.surplus_deficit), dashboard.surplus_deficit >= 0 ? tokens.accent : tokens.red)}
          {metricCard("MLR", fmtPct(dashboard.mlr), dashboard.mlr <= 0.85 ? tokens.accent : dashboard.mlr <= 0.90 ? tokens.amber : tokens.red)}
          {metricCard("IBNR Estimate", fmtDollar(dashboard.ibnr_estimate), tokens.amber)}
        </div>
      )}

      {/* PMPM Cards */}
      {dashboard && (
        <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          {metricCard("PMPM Revenue", fmtDollar(dashboard.pmpm_revenue), undefined, `${fmt(dashboard.member_months)} member-months`)}
          {metricCard("PMPM Spend", fmtDollar(dashboard.pmpm_spend))}
          {metricCard("PMPM Margin", fmtDollar(dashboard.pmpm_revenue - dashboard.pmpm_spend), dashboard.pmpm_revenue - dashboard.pmpm_spend > 0 ? tokens.accent : tokens.red)}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${tokens.border}` }}>
        {(["overview", "plans", "groups", "capitation"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? tokens.accent : tokens.textMuted, background: "transparent",
              border: "none", borderBottom: activeTab === tab ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer", textTransform: "capitalize",
            }}
          >
            {tab === "plans" ? "By Plan" : tab === "groups" ? "By Group" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Risk Pool Cards */}
          <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 14 }}>Risk Pools</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginBottom: 28 }}>
            {pools.map((pool) => (
              <div key={pool.id} style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text }}>{pool.plan_name}</div>
                  <span style={{
                    padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600,
                    background: pool.status === "settled" ? "#D1FAE5" : pool.status === "disputed" ? "#FEE2E2" : "#DBEAFE",
                    color: pool.status === "settled" ? "#065F46" : pool.status === "disputed" ? "#991B1B" : "#1E40AF",
                  }}>
                    {pool.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 8 }}>Pool Year: {pool.pool_year}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>Withhold %</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{pool.withhold_percentage}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>Total Withheld</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtDollar(pool.total_withheld)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>Quality Bonus</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: pool.quality_bonus_earned ? tokens.accent : tokens.textMuted }}>
                      {pool.quality_bonus_earned ? fmtDollar(pool.quality_bonus_earned) : "--"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>Surplus / Deficit</div>
                    <div style={{
                      fontSize: 15, fontWeight: 600,
                      color: pool.surplus_share ? tokens.accent : pool.deficit_share ? tokens.red : tokens.textMuted,
                    }}>
                      {pool.surplus_share ? `+${fmtDollar(pool.surplus_share)}` : pool.deficit_share ? `-${fmtDollar(pool.deficit_share)}` : "--"}
                    </div>
                  </div>
                </div>
                {pool.settlement_date && (
                  <div style={{ marginTop: 8, fontSize: 11, color: tokens.textMuted }}>Settled: {pool.settlement_date}</div>
                )}
              </div>
            ))}
          </div>

          {/* IBNR Card */}
          {ibnr && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 14 }}>IBNR Estimate</h2>
              <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Total IBNR Estimate</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: tokens.amber }}>{fmtDollar(ibnr.total_estimate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Confidence</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: ibnr.confidence >= 90 ? tokens.accent : tokens.amber }}>
                      {ibnr.confidence}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Completion Factor</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading }}>{(ibnr.completion_factor * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>As Of</div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{ibnr.as_of_date}</div>
                  </div>
                </div>

                {/* Confidence bar */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tokens.textMuted, marginBottom: 4 }}>
                    <span>Confidence Level</span>
                    <span>{ibnr.confidence}%</span>
                  </div>
                  <div style={{ height: 8, background: tokens.border, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${ibnr.confidence}%`, background: ibnr.confidence >= 90 ? tokens.accent : tokens.amber, borderRadius: 4 }} />
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: tokens.surfaceAlt }}>
                      {["Category", "Estimate", "Confidence", "Avg Lag (Days)"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, borderBottom: `1px solid ${tokens.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ibnr.by_category.map((c, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>{c.category}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{fmtDollar(c.estimate)}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: c.confidence >= 90 ? tokens.accent : c.confidence >= 85 ? tokens.amber : tokens.red }}>
                            {c.confidence}%
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>{c.avg_lag_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Risk Corridor Gauge */}
          {corridor && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 14 }}>Risk Corridor Position</h2>
              <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Target MLR</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(corridor.target_mlr)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Actual MLR</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: corridor.actual_mlr <= corridor.target_mlr ? tokens.accent : tokens.amber }}>
                      {fmtPct(corridor.actual_mlr)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Position</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: tokens.accent, textTransform: "capitalize" }}>{corridor.corridor_position}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>Shared Risk Exposure</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtDollar(corridor.shared_risk_exposure)}</div>
                  </div>
                </div>

                {/* Corridor gauge visualization */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", height: 40, borderRadius: 8, overflow: "hidden", border: `1px solid ${tokens.border}` }}>
                    {corridor.bands.map((band, i) => {
                      const widths = [20, 12.5, 7.5, 17.5, 12.5];
                      const colors = ["#D1FAE5", "#BBF7D0", "#DBEAFE", "#FEF3C7", "#FEE2E2"];
                      return (
                        <div
                          key={i}
                          style={{
                            width: `${widths[i]}%`, background: colors[i],
                            display: "flex", alignItems: "center", justifyContent: "center",
                            position: "relative",
                            borderRight: i < corridor.bands.length - 1 ? `1px solid ${tokens.border}` : "none",
                          }}
                        >
                          {band.status === "active" && (
                            <div style={{
                              position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)",
                              width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                              borderTop: `8px solid ${tokens.accent}`,
                            }} />
                          )}
                          <span style={{ fontSize: 9, fontWeight: 600, color: "#374151", textAlign: "center", lineHeight: 1.2 }}>
                            {band.band}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: tokens.textMuted, marginTop: 4 }}>
                    <span>0%</span>
                    <span>80%</span>
                    <span>85%</span>
                    <span>88%</span>
                    <span>95%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Band descriptions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  {corridor.bands.map((band, i) => (
                    <div key={i} style={{
                      padding: "8px 12px", borderRadius: 6, fontSize: 12,
                      background: band.status === "active" ? tokens.accentSoft : tokens.bg,
                      border: band.status === "active" ? `1px solid ${tokens.accent}` : `1px solid ${tokens.border}`,
                    }}>
                      <span style={{ fontWeight: 600 }}>{band.band}</span>
                      <span style={{ color: tokens.textMuted, marginLeft: 8 }}>{band.range}</span>
                      <div style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 2 }}>{band.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* By Plan Tab */}
      {activeTab === "plans" && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Plan", "Cap Revenue", "Medical Spend", "Admin Costs", "Surplus/Deficit", "MLR"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${tokens.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byPlan.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.plan_name}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(p.cap_revenue)}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(p.medical_spend)}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(p.admin_costs)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: p.surplus_deficit >= 0 ? tokens.accent : tokens.red }}>
                    {p.surplus_deficit >= 0 ? "+" : ""}{fmtDollar(p.surplus_deficit)}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontWeight: 600, color: p.mlr <= 0.85 ? tokens.accent : p.mlr <= 0.90 ? tokens.amber : tokens.red }}>
                      {fmtPct(p.mlr)}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background: tokens.surfaceAlt, fontWeight: 700 }}>
                <td style={{ padding: "10px 14px" }}>TOTAL</td>
                <td style={{ padding: "10px 14px" }}>{fmtDollar(byPlan.reduce((s, p) => s + p.cap_revenue, 0))}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDollar(byPlan.reduce((s, p) => s + p.medical_spend, 0))}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDollar(byPlan.reduce((s, p) => s + p.admin_costs, 0))}</td>
                <td style={{ padding: "10px 14px", color: tokens.accent }}>
                  +{fmtDollar(byPlan.reduce((s, p) => s + p.surplus_deficit, 0))}
                </td>
                <td style={{ padding: "10px 14px" }}>{fmtPct(dashboard?.mlr || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* By Group Tab */}
      {activeTab === "groups" && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Group", "Members", "Cap Allocated", "Medical Spend", "Admin", "Surplus/Deficit", "MLR"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${tokens.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byGroup.map((g, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{g.group_name}</td>
                  <td style={{ padding: "10px 14px" }}>{fmt(g.members)}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(g.cap_allocated)}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(g.medical_spend)}</td>
                  <td style={{ padding: "10px 14px" }}>{fmtDollar(g.admin_costs)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: g.surplus_deficit >= 0 ? tokens.accent : tokens.red }}>
                    {g.surplus_deficit >= 0 ? "+" : ""}{fmtDollar(g.surplus_deficit)}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontWeight: 600, color: g.mlr <= 0.85 ? tokens.accent : g.mlr <= 0.90 ? tokens.amber : tokens.red }}>
                      {fmtPct(g.mlr)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Capitation Tab */}
      {activeTab === "capitation" && (
        <>
          {/* Add Capitation Button */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowCapForm(!showCapForm)}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none",
                background: tokens.accent, color: "#fff", cursor: "pointer",
              }}
            >
              {showCapForm ? "Cancel" : "+ Add Capitation Payment"}
            </button>
          </div>

          {/* Capitation Entry Form */}
          {showCapForm && (
            <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: "0 0 16px" }}>
                New Capitation Payment
              </h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Plan Name</label>
                  <input
                    type="text" value={capForm.plan_name} onChange={(e) => setCapForm({ ...capForm, plan_name: e.target.value })}
                    placeholder="e.g. Aetna Medicare Advantage"
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 220 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Product Type</label>
                  <select
                    value={capForm.product_type} onChange={(e) => setCapForm({ ...capForm, product_type: e.target.value })}
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6 }}
                  >
                    <option value="MA">MA</option>
                    <option value="MAPD">MAPD</option>
                    <option value="DSNP">DSNP</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Payment Month</label>
                  <input
                    type="month" value={capForm.payment_month} onChange={(e) => setCapForm({ ...capForm, payment_month: e.target.value })}
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Member Count</label>
                  <input
                    type="number" value={capForm.member_count} onChange={(e) => setCapForm({ ...capForm, member_count: e.target.value })}
                    placeholder="0"
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 100 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>PMPM Rate</label>
                  <input
                    type="number" value={capForm.pmpm_rate} onChange={(e) => setCapForm({ ...capForm, pmpm_rate: e.target.value })}
                    placeholder="0.00"
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 110 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Total Payment</label>
                  <input
                    type="number" value={capForm.total_payment} onChange={(e) => setCapForm({ ...capForm, total_payment: e.target.value })}
                    placeholder="0.00"
                    style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 140 }}
                  />
                </div>
                <button
                  onClick={handleCapSubmit}
                  style={{
                    padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none",
                    background: tokens.accent, color: "#fff", cursor: "pointer",
                  }}
                >
                  Save Payment
                </button>
              </div>
            </div>
          )}

          {/* Recent Capitation Payments Table */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Plan", "Product", "Month", "Members", "PMPM", "Total Payment", "Adjustment", "Notes"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${tokens.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capPayments.slice(-12).reverse().map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{p.plan_name}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: p.product_type === "MA" ? "#DBEAFE" : p.product_type === "MAPD" ? "#D1FAE5" : p.product_type === "DSNP" ? "#FDE8E8" : "#F3F4F6",
                        color: p.product_type === "MA" ? "#1E40AF" : p.product_type === "MAPD" ? "#065F46" : p.product_type === "DSNP" ? "#991B1B" : "#374151",
                      }}>
                        {p.product_type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{p.payment_month}</td>
                    <td style={{ padding: "10px 14px" }}>{fmt(p.member_count)}</td>
                    <td style={{ padding: "10px 14px" }}>{fmtDollar(p.pmpm_rate)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{fmtDollar(p.total_payment)}</td>
                    <td style={{ padding: "10px 14px", color: p.adjustment_amount ? (p.adjustment_amount > 0 ? tokens.accent : tokens.red) : tokens.textMuted }}>
                      {p.adjustment_amount ? `${p.adjustment_amount > 0 ? "+" : ""}${fmtDollar(p.adjustment_amount)}` : "--"}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: tokens.textSecondary, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.notes || "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
