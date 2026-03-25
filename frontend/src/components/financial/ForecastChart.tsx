import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Projection {
  month_offset: number;
  label: string;
  revenue: number;
  expense: number;
  margin: number;
  revenue_low: number;
  revenue_high: number;
  expense_low: number;
  expense_high: number;
}

interface ForecastData {
  months: number;
  projections: Projection[];
  summary: {
    total_projected_revenue: number;
    total_projected_expense: number;
    total_projected_margin: number;
    avg_monthly_margin: number;
  };
}

interface ForecastChartProps {
  data: ForecastData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForecastChart({ data }: ForecastChartProps) {
  const chartData = data.projections.map((p) => ({
    label: p.label,
    Revenue: p.revenue,
    Expense: p.expense,
    Margin: p.margin,
    revenue_low: p.revenue_low,
    revenue_high: p.revenue_high,
  }));

  return (
    <div
      className="rounded-xl border bg-white p-6"
      style={{ borderColor: tokens.border }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-[15px] font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Revenue Forecast
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
            {data.months}-month projection with confidence bands
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tokens.accent }} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tokens.red }} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>Expense</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tokens.blue }} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>Margin</span>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Projected Revenue", value: fmt(data.summary.total_projected_revenue), color: tokens.text },
          { label: "Projected Expenses", value: fmt(data.summary.total_projected_expense), color: tokens.text },
          { label: "Projected Margin", value: fmt(data.summary.total_projected_margin), color: tokens.accentText },
          { label: "Avg Monthly Margin", value: fmt(data.summary.avg_monthly_margin), color: tokens.accentText },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border px-3 py-2"
            style={{ borderColor: tokens.borderSoft, background: tokens.surfaceAlt }}
          >
            <div className="text-[10px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
              {kpi.label}
            </div>
            <div className="text-[15px] font-bold mt-0.5" style={{ fontFamily: fonts.code, color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="revBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tokens.accent} stopOpacity={0.08} />
                <stop offset="100%" stopColor={tokens.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSoft} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: tokens.textMuted }}
              tickLine={false}
              axisLine={{ stroke: tokens.border }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: tokens.textMuted }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              contentStyle={{
                background: tokens.surface,
                border: `1px solid ${tokens.border}`,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: fonts.body,
              }}
              formatter={(value: unknown) => [fmt(Number(value ?? 0)), undefined]}
            />
            {/* Confidence band */}
            <Area
              type="monotone"
              dataKey="revenue_high"
              stroke="none"
              fill="url(#revBand)"
              fillOpacity={1}
            />
            <Area
              type="monotone"
              dataKey="revenue_low"
              stroke="none"
              fill={tokens.surface}
              fillOpacity={1}
            />
            {/* Lines */}
            <Line
              type="monotone"
              dataKey="Revenue"
              stroke={tokens.accent}
              strokeWidth={2}
              dot={{ r: 3, fill: tokens.accent }}
            />
            <Line
              type="monotone"
              dataKey="Expense"
              stroke={tokens.red}
              strokeWidth={2}
              dot={{ r: 3, fill: tokens.red }}
            />
            <Line
              type="monotone"
              dataKey="Margin"
              stroke={tokens.blue}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, fill: tokens.blue }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
