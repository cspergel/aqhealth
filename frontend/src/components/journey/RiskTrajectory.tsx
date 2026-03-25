import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  Legend,
} from "recharts";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrajectoryPoint {
  date: string;
  raf: number;
  cost: number;
  disease_raf: number;
  demographic_raf: number;
  hcc_count: number;
  event?: string;
}

interface RiskTrajectoryProps {
  data: TrajectoryPoint[];
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipEntry {
  dataKey: string;
  value: number;
  color: string;
  payload?: TrajectoryPoint;
}

function TrajectoryTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as TrajectoryPoint | undefined;

  return (
    <div
      className="rounded-lg border p-3 shadow-sm"
      style={{
        background: "white",
        borderColor: tokens.border,
        fontFamily: fonts.body,
      }}
    >
      <div className="text-xs font-semibold mb-2" style={{ color: tokens.text }}>
        {label}
      </div>
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="text-[11px]" style={{ color: entry.color }}>
              {entry.dataKey === "raf" ? "RAF Score" : entry.dataKey === "cost" ? "Monthly Cost" : entry.dataKey}
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ fontFamily: fonts.code, color: tokens.text }}
            >
              {entry.dataKey === "cost"
                ? `$${entry.value.toLocaleString()}`
                : entry.value.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
      {point?.event && (
        <div
          className="mt-2 pt-2 border-t text-[11px] font-medium"
          style={{ borderColor: tokens.borderSoft, color: tokens.accentText }}
        >
          {point.event}
        </div>
      )}
      {point && (
        <div
          className="mt-1 text-[10px]"
          style={{ color: tokens.textMuted }}
        >
          HCC count: {point.hcc_count}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiskTrajectory({ data }: RiskTrajectoryProps) {
  // Find intervention points (events)
  const interventions = data.filter((d) => d.event);

  return (
    <div
      className="rounded-[10px] border bg-white p-5"
      style={{ borderColor: tokens.border }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Risk & Cost Trajectory
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: tokens.textMuted }}>
            Monthly RAF score and cost with intervention markers
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: tokens.accent }} />
            <span className="text-[10px]" style={{ color: tokens.textMuted }}>RAF Score</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: tokens.blue + "40" }} />
            <span className="text-[10px]" style={{ color: tokens.textMuted }}>Monthly Cost</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full border-2"
              style={{ borderColor: tokens.accent, background: tokens.accentSoft }}
            />
            <span className="text-[10px]" style={{ color: tokens.textMuted }}>Intervention</span>
          </div>
        </div>
      </div>

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={tokens.borderSoft}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: tokens.textMuted, fontFamily: fonts.code }}
              tickLine={false}
              axisLine={{ stroke: tokens.border }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="raf"
              orientation="left"
              tick={{ fontSize: 10, fill: tokens.textMuted, fontFamily: fonts.code }}
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 0.1", "dataMax + 0.1"]}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{
                value: "RAF",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 10, fill: tokens.textMuted },
              }}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tick={{ fontSize: 10, fill: tokens.textMuted, fontFamily: fonts.code }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`
              }
              label={{
                value: "Cost",
                angle: 90,
                position: "insideRight",
                offset: 10,
                style: { fontSize: 10, fill: tokens.textMuted },
              }}
            />
            <Tooltip
              content={
                <TrajectoryTooltip />
              }
            />
            <Legend content={() => null} />

            {/* Cost bars */}
            <Bar
              yAxisId="cost"
              dataKey="cost"
              fill={tokens.blue + "30"}
              stroke={tokens.blue + "60"}
              strokeWidth={0.5}
              radius={[2, 2, 0, 0]}
              barSize={14}
            />

            {/* RAF line */}
            <Line
              yAxisId="raf"
              type="stepAfter"
              dataKey="raf"
              stroke={tokens.accent}
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 5,
                stroke: tokens.accent,
                strokeWidth: 2,
                fill: "white",
              }}
            />

            {/* Intervention markers */}
            {interventions.map((pt, i) => (
              <ReferenceDot
                key={i}
                yAxisId="raf"
                x={pt.date}
                y={pt.raf}
                r={7}
                fill={tokens.accentSoft}
                stroke={tokens.accent}
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Intervention legend below chart */}
      {interventions.length > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-3" style={{ borderColor: tokens.borderSoft }}>
          {interventions.map((pt, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px]"
              style={{
                background: tokens.accentSoft,
                borderColor: tokens.accent + "30",
                color: tokens.accentText,
              }}
            >
              <span style={{ fontFamily: fonts.code }}>{pt.date}</span>
              <span className="font-medium">{pt.event}</span>
              <span style={{ fontFamily: fonts.code }}>RAF {pt.raf.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
