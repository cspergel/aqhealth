import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttributionDashboard {
  total_attributed: number;
  new_this_month: number;
  lost_this_month: number;
  churn_rate: number;
  by_plan: { plan: string; members: number; pct: number }[];
}

interface AttributionChange {
  member_id: string;
  member_name: string;
  change_type: string;
  previous_plan: string | null;
  new_plan: string | null;
  effective_date: string;
  reason: string | null;
  raf_score: number | null;
}

interface ChurnRiskMember {
  member_id: string;
  member_name: string;
  days_since_last_visit: number;
  engagement_score: number;
  raf_score: number;
  annual_value: number;
  risk_level: string;
}

type Tab = "overview" | "changes" | "churn";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttributionPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<AttributionDashboard | null>(null);
  const [changes, setChanges] = useState<AttributionChange[]>([]);
  const [churnRisk, setChurnRisk] = useState<ChurnRiskMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/attribution/dashboard"),
      api.get("/api/attribution/changes"),
      api.get("/api/attribution/churn-risk"),
    ])
      .then(([dashRes, changesRes, churnRes]) => {
        setDashboard(dashRes.data);
        setChanges(Array.isArray(changesRes.data) ? changesRes.data : []);
        setChurnRisk(Array.isArray(churnRes.data) ? churnRes.data : []);
      })
      .catch((err) => console.error("Failed to load attribution data:", err))
      .finally(() => setLoading(false));
  }, []);

  const metricCard = (label: string, value: string | number, sub?: string, color?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13, padding: "6px 14px", borderRadius: 8,
    fontWeight: active ? 600 : 400, color: active ? tokens.text : tokens.textMuted,
    background: active ? tokens.surface : "transparent",
    border: active ? `1px solid ${tokens.border}` : "1px solid transparent",
    cursor: "pointer", transition: "all 0.15s", fontFamily: fonts.body,
  });

  const changeTypeStyle = (type: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      new: { bg: tokens.accentSoft, color: tokens.accentText },
      lost: { bg: tokens.redSoft, color: tokens.red },
      transferred: { bg: tokens.blueSoft, color: tokens.blue },
    };
    const s = map[type] || { bg: tokens.surfaceAlt, color: tokens.textMuted };
    return { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, background: s.bg, color: s.color };
  };

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading attribution data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        Attribution Management
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 20 }}>
        Track member attribution, monitor churn risk, and quantify revenue impact.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
        <button style={tabStyle(tab === "changes")} onClick={() => setTab("changes")}>Changes</button>
        <button style={tabStyle(tab === "churn")} onClick={() => setTab("churn")}>Churn Risk</button>
      </div>

      {tab === "overview" && dashboard && (
        <>
          {/* Metric cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            {metricCard("Total Attributed", dashboard.total_attributed.toLocaleString())}
            {metricCard("New This Month", `+${dashboard.new_this_month}`, undefined, tokens.accent)}
            {metricCard("Lost This Month", `-${dashboard.lost_this_month}`, undefined, tokens.red)}
            {metricCard("Churn Rate", `${dashboard.churn_rate}%`, "annualized", dashboard.churn_rate > 5 ? tokens.red : tokens.amber)}
          </div>

          {/* By-plan pie chart (table representation) */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>By Plan</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {dashboard.by_plan.map((p) => (
                <div key={p.plan} style={{ flex: "1 1 180px", background: tokens.surfaceAlt, borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 4 }}>{p.plan}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.heading }}>{p.members.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: tokens.textMuted }}>{p.pct}% of total</div>
                  <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: tokens.borderSoft }}>
                    <div style={{ height: "100%", borderRadius: 2, background: tokens.accent, width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue impact callout */}
          <div style={{ background: tokens.amberSoft, border: `1px solid ${tokens.amber}`, borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tokens.amber, marginBottom: 4 }}>Revenue Impact</div>
            <div style={{ fontSize: 13, color: tokens.text }}>
              Losing {churnRisk.length} members this quarter reduces projected RAF revenue by <strong>${(198000).toLocaleString()}</strong>.
              New attributions partially offset with $156K, leaving a net gap of $42K/month.
            </div>
          </div>
        </>
      )}

      {tab === "changes" && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>Attribution Changes</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                {["Member", "Type", "From", "To", "Effective", "Reason", "RAF"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.member_id} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{c.member_name}</td>
                  <td style={{ padding: "8px 12px" }}><span style={changeTypeStyle(c.change_type)}>{c.change_type}</span></td>
                  <td style={{ padding: "8px 12px", fontSize: 12 }}>{c.previous_plan || "-"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12 }}>{c.new_plan || "-"}</td>
                  <td style={{ padding: "8px 12px" }}>{c.effective_date}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: tokens.textSecondary }}>{c.reason}</td>
                  <td style={{ padding: "8px 12px", fontFamily: fonts.code }}>{c.raf_score?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "churn" && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 4, color: tokens.text }}>Churn Risk</h2>
          <p style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 12 }}>
            Members at risk of disenrollment -- no visit in 8+ months or low engagement.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                {["Member", "Days Since Visit", "Engagement", "RAF", "Annual Value", "Risk"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {churnRisk.map((m) => (
                <tr key={m.member_id} style={{ borderBottom: `1px solid ${tokens.borderSoft}`, background: m.risk_level === "high" ? tokens.redSoft : undefined }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{m.member_name}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: m.days_since_last_visit >= 240 ? tokens.red : tokens.amber }}>{m.days_since_last_visit}d</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 4, borderRadius: 2, background: tokens.borderSoft }}>
                        <div style={{ height: "100%", borderRadius: 2, background: m.engagement_score < 35 ? tokens.red : tokens.amber, width: `${m.engagement_score}%` }} />
                      </div>
                      <span style={{ fontSize: 11 }}>{m.engagement_score}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: fonts.code }}>{m.raf_score.toFixed(2)}</td>
                  <td style={{ padding: "8px 12px" }}>${m.annual_value.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                      background: m.risk_level === "high" ? tokens.redSoft : m.risk_level === "medium" ? tokens.amberSoft : tokens.accentSoft,
                      color: m.risk_level === "high" ? tokens.red : m.risk_level === "medium" ? tokens.amber : tokens.accentText,
                    }}>
                      {m.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
