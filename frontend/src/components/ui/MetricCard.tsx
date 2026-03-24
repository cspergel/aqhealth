import { fonts, tokens } from "../../lib/tokens";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  trendDirection?: "up" | "down" | "flat";
}

export function MetricCard({ label, value, trend, trendDirection }: MetricCardProps) {
  const trendColor =
    trendDirection === "up" ? tokens.accentText :
    trendDirection === "down" ? tokens.red : tokens.textMuted;

  return (
    <div className="rounded-[10px] border bg-white p-4" style={{ borderColor: tokens.border }}>
      <div className="text-xs font-medium mb-1" style={{ color: tokens.textMuted }}>{label}</div>
      <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: fonts.code, color: tokens.text }}>
        {value}
      </div>
      {trend && (
        <div className="text-xs font-medium mt-1" style={{ color: trendColor }}>
          {trend}
        </div>
      )}
    </div>
  );
}
