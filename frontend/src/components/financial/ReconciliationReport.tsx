import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FacilityAccuracy {
  facility: string;
  count: number;
  accuracy: number;
  bias: number;
}

interface CategoryAccuracy {
  category: string;
  count: number;
  accuracy: number;
}

interface BiggestMiss {
  event_id: number;
  facility: string;
  patient_class: string;
  error_pct: number;
  estimated: number | null;
  actual: number | null;
}

export interface ReconciliationData {
  overall_accuracy: number;
  total_reconciled: number;
  avg_bias_pct: number;
  trend: "improving" | "stable" | "declining";
  trend_pct: number;
  by_facility: FacilityAccuracy[];
  by_patient_class: CategoryAccuracy[];
  by_service_category: CategoryAccuracy[];
  biggest_misses: BiggestMiss[];
}

interface ReconciliationReportProps {
  data: ReconciliationData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function accuracyColor(acc: number): string {
  if (acc >= 92) return tokens.accentText;
  if (acc >= 85) return tokens.amber;
  return tokens.red;
}

function trendArrow(trend: string): string {
  if (trend === "improving") return "\u2191";
  if (trend === "declining") return "\u2193";
  return "\u2192";
}

function trendColor(trend: string): string {
  if (trend === "improving") return tokens.accentText;
  if (trend === "declining") return tokens.red;
  return tokens.textMuted;
}

function categoryLabel(key: string): string {
  const labels: Record<string, string> = {
    inpatient: "Inpatient",
    ed_observation: "ED / Observation",
    snf_postacute: "SNF / Post-Acute",
    pharmacy: "Pharmacy",
    professional: "Professional",
    home_health: "Home Health",
    dme: "DME",
    emergency: "Emergency",
    observation: "Observation",
    snf: "SNF",
    rehab: "Rehab",
  };
  return labels[key] || key;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconciliationReport({ data }: ReconciliationReportProps) {
  return (
    <div className="space-y-4">
      {/* Overall Accuracy Hero */}
      <div
        className="rounded-xl border bg-white p-6"
        style={{ borderColor: tokens.border }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3
              className="text-[15px] font-bold tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Reconciliation Accuracy
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
              Signal vs. record-tier cost estimation performance
            </p>
          </div>
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold"
            style={{
              background: data.trend === "improving" ? tokens.accentSoft : data.trend === "declining" ? tokens.redSoft : tokens.surfaceAlt,
              color: trendColor(data.trend),
            }}
          >
            <span>{trendArrow(data.trend)}</span>
            <span>
              {data.trend === "improving" ? "Improving" : data.trend === "declining" ? "Declining" : "Stable"}
              {data.trend_pct ? ` ${data.trend_pct}%/qtr` : ""}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Big accuracy number */}
          <div className="text-center">
            <div
              className="text-3xl font-bold"
              style={{ fontFamily: fonts.code, color: accuracyColor(data.overall_accuracy) }}
            >
              {data.overall_accuracy}%
            </div>
            <div className="text-[11px] mt-1 uppercase tracking-wider font-medium" style={{ color: tokens.textMuted }}>
              Overall Accuracy
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xl font-bold"
              style={{ fontFamily: fonts.code, color: tokens.text }}
            >
              {data.total_reconciled.toLocaleString()}
            </div>
            <div className="text-[11px] mt-1 uppercase tracking-wider font-medium" style={{ color: tokens.textMuted }}>
              Claims Reconciled
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xl font-bold"
              style={{
                fontFamily: fonts.code,
                color: Math.abs(data.avg_bias_pct) <= 3 ? tokens.accentText : tokens.amber,
              }}
            >
              {data.avg_bias_pct > 0 ? "+" : ""}{data.avg_bias_pct}%
            </div>
            <div className="text-[11px] mt-1 uppercase tracking-wider font-medium" style={{ color: tokens.textMuted }}>
              Avg Bias
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xl font-bold"
              style={{ fontFamily: fonts.code, color: trendColor(data.trend) }}
            >
              {trendArrow(data.trend)} {data.trend_pct}%
            </div>
            <div className="text-[11px] mt-1 uppercase tracking-wider font-medium" style={{ color: tokens.textMuted }}>
              Quarterly Trend
            </div>
          </div>
        </div>
      </div>

      {/* Accuracy by Facility + by Service Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Facility */}
        <div
          className="rounded-xl border bg-white overflow-hidden"
          style={{ borderColor: tokens.border }}
        >
          <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
            <h4
              className="text-[13px] font-semibold"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Accuracy by Facility
            </h4>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Facility", "Reconciled", "Accuracy", "Bias"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-semibold px-4 py-2 uppercase tracking-wider"
                    style={{ color: tokens.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_facility.map((f) => (
                <tr
                  key={f.facility}
                  className="border-b"
                  style={{ borderColor: tokens.borderSoft }}
                >
                  <td className="px-4 py-2 text-[12px] font-medium" style={{ color: tokens.text }}>
                    {f.facility}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                    {f.count}
                  </td>
                  <td className="px-4 py-2 text-[12px] font-semibold" style={{ fontFamily: fonts.code, color: accuracyColor(f.accuracy) }}>
                    {f.accuracy}%
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ fontFamily: fonts.code, color: Math.abs(f.bias) <= 3 ? tokens.textMuted : tokens.amber }}>
                    {f.bias > 0 ? "+" : ""}{f.bias}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* By Service Category */}
        <div
          className="rounded-xl border bg-white overflow-hidden"
          style={{ borderColor: tokens.border }}
        >
          <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
            <h4
              className="text-[13px] font-semibold"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Accuracy by Service Category
            </h4>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Category", "Reconciled", "Accuracy"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-semibold px-4 py-2 uppercase tracking-wider"
                    style={{ color: tokens.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_service_category.map((c) => (
                <tr
                  key={c.category}
                  className="border-b"
                  style={{ borderColor: tokens.borderSoft }}
                >
                  <td className="px-4 py-2 text-[12px] font-medium" style={{ color: tokens.text }}>
                    {categoryLabel(c.category)}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                    {c.count}
                  </td>
                  <td className="px-4 py-2 text-[12px] font-semibold" style={{ fontFamily: fonts.code, color: accuracyColor(c.accuracy) }}>
                    {c.accuracy}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Biggest Misses */}
      {data.biggest_misses.length > 0 && (
        <div
          className="rounded-xl border bg-white overflow-hidden"
          style={{ borderColor: tokens.border }}
        >
          <div className="px-5 py-3 border-b" style={{ borderColor: tokens.border }}>
            <h4
              className="text-[13px] font-semibold"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Biggest Misses — Where to Improve
            </h4>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Facility", "Type", "Estimated", "Actual", "Error"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-semibold px-4 py-2 uppercase tracking-wider"
                    style={{ color: tokens.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.biggest_misses.map((m) => (
                <tr
                  key={m.event_id}
                  className="border-b"
                  style={{ borderColor: tokens.borderSoft }}
                >
                  <td className="px-4 py-2 text-[12px] font-medium" style={{ color: tokens.text }}>
                    {m.facility}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ color: tokens.textSecondary }}>
                    {categoryLabel(m.patient_class)}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ fontFamily: fonts.code, color: tokens.text }}>
                    {m.estimated != null ? fmt(m.estimated) : "--"}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ fontFamily: fonts.code, color: tokens.text }}>
                    {m.actual != null ? fmt(m.actual) : "--"}
                  </td>
                  <td
                    className="px-4 py-2 text-[12px] font-bold"
                    style={{ fontFamily: fonts.code, color: tokens.red }}
                  >
                    {m.error_pct > 0 ? "+" : ""}{m.error_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
