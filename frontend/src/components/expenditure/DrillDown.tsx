import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { InsightCard } from "../ui/InsightCard";
import { DrgCellValue, extractDrgCodes, extractDrgCode } from "../ui/DrgTooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Kpi {
  label: string;
  value: string;
  benchmark?: string;
  status?: string; // "over" | "under" | undefined
}

interface ColumnDef {
  key: string;
  label: string;
  numeric?: boolean;
  format?: string; // "dollar" | "pct"
  benchmark?: number;
  invertBenchmark?: boolean; // true = higher is better
}

interface InsightItem {
  title: string;
  description: string;
  dollar_impact: number | null;
  category: "cost" | "revenue" | "quality";
}

interface Section {
  id: string;
  title: string;
  type: "table" | "insights";
  columns?: ColumnDef[];
  rows?: Record<string, unknown>[];
  items?: InsightItem[];
}

interface DrillDownData {
  category: string;
  label: string;
  total_spend: number;
  pmpm: number;
  claim_count: number;
  unique_members: number;
  kpis: Kpi[];
  sections: Section[];
}

interface DrillDownProps {
  category: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCellValue(val: unknown, format?: string): string {
  if (val == null) return "--";
  if (typeof val === "number") {
    if (format === "dollar") {
      if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
      return `$${val.toLocaleString("en-US")}`;
    }
    if (format === "pct") return `${val.toFixed(1)}%`;
    if (val >= 1000) return val.toLocaleString("en-US");
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(1);
  }
  return String(val);
}

function getCellColor(
  val: unknown,
  col: ColumnDef,
): string | undefined {
  if (typeof val !== "number" || col.benchmark == null) return undefined;
  const above = val > col.benchmark;
  // invertBenchmark: higher is better (e.g., capture rate)
  if (col.invertBenchmark) {
    return above ? tokens.accentText : tokens.red;
  }
  // default: lower is better (e.g., readmit rate, cost)
  return above ? tokens.red : tokens.accentText;
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <span
          className="text-[11px] transition-transform"
          style={{
            color: tokens.textMuted,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9654;
        </span>
        <h3
          className="text-[13px] font-semibold"
          style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}
        >
          {title}
        </h3>
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table renderer
// ---------------------------------------------------------------------------

function DataTable({ columns, rows }: { columns: ColumnDef[]; rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div
        className="text-[13px] py-6 text-center"
        style={{ color: tokens.textMuted }}
      >
        No data available
      </div>
    );
  }

  return (
    <div
      className="rounded-[10px] border overflow-hidden"
      style={{ borderColor: tokens.border }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 font-semibold whitespace-nowrap ${
                    col.numeric ? "text-right" : "text-left"
                  }`}
                  style={{
                    color: tokens.textSecondary,
                    fontFamily: fonts.heading,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  borderTop: `1px solid ${tokens.borderSoft}`,
                  background:
                    idx % 2 === 0 ? tokens.surface : tokens.surfaceAlt,
                }}
              >
                {columns.map((col) => {
                  const val = row[col.key];
                  const cellColor = getCellColor(val, col);
                  const isDrgCol = col.key.toLowerCase().includes("drg") || col.label.toLowerCase().includes("drg");
                  const strVal = formatCellValue(val, col.format);
                  const hasDrgContent = isDrgCol || (typeof val === "string" && (extractDrgCode(val) !== null || extractDrgCodes(val).length > 0));
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 whitespace-nowrap ${
                        col.numeric ? "text-right" : "text-left"
                      }`}
                      style={{
                        color: cellColor || tokens.text,
                        fontFamily: col.numeric ? fonts.code : fonts.body,
                        fontWeight: cellColor ? 600 : 400,
                      }}
                    >
                      {hasDrgContent && typeof val === "string" ? (
                        <DrgCellValue value={val} />
                      ) : (
                        strVal
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DrillDown component
// ---------------------------------------------------------------------------

export function DrillDown({ category, onBack }: DrillDownProps) {
  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/expenditure/${category}`)
      .then((res) => setData(res.data))
      .catch((err) => console.error("Drilldown fetch error:", err))
      .finally(() => setLoading(false));
  }, [category]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: tokens.textMuted }}>
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

      {/* KPI cards with benchmark coloring */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {data.kpis.map((kpi) => {
          let trendText: string | undefined;
          if (kpi.benchmark) {
            trendText = `Benchmark: ${kpi.benchmark}`;
          }

          // Determine card border accent
          let borderAccent: string | undefined;
          if (kpi.status === "over") borderAccent = tokens.red;
          else if (kpi.status === "under") borderAccent = tokens.amber;

          return (
            <div
              key={kpi.label}
              className="rounded-[10px] border bg-white p-4"
              style={{
                borderColor: borderAccent || tokens.border,
                borderLeftWidth: borderAccent ? 3 : 1,
              }}
            >
              <div
                className="text-xs font-medium mb-1"
                style={{ color: tokens.textMuted }}
              >
                {kpi.label}
              </div>
              <div
                className="text-xl font-semibold tracking-tight"
                style={{
                  fontFamily: fonts.code,
                  color: borderAccent || tokens.text,
                }}
              >
                {kpi.value}
              </div>
              {trendText && (
                <div
                  className="text-[11px] font-medium mt-1"
                  style={{
                    color:
                      kpi.status === "over"
                        ? tokens.red
                        : kpi.status === "under"
                          ? tokens.amber
                          : tokens.textMuted,
                  }}
                >
                  {trendText}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sections: tables and insight panels */}
      {(data.sections || []).map((section) => {
        if (section.type === "insights" && section.items) {
          return (
            <CollapsibleSection key={section.id} title={section.title}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {section.items.map((item, idx) => (
                  <InsightCard
                    key={idx}
                    title={item.title}
                    description={item.description}
                    impact={
                      item.dollar_impact
                        ? `$${item.dollar_impact.toLocaleString("en-US")} potential impact`
                        : undefined
                    }
                    category={item.category}
                  />
                ))}
              </div>
            </CollapsibleSection>
          );
        }

        if (section.type === "table" && section.columns) {
          return (
            <CollapsibleSection key={section.id} title={section.title}>
              <DataTable
                columns={section.columns}
                rows={section.rows || []}
              />
            </CollapsibleSection>
          );
        }

        return null;
      })}
    </div>
  );
}
