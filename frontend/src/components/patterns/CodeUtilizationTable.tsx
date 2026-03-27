import { tokens } from "../../lib/tokens";

export interface CodeUtilization {
  code: string;
  description: string;
  hcc_relevant: boolean;
  top_group_rate: number;
  bottom_group_rate: number;
  gap: number;
  potential_captures: number;
}

export function CodeUtilizationTable({ codes }: { codes: CodeUtilization[] }) {
  const gapColor = (gap: number) => {
    if (gap >= 15) return { bg: tokens.redSoft, text: tokens.red };
    if (gap >= 8) return { bg: tokens.amberSoft, text: tokens.amber };
    return { bg: tokens.surfaceAlt, text: tokens.textSecondary };
  };

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ color: tokens.text }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                ICD-10 Code
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                Description
              </th>
              <th className="text-center px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                HCC
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                Top Group Rate
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                Bottom Group Rate
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                Gap
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[12px]" style={{ color: tokens.textSecondary }}>
                Potential Captures
              </th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => {
              const gc = gapColor(row.gap);
              return (
                <tr
                  key={row.code}
                  className="border-t"
                  style={{ borderColor: tokens.borderSoft }}
                >
                  <td className="px-4 py-3 font-mono text-[12px] font-medium">{row.code}</td>
                  <td className="px-4 py-3">{row.description}</td>
                  <td className="px-4 py-3 text-center">
                    {row.hcc_relevant && (
                      <span
                        className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: tokens.blueSoft, color: tokens.blue }}
                      >
                        HCC
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: tokens.accentText }}>
                    {row.top_group_rate}%
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: tokens.textSecondary }}>
                    {row.bottom_group_rate}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="inline-block text-[12px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: gc.bg, color: gc.text }}
                    >
                      +{row.gap}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{row.potential_captures}</td>
                </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-[13px]" style={{ color: tokens.textMuted }}>
                  No code utilization data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
