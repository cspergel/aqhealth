import { useEffect, useState, useMemo } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { PlaybookCard, type Playbook } from "../components/patterns/PlaybookCard";
import { CodeUtilizationTable, type CodeUtilization } from "../components/patterns/CodeUtilizationTable";
import { SuccessStory, type SuccessStoryData } from "../components/patterns/SuccessStory";
import { ImprovementArea, type ImprovementAreaData } from "../components/patterns/ImprovementArea";
import { LearningDashboard } from "../components/learning/LearningDashboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "playbooks" | "code-utilization" | "whats-working" | "needs-improvement" | "benchmarks" | "system-learning";

interface BenchmarkTier {
  network_avg: number;
  top_decile: number;
  top_quartile: number;
  median: number;
  bottom_quartile: number;
}

interface Benchmarks {
  provider_count: number;
  group_count?: number;
  provider_metrics?: Record<string, BenchmarkTier>;
  group_metrics?: Record<string, BenchmarkTier>;
  // Backend may also return a flat "metrics" key instead of provider_metrics/group_metrics
  metrics?: Record<string, BenchmarkTier>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "playbooks", label: "Best Practices" },
  { key: "code-utilization", label: "Code Utilization" },
  { key: "whats-working", label: "What's Working" },
  { key: "needs-improvement", label: "Needs Improvement" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "system-learning", label: "System Learning" },
];

