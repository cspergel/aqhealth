import { tokens, fonts } from "../../lib/tokens";

interface CategoryCardProps {
  categoryKey: string;
  label: string;
  totalSpend: number;
  pmpm: number;
  pctOfTotal: number;
  trendVsPrior: number;
  onClick: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  inpatient: "🏥",
  ed_observation: "🚑",
  professional: "👨‍⚕️",
  snf_postacute: "🏨",
  pharmacy: "💊",
  home_health: "🏠",
  dme: "🦽",
  other: "📋",
};

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function CategoryCard({
  categoryKey,
  label,
  totalSpend,
  pmpm,
  pctOfTotal,
  trendVsPrior,
  onClick,
}: CategoryCardProps) {
  const trendUp = trendVsPrior > 0;
  const trendColor = trendUp ? tokens.red : tokens.accentText;
  const trendArrow = trendUp ? "\u2191" : trendVsPrior < 0 ? "\u2193" : "\u2192";
  const icon = CATEGORY_ICONS[categoryKey] || CATEGORY_ICONS.other;

  return (
    <button
      onClick={onClick}
      className="rounded-[10px] border bg-white p-4 text-left transition-shadow hover:shadow-md w-full"
      style={{ borderColor: tokens.border }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <span
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, fontFamily: fonts.heading }}
        >
          {label}
        </span>
      </div>

      {/* Spend */}
      <div
        className="text-xl font-semibold tracking-tight"
        style={{ fontFamily: fonts.code, color: tokens.text }}
      >
        {formatDollars(totalSpend)}
      </div>

      {/* PMPM and trend */}
      <div className="flex items-center justify-between mt-2">
        <span
          className="text-[12px]"
          style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
        >
          ${pmpm.toFixed(2)} PMPM
        </span>
        <span
          className="text-[12px] font-semibold"
          style={{ color: trendColor }}
        >
          {trendArrow} {Math.abs(trendVsPrior).toFixed(1)}%
        </span>
      </div>

      {/* % of total bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px]" style={{ color: tokens.textMuted }}>
            % of total
          </span>
          <span
            className="text-[11px] font-medium"
            style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
          >
            {pctOfTotal.toFixed(1)}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: tokens.surfaceAlt }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(pctOfTotal, 100)}%`,
              background: tokens.accent,
            }}
          />
        </div>
      </div>
    </button>
  );
}
