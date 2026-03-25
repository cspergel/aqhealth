import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface GroupSummary {
  id: number;
  name: string;
  city: string;
  state: string;
  tier: string;
  provider_count: number;
  total_panel_size: number;
}

interface ComparisonMetric {
  key: string;
  value_a: number | null;
  value_b: number | null;
  winner: "a" | "b" | null;
}

interface ComparisonData {
  group_a: GroupSummary;
  group_b: GroupSummary;
  metrics: ComparisonMetric[];
}

const METRIC_LABELS: Record<string, string> = {
  provider_count: "Provider Count",
  total_panel_size: "Total Panel Size",
  avg_capture_rate: "Avg Capture Rate",
  avg_recapture_rate: "Avg Recapture Rate",
  avg_raf: "Avg RAF Score",
  group_pmpm: "Group PMPM",
  gap_closure_rate: "Gap Closure Rate",
};

function fmtValue(key: string, val: number | null): string {
  if (val == null) return "--";
  if (key === "provider_count" || key === "total_panel_size") return val.toLocaleString();
  if (key === "group_pmpm") return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (key === "avg_raf") return val.toFixed(3);
  return `${val.toFixed(1)}%`;
}

interface GroupComparisonProps {
  groupIdA: number;
  groupIdB: number;
  onClose: () => void;
}

export function GroupComparison({ groupIdA, groupIdB, onClose }: GroupComparisonProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [insights, setInsights] = useState<{ id: number; title: string; description: string; recommended_action?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.get(`/api/groups/compare?a=${groupIdA}&b=${groupIdB}`),
      api.get("/api/groups/insights"),
    ])
      .then(([cmp, ins]) => {
        if (cmp.status === "fulfilled") setData(cmp.value.data);
        if (ins.status === "fulfilled") setInsights(Array.isArray(ins.value.data) ? ins.value.data : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [groupIdA, groupIdB]);

  if (loading) {
    return <div className="p-7" style={{ color: tokens.textMuted }}>Loading comparison...</div>;
  }
  if (!data) {
    return <div className="p-7" style={{ color: tokens.textMuted }}>Comparison not available.</div>;
  }

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onClose} className="text-[13px] mb-3 inline-block" style={{ color: tokens.textMuted }}>
            &larr; Back to Groups
          </button>
          <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Group Comparison
          </h1>
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
            {data.group_a.name} vs {data.group_b.name}
          </p>
        </div>
      </div>

      {/* Comparison table */}
      <div className="rounded-[10px] border overflow-x-auto" style={{ borderColor: tokens.border, background: tokens.surface }}>
        <table className="w-full text-[13px]" style={{ color: tokens.text }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>Metric</th>
              <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                {data.group_a.name}
              </th>
              <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                {data.group_b.name}
              </th>
              <th className="px-4 py-3 text-center text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>Leader</th>
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((m) => (
              <tr key={m.key} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                <td className="px-4 py-3">{METRIC_LABELS[m.key] || m.key}</td>
                <td
                  className="px-4 py-3 text-right font-medium"
                  style={{
                    fontFamily: fonts.code,
                    color: m.winner === "a" ? tokens.accentText : tokens.text,
                    background: m.winner === "a" ? tokens.accentSoft : "transparent",
                  }}
                >
                  {fmtValue(m.key, m.value_a)}
                </td>
                <td
                  className="px-4 py-3 text-right font-medium"
                  style={{
                    fontFamily: fonts.code,
                    color: m.winner === "b" ? tokens.accentText : tokens.text,
                    background: m.winner === "b" ? tokens.accentSoft : "transparent",
                  }}
                >
                  {fmtValue(m.key, m.value_b)}
                </td>
                <td className="px-4 py-3 text-center text-[12px]" style={{ color: tokens.textMuted }}>
                  {m.winner === "a" ? data.group_a.name : m.winner === "b" ? data.group_b.name : "--"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: fonts.heading, color: tokens.text }}>AI Insights</h2>
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
