import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopLossDashboard {
  members_approaching: number;
  members_exceeding: number;
  total_exposure: number;
  risk_corridor_position: number;
  threshold: number;
  total_high_cost_spend: number;
}

interface HighCostMember {
  member_id: string;
  member_name: string;
  twelve_month_spend: number;
  stoploss_threshold: number;
  pct_of_threshold: number;
  projected_year_end: number;
  primary_conditions: string[];
  exceeds_threshold: boolean;
}

interface RiskCorridor {
  target_spend: number;
  actual_spend: number;
  ratio: number;
  corridor_band: string;
  shared_risk_exposure: number;
  corridor_bands: { band: string; range: string; description: string; status: string }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopLossPage() {
  const [dashboard, setDashboard] = useState<StopLossDashboard | null>(null);
  const [members, setMembers] = useState<HighCostMember[]>([]);
  const [corridor, setCorridor] = useState<RiskCorridor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/stoploss/dashboard"),
      api.get("/api/stoploss/high-cost"),
      api.get("/api/stoploss/risk-corridor"),
    ])
      .then(([dashRes, membersRes, corridorRes]) => {
        setDashboard(dashRes.data);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
        setCorridor(corridorRes.data);
      })
      .catch((err) => console.error("Failed to load stop-loss data:", err))
      .finally(() => setLoading(false));
  }, []);

  const metricCard = (label: string, value: string | number, sub?: string, color?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const fmtDollar = (v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading stop-loss data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        Stop-Loss & Risk Corridor
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 24 }}>
        Monitor high-cost members against stop-loss thresholds and track risk corridor position.
      </p>

      {dashboard && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {metricCard("Members Exceeding", dashboard.members_exceeding, `of ${dashboard.members_approaching + dashboard.members_exceeding} high-cost`, tokens.red)}
          {metricCard("Members Approaching", dashboard.members_approaching, "within 80% of threshold", tokens.amber)}
          {metricCard("Total Exposure", fmtDollar(dashboard.total_exposure), "above threshold", tokens.red)}
          {metricCard("Risk Corridor", `${dashboard.risk_corridor_position}%`, "of target spend", dashboard.risk_corridor_position <= 97 ? tokens.accent : tokens.amber)}
        </div>
      )}

      {/* Risk Corridor Gauge */}
      {corridor && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Risk Corridor Position</h2>
          <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 0, height: 32, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                {corridor.corridor_bands.map((band) => (
                  <div
                    key={band.band}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600, color: band.status === "active" ? "#fff" : tokens.textMuted,
                      background: band.status === "active"
                        ? (band.band.includes("Savings") ? tokens.accent : band.band.includes("Neutral") ? tokens.amber : tokens.red)
                        : tokens.surfaceAlt,
                      border: `1px solid ${band.status === "active" ? "transparent" : tokens.borderSoft}`,
                    }}
                  >
                    {band.range}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 0 }}>
                {corridor.corridor_bands.map((band) => (
                  <div key={band.band} style={{ flex: 1, fontSize: 10, color: tokens.textMuted, textAlign: "center", padding: "0 2px" }}>
                    {band.band}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
            <div><span style={{ color: tokens.textMuted }}>Target Spend:</span> <strong>{fmtDollar(corridor.target_spend)}</strong></div>
            <div><span style={{ color: tokens.textMuted }}>Actual Spend:</span> <strong>{fmtDollar(corridor.actual_spend)}</strong></div>
            <div><span style={{ color: tokens.textMuted }}>Ratio:</span> <strong style={{ color: corridor.ratio <= 97 ? tokens.accent : tokens.amber }}>{corridor.ratio}%</strong></div>
            <div><span style={{ color: tokens.textMuted }}>Shared Risk Exposure:</span> <strong style={{ color: tokens.accent }}>{fmtDollar(corridor.shared_risk_exposure)}</strong></div>
          </div>
        </div>
      )}

      {/* High-cost members table */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>High-Cost Members</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                {["Member", "12-Month Spend", "Threshold", "% of Threshold", "Projected Year-End", "Conditions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.member_id} style={{ borderBottom: `1px solid ${tokens.borderSoft}`, background: m.exceeds_threshold ? tokens.redSoft : undefined }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                    <div>{m.member_name}</div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>{m.member_id}</div>
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, fontFamily: fonts.code }}>
                    ${m.twelve_month_spend.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: fonts.code }}>
                    ${m.stoploss_threshold.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: tokens.borderSoft }}>
                        <div style={{
                          height: "100%", borderRadius: 3, width: `${Math.min(m.pct_of_threshold, 100)}%`,
                          background: m.pct_of_threshold >= 100 ? tokens.red : m.pct_of_threshold >= 80 ? tokens.amber : tokens.accent,
                        }} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: m.pct_of_threshold >= 100 ? tokens.red : m.pct_of_threshold >= 80 ? tokens.amber : tokens.text }}>
                        {m.pct_of_threshold.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: fonts.code, color: m.projected_year_end > m.stoploss_threshold ? tokens.red : tokens.text }}>
                    ${m.projected_year_end.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {m.primary_conditions.map((c) => (
                        <span key={c} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
