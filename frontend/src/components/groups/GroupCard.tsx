import { tokens, fonts } from "../../lib/tokens";

interface GroupCardProps {
  id: number;
  name: string;
  city: string;
  state: string;
  provider_count: number;
  total_panel_size: number;
  avg_capture_rate: number | null;
  group_pmpm: number | null;
  gap_closure_rate: number | null;
  tier: "green" | "amber" | "red";
  selected?: boolean;
  compareMode?: boolean;
  onClick: () => void;
  onCompareSelect?: () => void;
}

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: tokens.accentSoft, border: "#bbf7d0", text: tokens.accentText },
  amber: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
  red: { bg: tokens.redSoft, border: "#fecaca", text: "#991b1b" },
};

export function GroupCard({
  name, city, state, provider_count, total_panel_size,
  avg_capture_rate, group_pmpm, gap_closure_rate, tier,
  selected, compareMode, onClick, onCompareSelect,
}: GroupCardProps) {
  const tc = tierColors[tier] || tierColors.green;

  return (
    <div
      className="rounded-[10px] border p-5 cursor-pointer transition-all hover:shadow-sm"
      style={{
        borderColor: selected ? tokens.accent : tokens.border,
        background: tokens.surface,
        boxShadow: selected ? `0 0 0 2px ${tokens.accent}33` : undefined,
      }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: tc.text }} />
            <h3
              className="text-[14px] font-semibold tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              {name}
            </h3>
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
            {city}, {state} &middot; {provider_count ?? 0} providers &middot; {(total_panel_size ?? 0).toLocaleString()} lives
          </div>
        </div>
        <div
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}
        >
          {tier.toUpperCase()}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Capture Rate", value: avg_capture_rate != null ? `${avg_capture_rate.toFixed(1)}%` : "--" },
          { label: "PMPM", value: group_pmpm != null ? `$${group_pmpm.toLocaleString()}` : "--" },
          { label: "Gap Closure", value: gap_closure_rate != null ? `${gap_closure_rate.toFixed(1)}%` : "--" },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide font-medium" style={{ color: tokens.textMuted }}>
              {label}
            </div>
            <div
              className="text-[15px] font-semibold"
              style={{ fontFamily: fonts.code, color: tokens.text }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Compare button */}
      {compareMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onCompareSelect?.(); }}
          className="mt-3 w-full text-[12px] py-1.5 rounded-lg border font-medium"
          style={{
            borderColor: selected ? tokens.accent : tokens.border,
            color: selected ? tokens.accent : tokens.textSecondary,
            background: selected ? tokens.accentSoft : "transparent",
          }}
        >
          {selected ? "Selected" : "Select to Compare"}
        </button>
      )}
    </div>
  );
}
