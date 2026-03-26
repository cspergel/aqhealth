import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderAWV {
  provider_id: number;
  provider_name: string;
  panel_size: number;
  awv_completed: number;
  completion_rate: number;
  remaining_value: number;
}

interface AWVDashboard {
  total_members: number;
  awv_completed: number;
  awv_overdue: number;
  completion_rate: number;
  revenue_opportunity: number;
  current_month: string;
  by_provider: ProviderAWV[];
  by_group: { group_name: string; members: number; completed: number; rate: number }[];
}

interface MemberDue {
  member_id: number;
  member_name: string;
  date_of_birth: string | null;
  current_raf: number;
  risk_tier: string;
  pcp_provider_id: number;
  pcp_name: string;
  estimated_value: number;
  last_awv_date: string | null;
}

interface AWVOpportunities {
  total_overdue: number;
  total_opportunity: number;
  avg_value_per_awv: number;
  hcc_breakdown: { hcc_category: string; pct_of_recapture: number; estimated_value: number }[];
  insight: string;
}

type Tab = "overview" | "members" | "opportunities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function tierBadge(tier: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    very_high: { bg: "#fee2e2", text: "#dc2626" },
    high: { bg: "#fef3c7", text: "#d97706" },
    moderate: { bg: "#dbeafe", text: "#2563eb" },
    low: { bg: "#dcfce7", text: "#16a34a" },
  };
  const c = colors[tier] || colors.moderate;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 9999,
        background: c.bg,
        color: c.text,
        textTransform: "capitalize",
      }}
    >
      {tier.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gauge Component
// ---------------------------------------------------------------------------

function CompletionGauge({ rate }: { rate: number }) {
  const radius = 56;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 70 ? tokens.accent : rate >= 50 ? tokens.amber : tokens.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke={tokens.border} strokeWidth={stroke}
        />
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="70" y="65" textAnchor="middle" fontSize="28" fontWeight="700" fill={tokens.text} fontFamily={fonts.heading}>
          {rate}%
        </text>
        <text x="70" y="85" textAnchor="middle" fontSize="11" fill={tokens.textMuted}>
          Completion
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AWVPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<AWVDashboard | null>(null);
  const [membersDue, setMembersDue] = useState<MemberDue[]>([]);
  const [opportunities, setOpportunities] = useState<AWVOpportunities | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterProvider, setFilterProvider] = useState<string>("");
  const [filterTier, setFilterTier] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/awv/dashboard"),
      api.get("/api/awv/due"),
      api.get("/api/awv/opportunities"),
    ])
      .then(([dashRes, dueRes, oppRes]) => {
        setDashboard(dashRes.data);
        setMembersDue(dueRes.data);
        setOpportunities(oppRes.data);
      })
      .catch((err) => console.error("AWV load error:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredMembers = membersDue
    .filter((m) => {
      if (filterProvider && !m.pcp_name.toLowerCase().includes(filterProvider.toLowerCase())) return false;
      if (filterTier && m.risk_tier !== filterTier) return false;
      return true;
    })
    .sort((a, b) => b.current_raf - a.current_raf);

  const handleExport = () => {
    // Build CSV in browser from filtered members
    const headers = ["Member ID", "Name", "DOB", "RAF Score", "Risk Tier", "PCP", "Est. Value", "Last AWV"];
    const rows = filteredMembers.map((m) => [
      m.member_id, m.member_name, m.date_of_birth || "", m.current_raf, m.risk_tier,
      m.pcp_name, `$${m.estimated_value}`, m.last_awv_date || "Never",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "awv_due_list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="px-7 py-6">
        <p style={{ color: tokens.textMuted, fontSize: 13 }}>Loading AWV data...</p>
      </div>
    );
  }

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold tracking-tight mb-1"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Annual Wellness Visit Tracking
        </h1>
        <p className="text-[13px]" style={{ color: tokens.textMuted }}>
          The #1 RAF capture opportunity. Every Medicare Advantage member should get one annually.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: tokens.border }}>
        {(["overview", "members", "opportunities"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px"
            style={{
              color: tab === t ? tokens.text : tokens.textMuted,
              borderBottomColor: tab === t ? tokens.accent : "transparent",
              textTransform: "capitalize",
            }}
          >
            {t === "members" ? "Members Due" : t}
          </button>
        ))}
      </div>

      {/* ---- OVERVIEW TAB ---- */}
      {tab === "overview" && dashboard && (
        <>
          {/* Top Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div
              className="rounded-lg p-5 flex flex-col items-center"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <CompletionGauge rate={dashboard.completion_rate} />
            </div>
            {[
              { label: "Total Members", value: dashboard.total_members.toLocaleString(), sub: dashboard.current_month },
              { label: "AWVs Completed", value: dashboard.awv_completed.toLocaleString(), sub: `${dashboard.awv_overdue.toLocaleString()} overdue` },
              { label: "Revenue Opportunity", value: fmtDollar(dashboard.revenue_opportunity), sub: "From overdue AWVs" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-lg p-5"
                style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: tokens.textMuted }}>
                  {m.label}
                </div>
                <div className="text-2xl font-bold" style={{ fontFamily: fonts.heading, color: tokens.text }}>
                  {m.value}
                </div>
                <div className="text-[12px] mt-1" style={{ color: tokens.textSecondary }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* AI Insight banner */}
          {opportunities && (
            <div
              className="rounded-lg p-4 mb-6"
              style={{ background: tokens.amberSoft, border: `1px solid ${tokens.amber}33` }}
            >
              <div className="text-[12px] font-semibold mb-1" style={{ color: tokens.amber }}>
                AI INSIGHT
              </div>
              <div className="text-[13px]" style={{ color: tokens.text }}>
                {opportunities.insight}
              </div>
            </div>
          )}

          {/* By-Provider Table */}
          <div
            className="rounded-lg overflow-hidden mb-6"
            style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
          >
            <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
              <h2 className="text-[14px] font-semibold" style={{ color: tokens.text }}>By Provider</h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Provider", "Panel Size", "AWVs Completed", "Completion %", "Remaining Value"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: h === "Provider" ? "left" : "right",
                        fontSize: 11,
                        fontWeight: 600,
                        color: tokens.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.by_provider.map((p) => {
                  const rateColor = p.completion_rate >= 70 ? tokens.accent : p.completion_rate >= 50 ? tokens.amber : tokens.red;
                  return (
                    <tr key={p.provider_id} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                      <td style={{ padding: "10px 16px", fontWeight: 500 }}>{p.provider_name}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>{p.panel_size}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>{p.awv_completed}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: tokens.surfaceAlt, overflow: "hidden" }}>
                            <div style={{ width: `${p.completion_rate}%`, height: "100%", borderRadius: 3, background: rateColor, transition: "width 0.4s ease" }} />
                          </div>
                          <span style={{ fontWeight: 600, color: rateColor }}>{p.completion_rate}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: tokens.red }}>
                        {fmtDollar(p.remaining_value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* By-Group Table */}
          {dashboard.by_group.length > 0 && (
            <div
              className="rounded-lg overflow-hidden"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
                <h2 className="text-[14px] font-semibold" style={{ color: tokens.text }}>By Group</h2>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: tokens.surfaceAlt }}>
                    {["Group", "Members", "Completed", "Rate"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: h === "Group" ? "left" : "right",
                          fontSize: 11,
                          fontWeight: 600,
                          color: tokens.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.by_group.map((g) => (
                    <tr key={g.group_name} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                      <td style={{ padding: "10px 16px", fontWeight: 500 }}>{g.group_name}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>{g.members}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>{g.completed}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>
                        {g.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ---- MEMBERS DUE TAB ---- */}
      {tab === "members" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Filter by provider..."
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={{ border: `1px solid ${tokens.border}`, background: tokens.surface, color: tokens.text, width: 220 }}
            />
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={{ border: `1px solid ${tokens.border}`, background: tokens.surface, color: tokens.text }}
            >
              <option value="">All Risk Tiers</option>
              <option value="very_high">Very High</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
            <div style={{ flex: 1 }} />
            <span className="text-[12px]" style={{ color: tokens.textMuted }}>
              {filteredMembers.length} members
            </span>
            <button
              onClick={handleExport}
              className="rounded-md px-4 py-2 text-[13px] font-medium"
              style={{ background: tokens.accent, color: "#fff", border: "none", cursor: "pointer" }}
            >
              Export CSV
            </button>
          </div>

          {/* Members Table */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Member", "DOB", "RAF Score", "Risk Tier", "PCP", "Est. Value", "Last AWV"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: h === "Member" || h === "PCP" ? "left" : "right",
                        fontSize: 11,
                        fontWeight: 600,
                        color: tokens.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => (
                  <tr
                    key={m.member_id}
                    style={{ borderBottom: `1px solid ${tokens.borderSoft}`, cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surfaceAlt; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "10px 16px", fontWeight: 500 }}>{m.member_name}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: tokens.textSecondary }}>{m.date_of_birth || "--"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>{m.current_raf.toFixed(3)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>{tierBadge(m.risk_tier)}</td>
                    <td style={{ padding: "10px 16px", color: tokens.textSecondary }}>{m.pcp_name}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: tokens.accent }}>
                      ${m.estimated_value.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: m.last_awv_date ? tokens.textSecondary : tokens.red }}>
                      {m.last_awv_date || "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- OPPORTUNITIES TAB ---- */}
      {tab === "opportunities" && opportunities && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Overdue", value: opportunities.total_overdue.toLocaleString(), color: tokens.red },
              { label: "Total Opportunity", value: fmtDollar(opportunities.total_opportunity), color: tokens.accent },
              { label: "Avg Value per AWV", value: fmtDollar(opportunities.avg_value_per_awv), color: tokens.blue },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-lg p-5"
                style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: tokens.textMuted }}>
                  {c.label}
                </div>
                <div className="text-2xl font-bold" style={{ fontFamily: fonts.heading, color: c.color }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div
            className="rounded-lg p-4 mb-6"
            style={{ background: tokens.amberSoft, border: `1px solid ${tokens.amber}33` }}
          >
            <div className="text-[12px] font-semibold mb-1" style={{ color: tokens.amber }}>
              REVENUE IMPACT ANALYSIS
            </div>
            <div className="text-[13px]" style={{ color: tokens.text }}>
              {opportunities.insight}
            </div>
          </div>

          {/* HCC Breakdown */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
          >
            <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
              <h2 className="text-[14px] font-semibold" style={{ color: tokens.text }}>
                Estimated Recapture by HCC Category
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["HCC Category", "% of Recapture", "Estimated Value"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: h === "HCC Category" ? "left" : "right",
                        fontSize: 11,
                        fontWeight: 600,
                        color: tokens.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opportunities.hcc_breakdown.map((h) => (
                  <tr key={h.hcc_category} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td style={{ padding: "10px 16px", fontWeight: 500 }}>{h.hcc_category}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        <div style={{ width: 80, height: 6, borderRadius: 3, background: tokens.surfaceAlt, overflow: "hidden" }}>
                          <div style={{ width: `${h.pct_of_recapture}%`, height: "100%", borderRadius: 3, background: tokens.accent }} />
                        </div>
                        <span>{h.pct_of_recapture}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: tokens.accent }}>
                      {fmtDollar(h.estimated_value)}
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
