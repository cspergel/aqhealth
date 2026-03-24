import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeasureSummary {
  measure_id: number;
  code: string;
  name: string;
  category: string | null;
  stars_weight: number;
  total_eligible: number;
  open_gaps: number;
  closed_gaps: number;
  closure_rate: number;
  star_level: number;
  target_rate: number | null;
  gaps_to_next_star: number | null;
}

interface GapTableProps {
  measures: MeasureSummary[];
  onSelectMeasure: (measureId: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function starLabel(level: number): string {
  return "\u2605".repeat(level) + "\u2606".repeat(5 - level);
}

function starColor(level: number): string {
  if (level >= 5) return tokens.accent;
  if (level >= 4) return tokens.accentText;
  if (level >= 3) return tokens.amber;
  return tokens.red;
}

function rateBarColor(rate: number, target: number | null): string {
  if (target && rate >= target) return tokens.accent;
  if (rate >= 70) return tokens.accentText;
  if (rate >= 50) return tokens.amber;
  return tokens.red;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GapTable({ measures, onSelectMeasure }: GapTableProps) {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <table className="w-full text-[13px]" style={{ fontFamily: fonts.body }}>
        <thead>
          <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
            <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Measure
            </th>
            <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Eligible
            </th>
            <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Open
            </th>
            <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Closed
            </th>
            <th className="px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading, minWidth: 180 }}>
              Closure Rate
            </th>
            <th className="text-center px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Weight
            </th>
            <th className="text-center px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
              Star Level
            </th>
          </tr>
        </thead>
        <tbody>
          {measures.map((m) => (
            <tr
              key={m.measure_id}
              onClick={() => onSelectMeasure(m.measure_id)}
              className="cursor-pointer transition-colors hover:bg-stone-50"
              style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
            >
              {/* Measure code + name */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-[12px] font-semibold"
                    style={{ color: tokens.text, fontFamily: fonts.code }}
                  >
                    {m.code}
                  </span>
                  {m.stars_weight >= 3 && (
                    <Tag variant="amber">Triple weighted</Tag>
                  )}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
                  {m.name}
                </div>
              </td>

              {/* Eligible */}
              <td
                className="text-right px-4 py-3 font-mono"
                style={{ color: tokens.text, fontFamily: fonts.code }}
              >
                {m.total_eligible.toLocaleString()}
              </td>

              {/* Open */}
              <td
                className="text-right px-4 py-3 font-mono"
                style={{ color: m.open_gaps > 0 ? tokens.red : tokens.textMuted, fontFamily: fonts.code }}
              >
                {m.open_gaps.toLocaleString()}
              </td>

              {/* Closed */}
              <td
                className="text-right px-4 py-3 font-mono"
                style={{ color: tokens.accentText, fontFamily: fonts.code }}
              >
                {m.closed_gaps.toLocaleString()}
              </td>

              {/* Closure Rate with progress bar */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{ background: tokens.surfaceAlt }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(m.closure_rate, 100)}%`,
                        background: rateBarColor(m.closure_rate, m.target_rate),
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-[12px] w-12 text-right"
                    style={{ color: tokens.text, fontFamily: fonts.code }}
                  >
                    {m.closure_rate.toFixed(1)}%
                  </span>
                </div>
                {/* AI prioritization note */}
                {m.gaps_to_next_star !== null && m.gaps_to_next_star > 0 && (
                  <div className="text-[11px] mt-1" style={{ color: tokens.blue }}>
                    Closing {m.gaps_to_next_star} gaps moves to {m.star_level + 1}-star
                  </div>
                )}
              </td>

              {/* Stars Weight */}
              <td className="text-center px-4 py-3">
                <span
                  className="font-mono text-[12px]"
                  style={{ color: m.stars_weight >= 3 ? tokens.amber : tokens.textMuted, fontFamily: fonts.code }}
                >
                  {m.stars_weight}x
                </span>
              </td>

              {/* Star Level */}
              <td className="text-center px-4 py-3">
                <span
                  className="text-[13px] tracking-tight"
                  style={{ color: starColor(m.star_level) }}
                >
                  {starLabel(m.star_level)}
                </span>
              </td>
            </tr>
          ))}

          {measures.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-12 text-[13px]" style={{ color: tokens.textMuted }}>
                No active measures found. Seed default measures or create a custom one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
