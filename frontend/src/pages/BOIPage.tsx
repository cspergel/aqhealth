import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelinePoint {
  month: string;
  metric: number;
  label: string;
}

interface Intervention {
  id: number;
  name: string;
  description: string | null;
  intervention_type: string;
  target: string | null;
  investment_amount: number;
  investment_period: string | null;
  start_date: string;
  end_date: string | null;
  baseline_metric: number;
  current_metric: number;
  metric_name: string | null;
  estimated_return: number;
  actual_return: number;
  roi_percentage: number;
  affected_members: number | null;
  affected_providers: number | null;
  status: string;
  timeline?: TimelinePoint[];
}

interface BOIDashboard {
  interventions: Intervention[];
  total_invested: number;
  total_returned: number;
  avg_roi: number;
  intervention_count: number;
}

interface Recommendation {
  id: string;
  name: string;
  description: string;
  intervention_type: string;
  target: string;
  estimated_investment: number;
  estimated_return: number;
  estimated_roi: number;
  confidence: number;
  rationale: string;
}

type ActiveView = "dashboard" | "detail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const TYPE_LABELS: Record<string, string> = {
  education: "Education",
  outreach: "Outreach",
  staffing: "Staffing",
  technology: "Technology",
  program: "Program",
  process: "Process",
};

const METRIC_LABELS: Record<string, string> = {
  capture_rate: "Capture Rate",
  readmit_rate: "Readmission Rate",
  pmpm: "PMPM",
  gap_closure: "Gap Closure",
};

