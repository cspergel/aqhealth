import { tokens, fonts } from "../../lib/tokens";

interface ProviderRow {
  id: number;
  name: string;
  specialty: string | null;
  panel_size: number | null;
  capture_rate: number;
}

interface ProviderLeaderboardProps {
  top: ProviderRow[];
  bottom: ProviderRow[];
}

function MiniTable({ rows, label, accentColor }: { rows: ProviderRow[]; label: string; accentColor: string }) {
  if (rows.length === 0) return null;

  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: accentColor }}
      >
        {label}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr style={{ color: tokens.textMuted }}>
            <th className="text-left font-medium pb-1.5 text-[11px]">Provider</th>
            <th className="text-right font-medium pb-1.5 text-[11px]">Panel</th>
            <th className="text-right font-medium pb-1.5 text-[11px]">Capture %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t" style={{ borderColor: tokens.borderSoft }}>
              <td className="py-1.5" style={{ color: tokens.text }}>
                <div className="font-medium">{row.name}</div>
                {row.specialty && (
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>
                    {row.specialty}
                  </div>
                )}
              </td>
              <td className="text-right py-1.5" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                {row.panel_size?.toLocaleString() ?? "-"}
              </td>
              <td className="text-right py-1.5" style={{ color: accentColor, fontFamily: fonts.code, fontSize: 12, fontWeight: 600 }}>
                {row.capture_rate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProviderLeaderboard({ top, bottom }: ProviderLeaderboardProps) {
  return (
    <div
      className="rounded-[10px] border bg-white p-5"
      style={{ borderColor: tokens.border }}
    >
      <h3
        className="text-sm font-semibold mb-4"
        style={{ color: tokens.text, fontFamily: fonts.heading }}
      >
        Provider Leaderboard
      </h3>
      <div className="flex flex-col gap-5">
        <MiniTable rows={top} label="Top Performers" accentColor={tokens.accentText} />
        <MiniTable rows={bottom} label="Needs Improvement" accentColor={tokens.red} />
      </div>
    </div>
  );
}
