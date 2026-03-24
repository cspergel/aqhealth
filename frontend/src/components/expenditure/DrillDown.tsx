import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { MetricCard } from "../ui/MetricCard";
import { InsightCard } from "../ui/InsightCard";

interface Kpi {
  label: string;
  value: string;
}

interface TableDef {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

interface DrillDownData {
  category: string;
  label: string;
  total_spend: number;
  pmpm: number;
  claim_count: number;
  unique_members: number;
  kpis: Kpi[];
  tables: TableDef[];
}

interface InsightData {
  id: number;
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
  category: string;
}

interface DrillDownProps {
  category: string;
  onBack: () => void;
}

function formatCell(val: unknown): string {
  if (val == null) return "--";
  if (typeof val === "number") {
    if (val >= 1000) return val.toLocaleString("en-US");
    return String(val);
  }
  return String(val);
}

export function DrillDown({ category, onBack }: DrillDownProps) {
  const [data, setData] = useState<DrillDownData | null>(null);
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/expenditure/${category}`),
      api.get(`/api/expenditure/${category}/insights`),
    ])
      .then(([drillRes, insightRes]) => {
        setData(drillRes.data);
        setInsights(insightRes.data);
      })
      .catch((err) => console.error("Drilldown fetch error:", err))
      .finally(() => setLoading(false));
  }, [category]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="text-sm"
          style={{ color: tokens.textMuted }}
        >
          Loading {category} details...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: tokens.red }}>
        Failed to load data.
      </div>
    );
  }

  return (
    <div>
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[13px] px-3 py-1.5 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          <span style={{ fontSize: 14 }}>&larr;</span> Back to Overview
        </button>
        <h2
          className="text-lg font-semibold"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          {data.label}
        </h2>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {data.kpis.map((kpi) => (
          <MetricCard key={kpi.label} label={kpi.label} value={kpi.value} />
        ))}
      </div>

      {/* Insights (if any) */}
      {insights.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-[13px] font-semibold mb-3"
            style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}
          >
            AI Recommendations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                title={insight.title}
                description={insight.description}
                impact={
                  insight.dollar_impact
                    ? `$${insight.dollar_impact.toLocaleString("en-US")} potential impact`
                    : undefined
                }
                category="cost"
              />
            ))}
          </div>
        </div>
      )}

      {/* Data tables */}
      {data.tables.map((table) => (
        <div key={table.title} className="mb-6">
          <h3
            className="text-[13px] font-semibold mb-3"
            style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}
          >
            {table.title}
          </h3>
          <div
            className="rounded-[10px] border overflow-hidden"
            style={{ borderColor: tokens.border }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: tokens.surfaceAlt }}>
                    {table.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-2.5 font-semibold"
                        style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={table.columns.length}
                        className="px-4 py-6 text-center"
                        style={{ color: tokens.textMuted }}
                      >
                        No data available
                      </td>
                    </tr>
                  ) : (
                    table.rows.map((row, idx) => {
                      const values = Object.values(row);
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderTop: `1px solid ${tokens.borderSoft}`,
                            background: idx % 2 === 0 ? tokens.surface : tokens.surfaceAlt,
                          }}
                        >
                          {values.map((val, colIdx) => (
                            <td
                              key={colIdx}
                              className="px-4 py-2.5"
                              style={{
                                color: tokens.text,
                                fontFamily:
                                  typeof val === "number" ? fonts.code : fonts.body,
                              }}
                            >
                              {typeof val === "number" && (
                                String(val).includes(".") || val >= 100
                              )
                                ? val.toLocaleString("en-US", {
                                    maximumFractionDigits: 2,
                                  })
                                : formatCell(val)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
