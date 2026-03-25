import { tokens, fonts } from "../../lib/tokens";
import { InsightCard } from "../ui/InsightCard";

interface DashboardInsight {
  id: number;
  category: "revenue" | "cost" | "quality" | "provider" | "trend" | "cross_module";
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
}

interface InsightPanelProps {
  insights: DashboardInsight[];
  onRefresh?: () => void;
  onDismiss?: (id: number) => void;
  lastDiscoveryAt?: string;
}

function formatDollar(value: number | null): string | undefined {
  if (value == null) return undefined;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M impact`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K impact`;
  return `$${value.toFixed(0)} impact`;
}

function formatDiscoveryTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export function InsightPanel({ insights, onRefresh, onDismiss, lastDiscoveryAt }: InsightPanelProps) {
  return (
    <div
      className="rounded-[10px] border bg-white p-5"
      style={{ borderColor: tokens.border }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold"
            style={{ color: tokens.text, fontFamily: fonts.heading }}
          >
            Discovered Insights
          </h3>
          {lastDiscoveryAt && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: tokens.accentSoft, color: tokens.accentText }}
            >
              Discovered {formatDiscoveryTime(lastDiscoveryAt)}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-[11px] px-2.5 py-1 rounded border transition-colors hover:bg-stone-50"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Re-scan
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {insights.length === 0 ? (
          <div className="text-[13px] py-6 text-center" style={{ color: tokens.textMuted }}>
            No active insights at this time.
          </div>
        ) : (
          insights.map((insight) => (
            <InsightCard
              key={insight.id}
              title={insight.title}
              description={insight.description}
              impact={formatDollar(insight.dollar_impact)}
              category={insight.category}
              onDismiss={onDismiss ? () => onDismiss(insight.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
