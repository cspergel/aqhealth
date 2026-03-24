import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { tokens, fonts } from "../../lib/tokens";

interface RafBucket {
  range: string;
  count: number;
}

interface RafDistributionProps {
  data: RafBucket[];
}

export function RafDistribution({ data }: RafDistributionProps) {
  return (
    <div
      className="rounded-[10px] border bg-white p-5"
      style={{ borderColor: tokens.border }}
    >
      <h3
        className="text-sm font-semibold mb-4"
        style={{ color: tokens.text, fontFamily: fonts.heading }}
      >
        RAF Score Distribution
      </h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <XAxis
              dataKey="range"
              tick={{ fontSize: 11, fill: tokens.textMuted }}
              axisLine={{ stroke: tokens.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: tokens.textMuted }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: tokens.surface,
                border: `1px solid ${tokens.border}`,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: fonts.body,
              }}
              labelStyle={{ color: tokens.text, fontWeight: 600 }}
              cursor={{ fill: tokens.surfaceAlt }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Members">
              {data.map((_, index) => (
                <Cell key={index} fill={tokens.accent} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
