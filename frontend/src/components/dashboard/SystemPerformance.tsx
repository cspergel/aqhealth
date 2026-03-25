import { useNavigate } from "react-router-dom";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemPerformanceMetrics {
  overall_accuracy: number;
  overall_accuracy_trend: number;
  cost_accuracy: number;
  cost_accuracy_trend: number;
  suspect_confirmation_rate: number;
  suspect_confirmation_trend: number;
  risk_prediction_hits: number;
  risk_prediction_total: number;
  risk_prediction_trend: number;
}

// ---------------------------------------------------------------------------
// Default mock data (used when no prop provided)
// ---------------------------------------------------------------------------

const defaultMetrics: SystemPerformanceMetrics = {
  overall_accuracy: 91.3,
  overall_accuracy_trend: 2.0,
  cost_accuracy: 89.2,
  cost_accuracy_trend: 1.4,
  suspect_confirmation_rate: 72.4,
  suspect_confirmation_trend: 3.1,
  risk_prediction_hits: 8,
  risk_prediction_total: 11,
  risk_prediction_trend: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trendColor(trend: number): string {
  if (trend > 0.5) return tokens.accentText;
  if (trend < -0.5) return tokens.red;
  return tokens.amber;
}

function trendArrow(trend: number): string {
  if (trend > 0.5) return "\u2191";
  if (trend < -0.5) return "\u2193";
  return "\u2192";
}

function trendLabel(trend: number): string {
  if (Math.abs(trend) < 0.1) return "flat";
  const arrow = trendArrow(trend);
  const sign = trend > 0 ? "+" : "";
  return `${arrow} ${sign}${trend.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  metrics?: SystemPerformanceMetrics;
}

export function SystemPerformance({ metrics = defaultMetrics }: Props) {
  const navigate = useNavigate();

  const items: { label: string; value: string; trend: number }[] = [
    {
      label: "Prediction Accuracy",
      value: `${metrics.overall_accuracy}%`,
      trend: metrics.overall_accuracy_trend,
    },
    {
      label: "Cost Estimation",
      value: `${metrics.cost_accuracy}%`,
      trend: metrics.cost_accuracy_trend,
    },
    {
      label: "HCC Suspect Confirmation",
      value: `${metrics.suspect_confirmation_rate}%`,
      trend: metrics.suspect_confirmation_trend,
    },
    {
      label: "Risk Prediction Hits",
      value: `${metrics.risk_prediction_hits} of ${metrics.risk_prediction_total}`,
      trend: metrics.risk_prediction_trend,
    },
  ];

  return (
    <div
      className="rounded-[10px] border bg-white p-5"
      style={{ borderColor: tokens.border, cursor: "pointer" }}
      onClick={() => navigate("/intelligence?tab=system-learning")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate("/intelligence?tab=system-learning");
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: tokens.text, fontFamily: fonts.heading, margin: 0 }}
        >
          System Performance
        </h3>
        <span
          className="text-[11px] font-medium"
          style={{ color: tokens.accentText }}
        >
          View full report &rarr;
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg px-3 py-2.5"
            style={{ background: tokens.surfaceAlt }}
          >
            <div
              className="text-[11px] font-medium mb-1"
              style={{
                color: tokens.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {item.label}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[18px] font-bold"
                style={{ fontFamily: fonts.code, color: tokens.text }}
              >
                {item.value}
              </span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: trendColor(item.trend) }}
              >
                {trendLabel(item.trend)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div
        className="text-[11px] mt-3 text-center"
        style={{ color: tokens.textMuted }}
      >
        Predicted hospitalizations: {metrics.risk_prediction_hits} of {metrics.risk_prediction_total} occurred
      </div>
    </div>
  );
}
