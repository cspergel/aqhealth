import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Snapshot {
  date: string;
  total_members: number;
  avg_raf: number;
  total_suspects: number;
  total_spend: number;
  gap_closure_rate: number;
  pmpm: number;
}

interface Delta {
  old: number;
  new: number;
  change: number;
  pct_change: number;
}

interface Comparison {
  period_a: Snapshot;
  period_b: Snapshot;
  deltas: Record<string, Delta>;
  notable_changes: string[];
}

interface TimelinePoint {
  month: string;
  value: number;
}

interface ChangeEvent {
  date: string;
  event_type: string;
  description: string;
  impact: string;
}

type MetricKey =
  | "avg_raf"
  | "total_members"
  | "total_pmpm"
  | "suspect_count"
  | "gap_closure_rate"
  | "capture_rate";

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "avg_raf", label: "Average RAF Score" },
  { value: "total_members", label: "Total Members" },
  { value: "total_pmpm", label: "PMPM ($)" },
  { value: "suspect_count", label: "Suspect Inventory" },
  { value: "gap_closure_rate", label: "Gap Closure Rate (%)" },
  { value: "capture_rate", label: "Capture Rate (%)" },
];

const EVENT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  attribution: { bg: tokens.blueSoft, color: tokens.blue, label: "Attribution" },
  capture: { bg: tokens.accentSoft, color: tokens.accent, label: "Capture" },
  claim: { bg: tokens.redSoft, color: tokens.red, label: "Claim" },
  gap: { bg: tokens.amberSoft, color: tokens.amber, label: "Care Gap" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatMetricValue(key: string, value: number): string {
  if (key === "pmpm" || key === "total_spend") return formatDollars(value);
  if (key === "gap_closure_rate") return `${value.toFixed(1)}%`;
  if (key === "avg_raf") return value.toFixed(3);
  if (key === "total_members" || key === "total_suspects")
    return value.toLocaleString();
  return value.toString();
}

function formatDeltaValue(key: string, change: number): string {
  const sign = change > 0 ? "+" : "";
  if (key === "pmpm" || key === "total_spend") return `${sign}${formatDollars(change)}`;
  if (key === "gap_closure_rate") return `${sign}${change.toFixed(1)}pp`;
  if (key === "avg_raf") return `${sign}${change.toFixed(3)}`;
  if (key === "total_members" || key === "total_suspects")
    return `${sign}${change.toLocaleString()}`;
  return `${sign}${change}`;
}

/** Determine whether a change in this metric is "good" (green) or "bad" (red). */
function isImprovement(key: string, change: number): boolean {
  // Lower is better for: pmpm, total_spend, total_suspects
  if (key === "pmpm" || key === "total_spend" || key === "total_suspects") return change < 0;
  // Higher is better for everything else
  return change > 0;
}

const METRIC_LABELS: Record<string, string> = {
  total_members: "Total Members",
  avg_raf: "Avg RAF Score",
  pmpm: "PMPM",
  total_suspects: "Suspect Inventory",
  gap_closure_rate: "Gap Closure Rate",
  total_spend: "Total Spend",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ComparisonCard({
  metricKey,
  delta,
}: {
  metricKey: string;
  delta: Delta;
}) {
  const improved = isImprovement(metricKey, delta.change);
  const neutral = delta.change === 0;
  const arrowColor = neutral
    ? tokens.textMuted
    : improved
      ? tokens.accent
      : tokens.red;
  const arrow = neutral ? "--" : improved ? (delta.change > 0 ? "\u2191" : "\u2193") : delta.change > 0 ? "\u2191" : "\u2193";

  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 10,
        padding: "18px 20px",
        flex: "1 1 0",
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: tokens.textMuted,
          marginBottom: 10,
        }}
      >
        {METRIC_LABELS[metricKey] || metricKey}
      </div>

      {/* Before / After row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 2 }}>Before</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.heading, color: tokens.textSecondary }}>
            {formatMetricValue(metricKey, delta.old)}
          </div>
        </div>
        <div
          style={{
            fontSize: 20,
            color: tokens.textMuted,
            fontWeight: 300,
          }}
        >
          {"\u2192"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 2 }}>After</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text }}>
            {formatMetricValue(metricKey, delta.new)}
          </div>
        </div>
      </div>

      {/* Delta badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          fontWeight: 600,
          color: arrowColor,
          background: neutral ? tokens.surfaceAlt : improved ? tokens.accentSoft : tokens.redSoft,
          borderRadius: 6,
          padding: "3px 10px",
        }}
      >
        <span>{arrow}</span>
        <span>{formatDeltaValue(metricKey, delta.change)}</span>
        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>
          ({delta.pct_change > 0 ? "+" : ""}
          {delta.pct_change.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_STYLES[type] || { bg: tokens.surfaceAlt, color: tokens.textSecondary, label: type };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: style.bg,
        color: style.color,
        textTransform: "capitalize",
      }}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function TemporalPage() {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [changeLog, setChangeLog] = useState<ChangeEvent[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("avg_raf");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Period selection
  const [periodA] = useState("2025-10-01");
  const [periodB] = useState("2026-03-01");

  // Load comparison data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/temporal/compare", { params: { period_a: periodA, period_b: periodB } }),
      api.get("/api/temporal/timeline", { params: { metric: selectedMetric, months: 12 } }),
      api.get("/api/temporal/changes", { params: { start: periodA, end: periodB } }),
    ])
      .then(([compRes, timeRes, changeRes]) => {
        setComparison(compRes.data);
        setTimeline(timeRes.data);
        setChangeLog(changeRes.data);
      })
      .catch((err) => console.error("Temporal load error:", err))
      .finally(() => setLoading(false));
  }, [periodA, periodB]);

  // Reload timeline when metric changes
  useEffect(() => {
    api
      .get("/api/temporal/timeline", { params: { metric: selectedMetric, months: 12 } })
      .then((res) => setTimeline(res.data))
      .catch((err) => console.error("Timeline load error:", err));
  }, [selectedMetric]);

  const filteredLog =
    eventFilter === "all"
      ? changeLog
      : changeLog.filter((e) => e.event_type === eventFilter);

  // Calculate trend slope for the timeline
  const trendSlope =
    timeline.length >= 2
      ? timeline[timeline.length - 1].value - timeline[0].value
      : 0;

  const trendDirection =
    Math.abs(trendSlope) < 0.001
      ? "flat"
      : trendSlope > 0
        ? "upward"
        : "downward";

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === selectedMetric)?.label || selectedMetric;

  if (loading) {
    return (
      <div style={{ padding: 32, color: tokens.textMuted, fontFamily: fonts.body }}>
        Loading Time Machine...
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", fontFamily: fonts.body }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: fonts.heading,
            color: tokens.text,
            margin: 0,
          }}
        >
          Time Machine
        </h1>
        <p style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 4, marginBottom: 0 }}>
          See how your population looked at any point in the past and compare states over time.
        </p>
      </div>

      {/* ================================================================ */}
      {/* SECTION 1: Period Comparison                                      */}
      {/* ================================================================ */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          padding: "24px 28px",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: fonts.heading,
              color: tokens.text,
              margin: 0,
            }}
          >
            Period Comparison
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: tokens.textSecondary,
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                background: tokens.surfaceAlt,
                padding: "4px 12px",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                border: `1px solid ${tokens.border}`,
              }}
            >
              Oct 2025
            </span>
            <span style={{ color: tokens.textMuted }}>vs</span>
            <span
              style={{
                background: tokens.surfaceAlt,
                padding: "4px 12px",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                border: `1px solid ${tokens.border}`,
              }}
            >
              Mar 2026
            </span>
          </div>
        </div>

        {/* Metric cards */}
        {comparison && (
          <>
            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              {(["total_members", "avg_raf", "pmpm", "total_suspects", "gap_closure_rate", "total_spend"] as const).map(
                (key) =>
                  comparison.deltas[key] && (
                    <ComparisonCard
                      key={key}
                      metricKey={key}
                      delta={comparison.deltas[key]}
                    />
                  ),
              )}
            </div>

            {/* Notable changes */}
            <div>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: tokens.text,
                  marginBottom: 10,
                  marginTop: 0,
                }}
              >
                Notable Changes
              </h3>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {comparison.notable_changes.map((note, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      color: tokens.textSecondary,
                      background: tokens.surfaceAlt,
                      border: `1px solid ${tokens.borderSoft}`,
                      borderRadius: 6,
                      padding: "5px 12px",
                    }}
                  >
                    {note}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: Metric Timeline                                       */}
      {/* ================================================================ */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          padding: "24px 28px",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: fonts.heading,
              color: tokens.text,
              margin: 0,
            }}
          >
            Metric Timeline
          </h2>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              background: tokens.surface,
              color: tokens.text,
              cursor: "pointer",
              fontFamily: fonts.body,
            }}
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Trend indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color:
                trendDirection === "flat"
                  ? tokens.textMuted
                  : trendDirection === "upward"
                    ? tokens.accent
                    : tokens.red,
            }}
          >
            <span>
              {trendDirection === "flat"
                ? "--"
                : trendDirection === "upward"
                  ? "\u2197"
                  : "\u2198"}
            </span>
            <span style={{ textTransform: "capitalize" }}>{trendDirection} trend</span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSoft} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: tokens.textMuted }}
                axisLine={{ stroke: tokens.border }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: tokens.textMuted }}
                axisLine={{ stroke: tokens.border }}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${tokens.border}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value) => [Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }), metricLabel]}
              />
              {/* Trend reference line from first to last */}
              {timeline.length >= 2 && (
                <ReferenceLine
                  segment={[
                    { x: timeline[0].month, y: timeline[0].value },
                    { x: timeline[timeline.length - 1].month, y: timeline[timeline.length - 1].value },
                  ]}
                  stroke={tokens.textMuted}
                  strokeDasharray="6 4"
                  strokeWidth={1}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={tokens.accent}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: tokens.accent, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: tokens.accent, stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 3: Change Log                                            */}
      {/* ================================================================ */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          padding: "24px 28px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: fonts.heading,
              color: tokens.text,
              margin: 0,
            }}
          >
            Change Log
          </h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {["all", "attribution", "capture", "claim", "gap"].map((type) => (
              <button
                key={type}
                onClick={() => setEventFilter(type)}
                style={{
                  fontSize: 11,
                  fontWeight: eventFilter === type ? 600 : 400,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${eventFilter === type ? tokens.accent : tokens.border}`,
                  background: eventFilter === type ? tokens.accentSoft : tokens.surface,
                  color: eventFilter === type ? tokens.accent : tokens.textSecondary,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  fontFamily: fonts.body,
                }}
              >
                {type === "all" ? "All" : EVENT_TYPE_STYLES[type]?.label || type}
              </button>
            ))}
          </div>
        </div>

        {/* Events list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {filteredLog.map((event, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "12px 0",
                borderBottom: i < filteredLog.length - 1 ? `1px solid ${tokens.borderSoft}` : "none",
              }}
            >
              {/* Date */}
              <div
                style={{
                  fontSize: 12,
                  color: tokens.textMuted,
                  fontFamily: fonts.code,
                  minWidth: 80,
                  flexShrink: 0,
                  paddingTop: 1,
                }}
              >
                {event.date}
              </div>

              {/* Type badge */}
              <div style={{ flexShrink: 0 }}>
                <EventTypeBadge type={event.event_type} />
              </div>

              {/* Description */}
              <div style={{ flex: 1, fontSize: 13, color: tokens.text, lineHeight: 1.45 }}>
                {event.description}
              </div>

              {/* Impact */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: tokens.textSecondary,
                  flexShrink: 0,
                  textAlign: "right",
                  minWidth: 120,
                }}
              >
                {event.impact}
              </div>
            </div>
          ))}
        </div>

        {filteredLog.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: tokens.textMuted,
              textAlign: "center",
              padding: "24px 0",
            }}
          >
            No events matching the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
