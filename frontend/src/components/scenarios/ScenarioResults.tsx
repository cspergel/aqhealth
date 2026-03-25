import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioResult {
  scenario_name: string;
  scenario_type: string;
  current_state: Record<string, unknown>;
  projected_state: Record<string, unknown>;
  financial_impact: Record<string, number>;
  timeline: string;
  assumptions: string[];
  confidence: number;
}

interface ScenarioResultsProps {
  result: ScenarioResult | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "--";
  const v = Number(value);
  if (isNaN(v)) return String(value);

  if (key.includes("revenue") || key.includes("spend") || key.includes("savings") || key.includes("cost") || key.includes("impact") || key.includes("uplift") || key.includes("margin")) {
    return formatDollars(v);
  }
  if (key.includes("rate") || key.includes("pct") || key.includes("reduction")) {
    return `${v.toFixed(1)}%`;
  }
  if (key.includes("raf")) {
    return v.toFixed(3);
  }
  if (key.includes("count") || key.includes("lives") || key.includes("captures") || key.includes("panel") || key.includes("delta")) {
    return v.toLocaleString();
  }
  return String(value);
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Pct", "%")
    .replace("Avg", "Average");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenarioResults({ result }: ScenarioResultsProps) {
  if (!result) return null;

  // Find the primary financial impact metric
  const impactEntries = Object.entries(result.financial_impact);
  const primaryImpact = impactEntries[0];
  const isPositive = primaryImpact && primaryImpact[1] > 0;

  return (
    <div className="rounded-[10px] border p-6" style={{ borderColor: tokens.border, background: tokens.surface }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3
          className="text-[15px] font-semibold"
          style={{ color: tokens.text, fontFamily: fonts.heading }}
        >
          {result.scenario_name}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: tokens.textMuted }}>Confidence</span>
          <span
            className="text-[12px] font-semibold px-2 py-0.5 rounded"
            style={{
              background: result.confidence >= 75 ? tokens.accentSoft : tokens.amberSoft,
              color: result.confidence >= 75 ? tokens.accentText : tokens.amber,
              fontFamily: fonts.code,
            }}
          >
            {result.confidence}%
          </span>
        </div>
      </div>

      {/* Primary impact hero */}
      {primaryImpact && (
        <div
          className="rounded-lg p-4 mb-5 text-center"
          style={{
            background: isPositive ? tokens.accentSoft : tokens.redSoft,
            border: `1px solid ${isPositive ? tokens.accent + "30" : tokens.red + "30"}`,
          }}
        >
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: isPositive ? tokens.accentText : tokens.red }}>
            {labelFromKey(primaryImpact[0])}
          </div>
          <div
            className="text-3xl font-bold tracking-tight"
            style={{ color: isPositive ? tokens.accentText : tokens.red, fontFamily: fonts.code }}
          >
            {isPositive ? "+" : ""}{formatDollars(primaryImpact[1])}
          </div>
          <div className="text-[11px] mt-1" style={{ color: tokens.textMuted }}>
            per year
          </div>
        </div>
      )}

      {/* Current vs Projected */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Current state */}
        <div className="rounded-lg p-4" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: tokens.textMuted }}>
            Current State
          </div>
          {Object.entries(result.current_state).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center mb-1.5">
              <span className="text-[12px]" style={{ color: tokens.textSecondary }}>{labelFromKey(key)}</span>
              <span className="text-[12px] font-medium" style={{ color: tokens.text, fontFamily: fonts.code }}>
                {formatValue(key, value)}
              </span>
            </div>
          ))}
        </div>

        {/* Projected state */}
        <div className="rounded-lg p-4" style={{ background: tokens.accentSoft + "60" }}>
          <div className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: tokens.accentText }}>
            Projected State
          </div>
          {Object.entries(result.projected_state).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center mb-1.5">
              <span className="text-[12px]" style={{ color: tokens.textSecondary }}>{labelFromKey(key)}</span>
              <span className="text-[12px] font-medium" style={{ color: tokens.accentText, fontFamily: fonts.code }}>
                {formatValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* All financial impact metrics */}
      <div className="rounded-lg p-4 mb-5" style={{ background: tokens.surfaceAlt }}>
        <div className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: tokens.textMuted }}>
          Financial Impact
        </div>
        <div className="grid grid-cols-3 gap-3">
          {impactEntries.map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="text-[11px] mb-0.5" style={{ color: tokens.textMuted }}>{labelFromKey(key)}</div>
              <div
                className="text-[15px] font-bold"
                style={{ color: value > 0 ? tokens.accentText : tokens.red, fontFamily: fonts.code }}
              >
                {value > 0 ? "+" : ""}{formatDollars(value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: tokens.textMuted }}>
          Timeline:
        </span>
        <span className="text-[12px] font-medium" style={{ color: tokens.text }}>
          {result.timeline}
        </span>
      </div>

      {/* Assumptions */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: tokens.textMuted }}>
          Assumptions
        </div>
        <ul className="space-y-1">
          {result.assumptions.map((a, i) => (
            <li key={i} className="text-[12px] flex items-start gap-1.5" style={{ color: tokens.textSecondary }}>
              <span style={{ color: tokens.textMuted }}>-</span>
              {a}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
