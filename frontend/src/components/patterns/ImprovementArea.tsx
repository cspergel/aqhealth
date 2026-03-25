import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImprovementAreaData {
  id: string;
  title: string;
  priority: "critical" | "high" | "medium";
  current_metric: string;
  target_metric: string;
  trend: string; // e.g. "Declining 3% QoQ"
  root_cause: string;
  recommended_fix: string;
  expected_impact: string;
  expected_impact_value: number; // raw dollar value for sorting
  category: string;
}

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: ImprovementAreaData["priority"] }) {
  const styles: Record<string, { bg: string; color: string }> = {
    critical: { bg: tokens.redSoft, color: tokens.red },
    high: { bg: tokens.amberSoft, color: tokens.amber },
    medium: { bg: "#f5f5f4", color: tokens.textSecondary },
  };
  const s = styles[priority];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImprovementArea({ area }: { area: ImprovementAreaData }) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = area.priority === "critical" ? tokens.red : tokens.amber;

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        background: tokens.surface,
        borderColor: tokens.border,
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <PriorityBadge priority={area.priority} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>
              {area.category}
            </span>
          </div>
          <h3
            className="text-[14px] font-semibold"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            {area.title}
          </h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] px-2 py-1 rounded-md border whitespace-nowrap"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          {expanded ? "Less" : "Details"}
        </button>
      </div>

      {/* Metric bar */}
      <div
        className="flex items-center gap-4 rounded-md px-4 py-3 mb-3"
        style={{ background: tokens.surfaceAlt }}
      >
        <div className="flex-1">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            Current
          </div>
          <div className="text-[15px] font-bold" style={{ color: tokens.text }}>
            {area.current_metric}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            Target
          </div>
          <div className="text-[15px] font-bold" style={{ color: tokens.textSecondary }}>
            {area.target_metric}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            Trend
          </div>
          <div className="text-[13px] font-semibold" style={{ color: tokens.red }}>
            {area.trend}
          </div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            Impact if Fixed
          </div>
          <div className="text-[15px] font-bold" style={{ color: tokens.accentText }}>
            {area.expected_impact}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-3 mt-3">
          {/* Root cause */}
          <div
            className="rounded-md px-4 py-3"
            style={{ background: tokens.amberSoft }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: tokens.amber }}
            >
              Root Cause Analysis
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: tokens.text }}>
              {area.root_cause}
            </p>
          </div>

          {/* Recommended fix */}
          <div
            className="rounded-md px-4 py-3"
            style={{ background: tokens.accentSoft }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wide mb-1"
              style={{ color: tokens.accentText }}
            >
              Recommended Fix
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: tokens.text }}>
              {area.recommended_fix}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
