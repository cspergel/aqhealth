import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskMember {
  member_id: number;
  member_name: string;
  age: number;
  risk_score: number;
  risk_level: string;
  risk_factors: string[];
  pcp: string;
  raf_score: number;
  last_admission_date: string | null;
  recommended_intervention: string;
}

interface RiskTableProps {
  members: RiskMember[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskColor(score: number): { bg: string; text: string; bar: string } {
  if (score >= 70) return { bg: tokens.redSoft, text: tokens.red, bar: tokens.red };
  if (score >= 40) return { bg: tokens.amberSoft, text: tokens.amber, bar: tokens.amber };
  return { bg: tokens.accentSoft, text: tokens.accentText, bar: tokens.accent };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiskTable({ members }: RiskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ fontFamily: fonts.body }}>
        <thead>
          <tr
            className="text-[11px] uppercase tracking-wider"
            style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}
          >
            <th className="py-2 pr-3 font-medium">Member</th>
            <th className="py-2 pr-3 font-medium text-center">Age</th>
            <th className="py-2 pr-3 font-medium" style={{ minWidth: 200 }}>Risk Score</th>
            <th className="py-2 pr-3 font-medium">Risk Factors</th>
            <th className="py-2 pr-3 font-medium">PCP</th>
            <th className="py-2 pr-3 font-medium">Last Admission</th>
            <th className="py-2 font-medium">Recommended Action</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const rc = riskColor(m.risk_score);
            return (
              <tr
                key={m.member_id}
                className="text-[13px] hover:bg-stone-50 transition-colors"
                style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
              >
                {/* Member name */}
                <td className="py-3 pr-3">
                  <span className="font-medium" style={{ color: tokens.text }}>
                    {m.member_name}
                  </span>
                </td>

                {/* Age */}
                <td className="py-3 pr-3 text-center" style={{ color: tokens.textSecondary }}>
                  {m.age}
                </td>

                {/* Risk score bar */}
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: tokens.surfaceAlt }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${m.risk_score}%`,
                          background: `linear-gradient(90deg, ${rc.bar}cc, ${rc.bar})`,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: rc.bg,
                        color: rc.text,
                        fontFamily: fonts.code,
                        minWidth: 44,
                        textAlign: "center",
                      }}
                    >
                      {m.risk_score}%
                    </span>
                  </div>
                </td>

                {/* Risk factors */}
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {m.risk_factors.slice(0, 3).map((f, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}
                      >
                        {f}
                      </span>
                    ))}
                    {m.risk_factors.length > 3 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{ background: tokens.surfaceAlt, color: tokens.textMuted }}
                      >
                        +{m.risk_factors.length - 3} more
                      </span>
                    )}
                  </div>
                </td>

                {/* PCP */}
                <td className="py-3 pr-3 text-[12px]" style={{ color: tokens.textSecondary }}>
                  {m.pcp}
                </td>

                {/* Last admission */}
                <td className="py-3 pr-3 text-[12px]" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                  {m.last_admission_date || "--"}
                </td>

                {/* Recommended action */}
                <td className="py-3 text-[12px]" style={{ color: tokens.textSecondary, maxWidth: 260 }}>
                  {m.recommended_intervention}
                </td>
              </tr>
            );
          })}
          {members.length === 0 && (
            <tr>
              <td colSpan={7} className="py-12 text-center text-[13px]" style={{ color: tokens.textMuted }}>
                No risk predictions available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
