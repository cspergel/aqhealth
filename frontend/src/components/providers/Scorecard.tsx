import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { InsightCard } from "../ui/InsightCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricDetail {
  key: string;
  label: string;
  value: number | null;
  target: number | null;
  tier: string;
  percentile: number | null;
  trend: number | null;
}

interface ScorecardData {
  id: number;
  npi: string;
  name: string;
  specialty: string | null;
  practice_name: string | null;
  panel_size: number;
  tier: string;
  metrics: MetricDetail[];
  targets: Record<string, number | null>;
}

interface ComparisonMetric {
  provider_value: number | null;
  network_avg: number | null;
  top_quartile: number | null;
  bottom_quartile: number | null;
}

interface PeerComparison {
  provider_id: number;
  name: string;
  comparisons: Record<string, ComparisonMetric>;
}

interface InsightData {
  id: number;
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
  category: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: tokens.accentSoft, border: "#bbf7d0", text: tokens.accentText },
  amber: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
  red: { bg: tokens.redSoft, border: "#fecaca", text: "#991b1b" },
  gray: { bg: tokens.surfaceAlt, border: tokens.border, text: tokens.textMuted },
};

function fmtValue(key: string, val: number | null): string {
  if (val == null) return "--";
  if (key === "panel_size") return val.toLocaleString();
  if (key === "panel_pmpm") return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (key === "avg_raf") return val.toFixed(3);
  return `${val.toFixed(1)}%`;
}

const METRIC_LABELS: Record<string, string> = {
  panel_size: "Panel Size",
  capture_rate: "Capture Rate",
  recapture_rate: "Recapture Rate",
  avg_raf: "Avg RAF Score",
  panel_pmpm: "Panel PMPM",
  gap_closure_rate: "Gap Closure Rate",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Scorecard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [comparison, setComparison] = useState<PeerComparison | null>(null);
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.allSettled([
      api.get(`/api/providers/${id}`),
      api.get(`/api/providers/${id}/comparison`),
      api.get(`/api/providers/${id}/insights`),
    ])
      .then(([sc, cmp, ins]) => {
        if (sc.status === "fulfilled") setScorecard(sc.value.data);
        if (cmp.status === "fulfilled") setComparison(cmp.value.data);
        if (ins.status === "fulfilled") setInsights(Array.isArray(ins.value.data) ? ins.value.data : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveTargets = async () => {
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(targetDraft)) {
      const num = parseFloat(v);
      if (!isNaN(num)) payload[k] = num;
    }
    if (Object.keys(payload).length === 0) return;
    try {
      await api.patch(`/api/providers/${id}/targets`, payload);
      // Refresh scorecard
      const res = await api.get(`/api/providers/${id}`);
      setScorecard(res.data);
      setEditingTargets(false);
    } catch (err) {
      console.error("Failed to update targets", err);
    }
  };

  if (loading) {
    return (
      <div className="p-7" style={{ color: tokens.textMuted }}>
        Loading scorecard...
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="p-7" style={{ color: tokens.textMuted }}>
        Provider not found.
      </div>
    );
  }

  const tc = tierColors[scorecard.tier] || tierColors.gray;

  return (
    <div className="p-7 space-y-6">
      {/* Back link + header */}
      <div>
        <button
          onClick={() => navigate("/providers")}
          className="text-[13px] mb-3 inline-block"
          style={{ color: tokens.textMuted }}
        >
          &larr; All Providers
        </button>
        <div className="flex items-center gap-4">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: tierColors[scorecard.tier]?.text || tokens.textMuted }}
          />
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              {scorecard.name}
            </h1>
            <div className="text-[13px]" style={{ color: tokens.textSecondary }}>
              {scorecard.specialty || "General"} &middot; NPI {scorecard.npi}
              {scorecard.practice_name && ` \u00b7 ${scorecard.practice_name}`}
            </div>
          </div>
          <div
            className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}
          >
            {scorecard.tier.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {(scorecard.metrics ?? []).map((m) => {
          const mc = tierColors[m.tier] || tierColors.gray;
          return (
            <div
              key={m.key}
              className="rounded-[10px] border p-4"
              style={{ borderColor: mc.border, background: tokens.surface }}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: tokens.textMuted }}>
                {METRIC_LABELS[m.key] || m.label}
              </div>
              <div
                className="text-xl font-semibold tracking-tight"
                style={{ fontFamily: fonts.code, color: mc.text !== tokens.textMuted ? mc.text : tokens.text }}
              >
                {fmtValue(m.key, m.value)}
              </div>
              {m.target != null && (
                <div className="text-[11px] mt-1" style={{ color: tokens.textMuted }}>
                  Target: {fmtValue(m.key, m.target)}
                </div>
              )}
              {m.percentile != null && (
                <div className="text-[11px]" style={{ color: tokens.textSecondary }}>
                  {m.percentile}th percentile
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Peer comparison */}
      {comparison && (
        <div>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Peer Comparison
          </h2>
          <div
            className="rounded-[10px] border overflow-x-auto"
            style={{ borderColor: tokens.border, background: tokens.surface }}
          >
            <table className="w-full text-[13px]" style={{ color: tokens.text }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                    Metric
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                    Provider
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                    Network Avg
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                    Top Quartile
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide font-medium" style={{ color: tokens.textSecondary }}>
                    Bottom Quartile
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparison.comparisons ?? {}).map(([key, cm]) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td className="px-4 py-2.5">{METRIC_LABELS[key] || key}</td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code }}>
                      {fmtValue(key, cm.provider_value)}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                      {fmtValue(key, cm.network_avg)}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                      {fmtValue(key, cm.top_quartile)}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={{ fontFamily: fonts.code, color: tokens.red }}>
                      {fmtValue(key, cm.bottom_quartile)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI coaching insights */}
      {insights.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            AI Coaching Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins) => (
              <InsightCard
                key={ins.id}
                title={ins.title}
                description={ins.description}
                impact={
                  ins.dollar_impact
                    ? `$${ins.dollar_impact.toLocaleString()} potential impact`
                    : undefined
                }
                category={ins.category as any}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit targets (MSO admin) */}
      <div>
        {!editingTargets ? (
          <button
            onClick={() => {
              const draft: Record<string, string> = {};
              if (scorecard.targets) {
                for (const [k, v] of Object.entries(scorecard.targets)) {
                  draft[k] = v != null ? String(v) : "";
                }
              }
              setTargetDraft(draft);
              setEditingTargets(true);
            }}
            className="text-[13px] px-4 py-2 rounded-lg border"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Edit Targets
          </button>
        ) : (
          <div
            className="rounded-[10px] border p-4 space-y-3"
            style={{ borderColor: tokens.border, background: tokens.surface }}
          >
            <div className="text-sm font-semibold" style={{ color: tokens.text }}>
              Edit Performance Targets
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {["capture_rate", "recapture_rate", "gap_closure_rate"].map((key) => (
                <div key={key}>
                  <label className="text-[11px] uppercase tracking-wide font-medium block mb-1" style={{ color: tokens.textMuted }}>
                    {METRIC_LABELS[key] || key}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetDraft[key] || ""}
                    onChange={(e) => setTargetDraft({ ...targetDraft, [key]: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border text-[13px]"
                    style={{ borderColor: tokens.border, fontFamily: fonts.code, color: tokens.text }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveTargets}
                className="text-[13px] px-4 py-1.5 rounded-lg text-white"
                style={{ background: tokens.accent }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingTargets(false)}
                className="text-[13px] px-4 py-1.5 rounded-lg border"
                style={{ borderColor: tokens.border, color: tokens.textSecondary }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
