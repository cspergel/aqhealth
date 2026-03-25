import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface MetricDetail {
  key: string;
  label: string;
  value: number | null;
  target: number | null;
  tier: string;
}

interface GroupData {
  id: number;
  name: string;
  city: string;
  state: string;
  provider_count: number;
  total_panel_size: number;
  tier: string;
  metrics: MetricDetail[];
}

interface ProviderRow {
  id: number;
  npi: string;
  name: string;
  specialty: string | null;
  panel_size: number;
  capture_rate: number | null;
  recapture_rate: number | null;
  avg_raf: number | null;
  panel_pmpm: number | null;
  gap_closure_rate: number | null;
}

interface TrendData {
  quarters: string[];
  capture_rate: number[];
  group_pmpm: number[];
  gap_closure_rate: number[];
}

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: tokens.accentSoft, border: "#bbf7d0", text: tokens.accentText },
  amber: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
  red: { bg: tokens.redSoft, border: "#fecaca", text: "#991b1b" },
  gray: { bg: tokens.surfaceAlt, border: tokens.border, text: tokens.textMuted },
};

function fmtValue(key: string, val: number | null): string {
  if (val == null) return "--";
  if (key === "provider_count" || key === "total_panel_size") return val.toLocaleString();
  if (key === "group_pmpm") return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (key === "avg_raf") return val.toFixed(3);
  return `${val.toFixed(1)}%`;
}

export function GroupScorecard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [insights, setInsights] = useState<{ id: number; title: string; description: string; recommended_action?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.allSettled([
      api.get(`/api/groups/${id}`),
      api.get(`/api/groups/${id}/providers`),
      api.get(`/api/groups/${id}/trends`),
      api.get("/api/groups/insights"),
    ])
      .then(([g, p, t, i]) => {
        if (g.status === "fulfilled") setGroup(g.value.data);
        if (p.status === "fulfilled") setProviders(Array.isArray(p.value.data) ? p.value.data : []);
        if (t.status === "fulfilled") setTrends(t.value.data);
        if (i.status === "fulfilled") setInsights(Array.isArray(i.value.data) ? i.value.data : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-7" style={{ color: tokens.textMuted }}>Loading group scorecard...</div>;
  }
  if (!group) {
    return <div className="p-7" style={{ color: tokens.textMuted }}>Group not found.</div>;
  }

  const tc = tierColors[group.tier] || tierColors.gray;

  return (
    <div className="p-7 space-y-6">
      {/* Back + header */}
      <div>
        <button onClick={() => navigate("/groups")} className="text-[13px] mb-3 inline-block" style={{ color: tokens.textMuted }}>
          &larr; All Groups
        </button>
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full" style={{ background: tc.text }} />
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
              {group.name}
            </h1>
            <div className="text-[13px]" style={{ color: tokens.textSecondary }}>
              {group.city}, {group.state} &middot; {group.provider_count} providers &middot; {group.total_panel_size.toLocaleString()} lives
            </div>
          </div>
          <div className="ml-auto text-xs font-semibold px-3 py-1 rounded-full" style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}>
            {group.tier.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {group.metrics.map((m) => {
          const mc = tierColors[m.tier] || tierColors.gray;
          return (
            <div key={m.key} className="rounded-[10px] border p-4" style={{ borderColor: mc.border, background: tokens.surface }}>
              <div className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: tokens.textMuted }}>{m.label}</div>
              <div className="text-xl font-semibold tracking-tight" style={{ fontFamily: fonts.code, color: mc.text !== tokens.textMuted ? mc.text : tokens.text }}>
                {fmtValue(m.key, m.value)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Provider breakdown */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: fonts.heading, color: tokens.text }}>Providers in This Group</h2>
        <div className="rounded-[10px] border overflow-x-auto" style={{ borderColor: tokens.border, background: tokens.surface }}>
          <table className="w-full text-[13px]" style={{ color: tokens.text }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
                {["Provider", "Specialty", "Panel", "Capture", "Recapture", "RAF", "PMPM", "Gap Closure"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-stone-50"
                  style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
                  onClick={() => navigate(`/providers/${p.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5" style={{ color: tokens.textSecondary }}>{p.specialty || "--"}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.panel_size.toLocaleString()}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.capture_rate != null ? `${p.capture_rate.toFixed(1)}%` : "--"}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.recapture_rate != null ? `${p.recapture_rate.toFixed(1)}%` : "--"}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.avg_raf != null ? p.avg_raf.toFixed(3) : "--"}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.panel_pmpm != null ? `$${p.panel_pmpm.toLocaleString()}` : "--"}</td>
                  <td className="px-4 py-2.5" style={{ fontFamily: fonts.code }}>{p.gap_closure_rate != null ? `${p.gap_closure_rate.toFixed(1)}%` : "--"}</td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center" style={{ color: tokens.textMuted }}>No providers in this group.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trends */}
      {trends && trends.capture_rate.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: fonts.heading, color: tokens.text }}>Quarterly Trends</h2>
          <div className="rounded-[10px] border overflow-x-auto" style={{ borderColor: tokens.border, background: tokens.surface }}>
            <table className="w-full text-[13px]" style={{ color: tokens.text }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>Quarter</th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>Capture Rate</th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>PMPM</th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>Gap Closure</th>
                </tr>
              </thead>
              <tbody>
                {trends.quarters.map((q, i) => (
                  <tr key={q} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td className="px-4 py-2.5">{q}</td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code }}>{trends.capture_rate[i]?.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code }}>${trends.group_pmpm[i]?.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code }}>{trends.gap_closure_rate[i]?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: fonts.heading, color: tokens.text }}>Cross-Group Insights</h2>
          <div className="space-y-3">
            {insights.map((ins) => (
              <div key={ins.id} className="rounded-[10px] border p-4" style={{ borderColor: tokens.border, background: tokens.surface }}>
                <div className="text-[13px] font-semibold mb-1" style={{ color: tokens.text }}>{ins.title}</div>
                <div className="text-[13px]" style={{ color: tokens.textSecondary }}>{ins.description}</div>
                {ins.recommended_action && (
                  <div className="text-[12px] mt-2 px-3 py-1.5 rounded" style={{ background: tokens.accentSoft, color: tokens.accentText }}>
                    {ins.recommended_action}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