const METRIC_LABELS: Record<string, string> = {
  capture_rate: "Capture Rate",
  recapture_rate: "Recapture Rate",
  avg_raf: "Avg RAF Score",
  panel_pmpm: "Panel PMPM",
  gap_closure_rate: "Gap Closure Rate",
  avg_capture_rate: "Avg Capture Rate",
  group_pmpm: "Group PMPM",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatternsPage() {
  const initialTab = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const validTabs: Tab[] = ["playbooks", "code-utilization", "whats-working", "needs-improvement", "benchmarks", "system-learning"];
    return validTabs.includes(t as Tab) ? (t as Tab) : "playbooks";
  }, []);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [codeData, setCodeData] = useState<{ codes: CodeUtilization[] }>({ codes: [] });
  const [stories, setStories] = useState<SuccessStoryData[]>([]);
  const [improvements, setImprovements] = useState<ImprovementAreaData[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tab === "system-learning") return; // LearningDashboard handles its own data
    setLoading(true);
    const endpoint =
      tab === "playbooks" ? "/api/patterns/playbooks" :
      tab === "code-utilization" ? "/api/patterns/code-utilization" :
      tab === "whats-working" ? "/api/patterns/outcomes" :
      tab === "needs-improvement" ? "/api/patterns/improvements" :
      "/api/patterns/benchmarks";

    api.get(endpoint)
      .then((res) => {
        if (tab === "playbooks") setPlaybooks(Array.isArray(res.data) ? res.data : []);
        else if (tab === "code-utilization") setCodeData(res.data ?? { codes: [] });
        else if (tab === "whats-working") setStories(Array.isArray(res.data) ? res.data : []);
        else if (tab === "needs-improvement") setImprovements(Array.isArray(res.data) ? res.data : []);
        else setBenchmarks(res.data);
      })
      .catch((err) => {
        console.error("Failed to load pattern data:", err);
        // Gracefully handle 404s by setting empty state
        if (tab === "playbooks") setPlaybooks([]);
        else if (tab === "code-utilization") setCodeData({ codes: [] });
        else if (tab === "whats-working") setStories([]);
        else if (tab === "needs-improvement") setImprovements([]);
        else setBenchmarks(null);
      })
      .finally(() => setLoading(false));
  }, [tab]);

  const renderBenchmarkTable = (label: string, metrics: Record<string, BenchmarkTier>) => (
    <div className="mb-6">
      <h3
        className="text-[14px] font-semibold mb-3"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        {label}
      </h3>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <table className="w-full text-[13px]" style={{ color: tokens.text }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Metric</th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Bottom Quartile</th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Network Avg</th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Median</th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Top Quartile</th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>Top Decile</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(metrics).map(([key, tier]) => (
              <tr key={key} className="border-t" style={{ borderColor: tokens.borderSoft }}>
                <td className="px-4 py-3 font-medium">{METRIC_LABELS[key] || key}</td>
                <td className="px-4 py-3 text-right" style={{ color: tokens.textMuted }}>{tier.bottom_quartile}</td>
                <td className="px-4 py-3 text-right" style={{ color: tokens.textSecondary }}>{tier.network_avg}</td>
                <td className="px-4 py-3 text-right" style={{ color: tokens.textSecondary }}>{tier.median}</td>
                <td className="px-4 py-3 text-right font-medium" style={{ color: tokens.accentText }}>{tier.top_quartile}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: tokens.accentText }}>{tier.top_decile}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold mb-1"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Intelligence
        </h1>
        <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
          Success patterns and actionable playbooks from your network's top performers.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-[13px] rounded-md transition-colors"
            style={{
              background: tab === t.key ? tokens.accentSoft : "transparent",
              color: tab === t.key ? tokens.accentText : tokens.textMuted,
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-[13px]" style={{ color: tokens.textMuted }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Best Practices tab */}
          {tab === "playbooks" && (
            <div className="space-y-5">
              {playbooks.length === 0 ? (
                <p className="text-[13px]" style={{ color: tokens.textMuted }}>No playbooks available yet.</p>
              ) : (
                playbooks.map((pb) => <PlaybookCard key={pb.id} playbook={pb} />)
              )}
            </div>
          )}

          {/* Code Utilization tab */}
          {tab === "code-utilization" && (
            <CodeUtilizationTable codes={codeData.codes || []} />
          )}

          {/* What's Working tab */}
          {tab === "whats-working" && (
            <div className="space-y-4">
              {stories.length === 0 ? (
                <p className="text-[13px]" style={{ color: tokens.textMuted }}>No success stories yet.</p>
              ) : (
                stories.map((s) => <SuccessStory key={s.id} story={s} />)
              )}
            </div>
          )}

          {/* Needs Improvement tab */}
          {tab === "needs-improvement" && (
            <div className="space-y-4">
              {improvements.length === 0 ? (
                <p className="text-[13px]" style={{ color: tokens.textMuted }}>No improvement areas identified yet.</p>
              ) : (
                improvements.map((area) => <ImprovementArea key={area.id} area={area} />)
              )}
            </div>
          )}

          {/* System Learning tab */}
          {tab === "system-learning" && (
            <LearningDashboard />
          )}

          {/* Benchmarks tab */}
          {tab === "benchmarks" && benchmarks && (
            <div>
              <div
                className="rounded-md px-4 py-3 mb-6 text-[13px]"
                style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}
              >
                These benchmarks are from <strong>your own network</strong> — {benchmarks.provider_count ?? 0} providers
                {benchmarks.group_count != null && <> across {benchmarks.group_count} practice groups</>}. This is what your best performers actually achieve.
              </div>
              {/* Support both provider_metrics/group_metrics and flat metrics key from API */}
              {benchmarks.provider_metrics && Object.keys(benchmarks.provider_metrics).length > 0 &&
                renderBenchmarkTable("Provider Benchmarks", benchmarks.provider_metrics)}
              {benchmarks.group_metrics && Object.keys(benchmarks.group_metrics).length > 0 &&
                renderBenchmarkTable("Practice Group Benchmarks", benchmarks.group_metrics)}
              {benchmarks.metrics && Object.keys(benchmarks.metrics).length > 0 &&
                !benchmarks.provider_metrics && !benchmarks.group_metrics &&
                renderBenchmarkTable("Network Benchmarks", benchmarks.metrics)}
              {!benchmarks.provider_metrics && !benchmarks.group_metrics &&
                (!benchmarks.metrics || Object.keys(benchmarks.metrics).length === 0) && (
                <div className="text-[13px] text-center py-8" style={{ color: tokens.textMuted }}>
                  No benchmark data available yet. Benchmarks will appear once provider performance data is sufficient.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
