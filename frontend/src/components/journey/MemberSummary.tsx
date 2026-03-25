import { tokens, fonts } from "../../lib/tokens";

interface MemberSummaryData {
  id: number;
  member_id: string;
  name: string;
  dob: string;
  age: number;
  gender: string;
  health_plan: string | null;
  pcp: string | null;
  current_raf: number;
  projected_raf: number;
  risk_tier: string | null;
  total_spend_12m: number;
  open_suspects: number;
  open_gaps: number;
  conditions: string[];
}

interface MemberSummaryProps {
  member: MemberSummaryData;
}

const tierColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: tokens.accentSoft, text: tokens.accentText, border: tokens.accent },
  rising: { bg: tokens.blueSoft, text: tokens.blue, border: tokens.blue },
  high: { bg: tokens.amberSoft, text: tokens.amber, border: tokens.amber },
  complex: { bg: tokens.redSoft, text: tokens.red, border: tokens.red },
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function MemberSummary({ member }: MemberSummaryProps) {
  const tier = tierColors[member.risk_tier || "low"] || tierColors.low;
  const rafDelta = member.projected_raf - member.current_raf;
  const rafDirection = rafDelta > 0 ? "up" : rafDelta < 0 ? "down" : "flat";

  return (
    <div
      className="rounded-[10px] border bg-white p-6"
      style={{ borderColor: tokens.border }}
    >
      {/* Top row: Name + demographics + tier badge */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            {member.name}
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
              {member.member_id}
            </span>
            <span className="w-px h-3" style={{ background: tokens.border }} />
            <span className="text-xs" style={{ color: tokens.textSecondary }}>
              {member.age}yo {member.gender === "F" ? "Female" : "Male"}
            </span>
            <span className="w-px h-3" style={{ background: tokens.border }} />
            <span className="text-xs" style={{ color: tokens.textSecondary }}>
              DOB: {member.dob}
            </span>
            {member.health_plan && (
              <>
                <span className="w-px h-3" style={{ background: tokens.border }} />
                <span className="text-xs" style={{ color: tokens.textSecondary }}>
                  {member.health_plan}
                </span>
              </>
            )}
          </div>
          {member.pcp && (
            <div className="text-xs mt-1" style={{ color: tokens.textSecondary }}>
              PCP: {member.pcp}
            </div>
          )}
        </div>
        <div
          className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border"
          style={{
            background: tier.bg,
            color: tier.text,
            borderColor: tier.border,
          }}
        >
          {member.risk_tier || "unknown"}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-6 gap-4 mb-5">
        {/* Current RAF */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Current RAF
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-lg font-semibold"
              style={{ fontFamily: fonts.code, color: tokens.text }}
            >
              {member.current_raf.toFixed(3)}
            </span>
            <span
              className="text-xs font-medium"
              style={{
                color: rafDirection === "up" ? tokens.accentText : rafDirection === "down" ? tokens.red : tokens.textMuted,
              }}
            >
              {rafDirection === "up" ? "\u2191" : rafDirection === "down" ? "\u2193" : "\u2192"}
              {" "}{Math.abs(rafDelta).toFixed(3)}
            </span>
          </div>
        </div>

        {/* Projected RAF */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Projected RAF
          </div>
          <span
            className="text-lg font-semibold"
            style={{ fontFamily: fonts.code, color: tokens.text }}
          >
            {member.projected_raf.toFixed(3)}
          </span>
        </div>

        {/* Total 12mo Spend */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Total 12mo Spend
          </div>
          <span
            className="text-lg font-semibold"
            style={{ fontFamily: fonts.code, color: tokens.text }}
          >
            {formatCurrency(member.total_spend_12m)}
          </span>
        </div>

        {/* Open Suspects */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Open Suspects
          </div>
          <span
            className="text-lg font-semibold"
            style={{
              fontFamily: fonts.code,
              color: member.open_suspects > 0 ? tokens.amber : tokens.accentText,
            }}
          >
            {member.open_suspects}
          </span>
        </div>

        {/* Open Gaps */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Open Gaps
          </div>
          <span
            className="text-lg font-semibold"
            style={{
              fontFamily: fonts.code,
              color: member.open_gaps > 0 ? tokens.amber : tokens.accentText,
            }}
          >
            {member.open_gaps}
          </span>
        </div>

        {/* Active Conditions count */}
        <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
          <div className="text-[11px] font-medium mb-1" style={{ color: tokens.textMuted }}>
            Active Conditions
          </div>
          <span
            className="text-lg font-semibold"
            style={{ fontFamily: fonts.code, color: tokens.text }}
          >
            {member.conditions.length}
          </span>
        </div>
      </div>

      {/* Conditions list */}
      <div>
        <div className="text-[11px] font-medium mb-2" style={{ color: tokens.textMuted }}>
          Key Active Conditions
        </div>
        <div className="flex flex-wrap gap-2">
          {member.conditions.map((c, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border"
              style={{
                background: tokens.surfaceAlt,
                color: tokens.textSecondary,
                borderColor: tokens.borderSoft,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
