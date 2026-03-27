import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TCMCase {
  member_id: string;
  member_name: string;
  discharge_date: string;
  days_since_discharge: number;
  phone_contact_status: string;
  phone_contact_date: string | null;
  visit_status: string;
  visit_date: string | null;
  cpt_code: string | null;
  billing_status: string;
  provider_name: string;
  facility: string | null;
}

interface TCMDashboard {
  active_cases: number;
  compliance_rate: number;
  revenue_captured: number;
  revenue_potential: number;
  by_provider: { provider_name: string; active: number; completed: number; compliance_rate: number; revenue: number }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TCMPage() {
  const [dashboard, setDashboard] = useState<TCMDashboard | null>(null);
  const [cases, setCases] = useState<TCMCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/tcm/dashboard"),
      api.get("/api/tcm/active"),
    ])
      .then(([dashRes, casesRes]) => {
        setDashboard(dashRes.data);
        setCases(Array.isArray(casesRes.data) ? casesRes.data : casesRes.data?.items || []);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load TCM data:", err);
        setError("Failed to load TCM data.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecordPhone = (memberId: string) => {
    api
      .patch(`/api/tcm/${memberId}`, { phone_contact_date: new Date().toISOString().split("T")[0] })
      .then(() => loadData())
      .catch((err) => console.error("Failed to update:", err));
  };

  const handleRecordVisit = (memberId: string) => {
    api
      .patch(`/api/tcm/${memberId}`, { visit_date: new Date().toISOString().split("T")[0] })
      .then(() => loadData())
      .catch((err) => console.error("Failed to update:", err));
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      done: { bg: tokens.accentSoft, color: tokens.accentText, label: "Done" },
      pending: { bg: tokens.amberSoft, color: tokens.amber, label: "Pending" },
      overdue: { bg: tokens.redSoft, color: tokens.red, label: "Overdue" },
      missed: { bg: tokens.redSoft, color: tokens.red, label: "Missed" },
      billed: { bg: tokens.accentSoft, color: tokens.accentText, label: "Billed" },
      not_eligible: { bg: tokens.surfaceAlt, color: tokens.textMuted, label: "N/A" },
    };
    const s = map[status] || { bg: tokens.surfaceAlt, color: tokens.textMuted, label: status };
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const metricCard = (label: string, value: string | number, sub?: string, color?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading TCM data...</div>;
  }

  if (error && !dashboard) {
    return <div style={{ padding: 32, color: tokens.red }}>{error}</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        Transitional Care Management
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 24 }}>
        Post-discharge tracking: phone contact within 2 business days, face-to-face visit within 7-14 days.
      </p>

      {/* Metric cards */}
      {dashboard && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {metricCard("Active Cases", dashboard.active_cases)}
          {metricCard("Compliance Rate", `${dashboard.compliance_rate}%`, undefined, dashboard.compliance_rate >= 75 ? tokens.accent : tokens.amber)}
          {metricCard("Revenue Captured", `$${dashboard.revenue_captured.toLocaleString()}`, undefined, tokens.accent)}
          {metricCard("Revenue Potential", `$${dashboard.revenue_potential.toLocaleString()}`, "Remaining billable", tokens.blue)}
        </div>
      )}

      {/* Provider performance */}
      {dashboard && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>By Provider</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                {["Provider", "Active", "Completed", "Compliance", "Revenue"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dashboard.by_provider.map((p) => (
                <tr key={p.provider_name} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{p.provider_name}</td>
                  <td style={{ padding: "8px 12px" }}>{p.active}</td>
                  <td style={{ padding: "8px 12px" }}>{p.completed}</td>
                  <td style={{ padding: "8px 12px", color: p.compliance_rate >= 75 ? tokens.accent : tokens.amber }}>{p.compliance_rate}%</td>
                  <td style={{ padding: "8px 12px" }}>${p.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active cases table */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>Active Cases</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                {["Member", "Facility", "Discharge", "Days", "Phone Contact", "Visit", "CPT", "Billing", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const urgent = c.phone_contact_status === "overdue" || (c.days_since_discharge >= 5 && c.visit_status === "pending");
                return (
                  <tr key={c.member_id} style={{ borderBottom: `1px solid ${tokens.borderSoft}`, background: urgent ? tokens.redSoft : undefined }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500 }}>
                      <div>{c.member_name}</div>
                      <div style={{ fontSize: 11, color: tokens.textMuted }}>{c.provider_name}</div>
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: tokens.textSecondary }}>{c.facility}</td>
                    <td style={{ padding: "8px 10px" }}>{c.discharge_date}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: c.days_since_discharge > 7 ? tokens.red : c.days_since_discharge > 2 ? tokens.amber : tokens.accent }}>
                      {c.days_since_discharge}d
                    </td>
                    <td style={{ padding: "8px 10px" }}>{statusBadge(c.phone_contact_status)}</td>
                    <td style={{ padding: "8px 10px" }}>{statusBadge(c.visit_status)}</td>
                    <td style={{ padding: "8px 10px", fontFamily: fonts.code, fontSize: 12 }}>{c.cpt_code || "-"}</td>
                    <td style={{ padding: "8px 10px" }}>{statusBadge(c.billing_status)}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {c.phone_contact_status !== "done" && (
                          <button
                            onClick={() => handleRecordPhone(c.member_id)}
                            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${tokens.border}`, background: tokens.surface, cursor: "pointer", color: tokens.text }}
                          >
                            Log Call
                          </button>
                        )}
                        {c.visit_status !== "done" && c.visit_status !== "missed" && (
                          <button
                            onClick={() => handleRecordVisit(c.member_id)}
                            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${tokens.accent}`, background: tokens.accentSoft, cursor: "pointer", color: tokens.accentText }}
                          >
                            Log Visit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