const TARGET_LABELS: Record<string, string> = {
  diabetes_capture: "Diabetes Capture",
  readmission_reduction: "Readmission Reduction",
  gap_closure: "Gap Closure",
  cost_reduction: "Cost Reduction",
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  active: { bg: tokens.accentSoft, color: tokens.accentText },
  completed: { bg: tokens.blueSoft, color: tokens.blue },
  planned: { bg: tokens.amberSoft, color: tokens.amber },
  cancelled: { bg: tokens.redSoft, color: tokens.red },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ROIBadge({ roi }: { roi: number }) {
  const color = roi >= 500 ? "#059669" : roi >= 200 ? tokens.accentText : roi >= 0 ? tokens.amber : tokens.red;
  const bg = roi >= 500 ? "#d1fae5" : roi >= 200 ? tokens.accentSoft : roi >= 0 ? tokens.amberSoft : tokens.redSoft;
  return (
    <span style={{ fontSize: 14, fontWeight: 700, padding: "4px 12px", borderRadius: 6, background: bg, color }}>
      {roi}% ROI
    </span>
  );
}

function TimelineChart({ timeline, metricName, isReverse }: { timeline: TimelinePoint[]; metricName: string; isReverse?: boolean }) {
  if (!timeline || timeline.length === 0) return null;

  const values = timeline.map((p) => p.metric);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 120;
  const w = 400;
  const padding = 20;

  const points = timeline.map((p, i) => {
    const x = padding + (i / (timeline.length - 1)) * (w - 2 * padding);
    const y = h - padding - ((p.metric - min) / range) * (h - 2 * padding);
    return { x, y, ...p };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Determine if trend is good
  const improving = isReverse
    ? values[values.length - 1] < values[0]
    : values[values.length - 1] > values[0];
  const lineColor = improving ? tokens.accent : tokens.red;

  return (
    <div>
      <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 4 }}>{METRIC_LABELS[metricName] || metricName} progression</div>
      <svg width={w} height={h} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = h - padding - pct * (h - 2 * padding);
          return <line key={pct} x1={padding} y1={y} x2={w - padding} y2={y} stroke={tokens.borderSoft} strokeWidth={1} />;
        })}
        {/* Line */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Area fill */}
        <path
          d={`${pathD} L ${points[points.length - 1].x} ${h - padding} L ${points[0].x} ${h - padding} Z`}
          fill={lineColor}
          opacity={0.08}
        />
        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke={lineColor} strokeWidth={2} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={9} fill={tokens.textSecondary} fontWeight={600}>
              {metricName === "pmpm" ? `$${p.metric}` : `${p.metric}%`}
            </text>
            <text x={p.x} y={h - 4} textAnchor="middle" fontSize={8} fill={tokens.textMuted}>
              {p.month.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function InterventionCard({ intervention, onSelect }: { intervention: Intervention; onSelect: (id: number) => void }) {
  const status = STATUS_STYLES[intervention.status] || STATUS_STYLES.active;
  const metricChange = intervention.current_metric - intervention.baseline_metric;
  const isReverse = intervention.metric_name === "readmit_rate" || intervention.metric_name === "pmpm";
  const changeIsGood = isReverse ? metricChange < 0 : metricChange > 0;

  return (
    <div
      onClick={() => onSelect(intervention.id)}
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 10,
        padding: 20,
        cursor: "pointer",
        transition: "box-shadow 150ms, border-color 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tokens.accent;
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tokens.border;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: tokens.text, marginBottom: 4 }}>{intervention.name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: status.bg, color: status.color, fontWeight: 600, textTransform: "uppercase" }}>
              {intervention.status}
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
              {TYPE_LABELS[intervention.intervention_type] || intervention.intervention_type}
            </span>
            {intervention.target && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
                {TARGET_LABELS[intervention.target] || intervention.target}
              </span>
            )}
          </div>
        </div>
        <ROIBadge roi={intervention.roi_percentage} />
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 12, fontSize: 12 }}>
        <div>
          <span style={{ color: tokens.textMuted }}>Invested: </span>
          <span style={{ fontWeight: 600, color: tokens.text }}>{fmt(intervention.investment_amount)}</span>
        </div>
        <div>
          <span style={{ color: tokens.textMuted }}>Returned: </span>
          <span style={{ fontWeight: 700, color: tokens.accent }}>{fmt(intervention.actual_return)}</span>
        </div>
        <div>
          <span style={{ color: tokens.textMuted }}>Members: </span>
          <span style={{ fontWeight: 500, color: tokens.text }}>{intervention.affected_members?.toLocaleString() || "-"}</span>
        </div>
      </div>

      {/* Metric change */}
      {intervention.metric_name && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: tokens.textMuted }}>{METRIC_LABELS[intervention.metric_name] || intervention.metric_name}:</span>
          <span style={{ fontWeight: 500, color: tokens.textSecondary }}>
            {intervention.metric_name === "pmpm" ? `$${intervention.baseline_metric}` : `${intervention.baseline_metric}%`}
          </span>
          <span style={{ color: tokens.textMuted }}>&rarr;</span>
          <span style={{ fontWeight: 700, color: changeIsGood ? tokens.accent : tokens.red }}>
            {intervention.metric_name === "pmpm" ? `$${intervention.current_metric}` : `${intervention.current_metric}%`}
          </span>
          <span style={{ fontWeight: 600, color: changeIsGood ? tokens.accent : tokens.red }}>
            ({isReverse ? "" : "+"}{metricChange.toFixed(1)}{intervention.metric_name === "pmpm" ? "" : "pp"})
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function BOIPage() {
  const [dashboard, setDashboard] = useState<BOIDashboard | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ActiveView>("dashboard");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/boi/dashboard"),
      api.get("/api/boi/recommendations"),
    ])
      .then(([dashRes, recRes]) => {
        setDashboard(dashRes.data);
        setRecommendations(recRes.data);
      })
      .catch((err) => console.error("Failed to load BOI data:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setView("detail");
  };

  const handleBack = () => {
    setView("dashboard");
    setSelectedId(null);
  };

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading ROI data...</div>;
  }

  if (view === "detail" && selectedId && dashboard) {
    const intervention = dashboard.interventions.find((i) => i.id === selectedId);
    if (intervention) return <DetailView intervention={intervention} onBack={handleBack} />;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        ROI Tracker
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 20 }}>
        Track the benefit of investment for clinical and operational interventions.
      </p>

      {dashboard && (
        <>
          {/* Top metrics */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <MetricBox label="Total Invested" value={fmt(dashboard.total_invested)} sub={`${dashboard.intervention_count} interventions`} />
            <MetricBox label="Total Returned" value={fmt(dashboard.total_returned)} color={tokens.accent} />
            <MetricBox label="Net Benefit" value={fmt(dashboard.total_returned - dashboard.total_invested)} color={tokens.accent} sub="returned - invested" />
            <MetricBox label="Average ROI" value={`${dashboard.avg_roi}%`} color={tokens.accent} sub="across all interventions" />
          </div>

          {/* Top ROI Leaderboard */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Top ROI Leaderboard</h2>
            <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
              {[...dashboard.interventions]
                .sort((a, b) => b.roi_percentage - a.roi_percentage)
                .map((i, rank) => (
                  <div
                    key={i.id}
                    onClick={() => handleSelect(i.id)}
                    style={{
                      minWidth: 180,
                      padding: "16px 20px",
                      borderRadius: 10,
                      background: rank === 0 ? "linear-gradient(135deg, #dcfce7, #f0fdf4)" : tokens.surfaceAlt,
                      border: `1px solid ${rank === 0 ? tokens.accent : tokens.borderSoft}`,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "transform 150ms",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 4 }}>#{rank + 1}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: fonts.heading, color: tokens.accent, marginBottom: 4 }}>{i.roi_percentage}%</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: tokens.text, marginBottom: 2 }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>{fmt(i.investment_amount)} invested</div>
                  </div>
                ))}
            </div>
          </div>

          {/* Intervention Cards */}
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>Active Interventions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {dashboard.interventions.map((intervention) => (
              <InterventionCard key={intervention.id} intervention={intervention} onSelect={handleSelect} />
            ))}
          </div>

          {/* Recommended Interventions */}
          {recommendations.length > 0 && (
            <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 4, color: tokens.text }}>Recommended Investments</h2>
              <p style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 16 }}>AI-suggested interventions based on current platform data</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recommendations.map((rec) => (
                  <div key={rec.id} style={{ padding: 16, borderRadius: 8, border: `1px solid ${tokens.borderSoft}`, borderLeft: `4px solid ${tokens.blue}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: tokens.text, marginBottom: 4 }}>{rec.name}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
                            {TYPE_LABELS[rec.intervention_type] || rec.intervention_type}
                          </span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tokens.blueSoft, color: tokens.blue }}>
                            {rec.confidence}% confidence
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.heading, color: tokens.accent }}>{rec.estimated_roi}%</div>
                        <div style={{ fontSize: 10, color: tokens.textMuted }}>est. ROI</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 8, lineHeight: 1.5 }}>{rec.description}</div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                      <div>
                        <span style={{ color: tokens.textMuted }}>Investment: </span>
                        <span style={{ fontWeight: 600, color: tokens.text }}>{fmt(rec.estimated_investment)}</span>
                      </div>
                      <div>
                        <span style={{ color: tokens.textMuted }}>Est. Return: </span>
                        <span style={{ fontWeight: 600, color: tokens.accent }}>{fmt(rec.estimated_return)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 8, fontStyle: "italic" }}>{rec.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail View
// ---------------------------------------------------------------------------

function DetailView({ intervention, onBack }: { intervention: Intervention; onBack: () => void }) {
  const status = STATUS_STYLES[intervention.status] || STATUS_STYLES.active;
  const isReverse = intervention.metric_name === "readmit_rate" || intervention.metric_name === "pmpm";
  const metricChange = intervention.current_metric - intervention.baseline_metric;
  const changeIsGood = isReverse ? metricChange < 0 : metricChange > 0;

  return (
    <div style={{ padding: "24px 32px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: tokens.accent,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          padding: 0,
          marginBottom: 16,
        }}
      >
        &larr; Back to ROI Tracker
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>{intervention.name}</h1>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, background: status.bg, color: status.color, fontWeight: 600, textTransform: "uppercase" }}>
              {intervention.status}
            </span>
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
              {TYPE_LABELS[intervention.intervention_type] || intervention.intervention_type}
            </span>
          </div>
          <p style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.6, maxWidth: 640 }}>{intervention.description}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 42, fontWeight: 800, fontFamily: fonts.heading, color: tokens.accent }}>{intervention.roi_percentage}%</div>
          <div style={{ fontSize: 13, color: tokens.textMuted }}>Return on Investment</div>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricBox label="Investment" value={fmt(intervention.investment_amount)} sub={intervention.investment_period?.replace("_", " ") || "one-time"} />
        <MetricBox label="Actual Return" value={fmt(intervention.actual_return)} color={tokens.accent} />
        <MetricBox label="Net Benefit" value={fmt(intervention.actual_return - intervention.investment_amount)} color={tokens.accent} />
        <MetricBox label="Affected Members" value={intervention.affected_members?.toLocaleString() || "-"} sub={`${intervention.affected_providers || "-"} providers`} />
      </div>

      {/* Metric Progression */}
      {intervention.metric_name && (
        <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 420, background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 4, color: tokens.text }}>Metric Progression</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: tokens.textMuted }}>
                {METRIC_LABELS[intervention.metric_name] || intervention.metric_name}: {" "}
                <span style={{ fontWeight: 500, color: tokens.textSecondary }}>
                  {intervention.metric_name === "pmpm" ? `$${intervention.baseline_metric}` : `${intervention.baseline_metric}%`}
                </span>
                {" "}&rarr;{" "}
                <span style={{ fontWeight: 700, color: changeIsGood ? tokens.accent : tokens.red }}>
                  {intervention.metric_name === "pmpm" ? `$${intervention.current_metric}` : `${intervention.current_metric}%`}
                </span>
                {" "}
                <span style={{ fontWeight: 600, color: changeIsGood ? tokens.accent : tokens.red }}>
                  ({isReverse ? "" : "+"}{metricChange.toFixed(1)}{intervention.metric_name === "pmpm" ? "" : "pp"})
                </span>
              </div>
            </div>
            {intervention.timeline && (
              <TimelineChart timeline={intervention.timeline} metricName={intervention.metric_name} isReverse={isReverse} />
            )}
          </div>

          <div style={{ flex: 0, minWidth: 260, background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>Details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: tokens.textMuted }}>Start Date</span>
                <span style={{ fontWeight: 500, color: tokens.text }}>{intervention.start_date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: tokens.textMuted }}>End Date</span>
                <span style={{ fontWeight: 500, color: tokens.text }}>{intervention.end_date || "Ongoing"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: tokens.textMuted }}>Target</span>
                <span style={{ fontWeight: 500, color: tokens.text }}>{TARGET_LABELS[intervention.target || ""] || intervention.target || "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: tokens.textMuted }}>Est. Return</span>
                <span style={{ fontWeight: 500, color: tokens.textSecondary }}>{fmt(intervention.estimated_return)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: tokens.textMuted }}>Actual Return</span>
                <span style={{ fontWeight: 700, color: tokens.accent }}>{fmt(intervention.actual_return)}</span>
              </div>
              {intervention.estimated_return > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: tokens.textMuted }}>vs Estimate</span>
                  <span style={{ fontWeight: 600, color: intervention.actual_return >= intervention.estimated_return ? tokens.accent : tokens.amber }}>
                    {((intervention.actual_return / intervention.estimated_return) * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Financial Summary */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Financial Summary</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {/* Investment bar */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 4 }}>Investment</div>
            <div style={{ height: 32, background: tokens.redSoft, borderRadius: "6px 0 0 6px", display: "flex", alignItems: "center", paddingLeft: 12, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: tokens.red }}>{fmt(intervention.investment_amount)}</span>
            </div>
          </div>
          {/* Arrow */}
          <div style={{ padding: "0 12px", fontSize: 20, color: tokens.textMuted }}>&rarr;</div>
          {/* Return bar */}
          <div style={{ flex: intervention.actual_return / intervention.investment_amount }}>
            <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 4 }}>Return</div>
            <div style={{ height: 32, background: tokens.accentSoft, borderRadius: "0 6px 6px 0", display: "flex", alignItems: "center", paddingLeft: 12, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tokens.accentText }}>{fmt(intervention.actual_return)}</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 8 }}>
          For every <strong>$1</strong> invested, this intervention returned <strong style={{ color: tokens.accent }}>${(intervention.actual_return / intervention.investment_amount).toFixed(2)}</strong>.
        </div>
      </div>
    </div>
  );
}
