import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderRow {
  id: number;
  npi: string;
  name: string;
  specialty: string | null;
  panel_size: number;
  capture_rate: number | null;
  recapture_rate: number | null;
  avg_raf: number | null;
  panel_pmpm: number | null;
  gap_closure_rate: number | null;
  tier: "green" | "amber" | "red" | "gray";
}

interface ProviderTableProps {
  providers: ProviderRow[];
  sortBy: string;
  order: "asc" | "desc";
  onSort: (col: string) => void;
  onRowClick: (id: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tierDot: Record<string, string> = {
  green: tokens.accent,
  amber: tokens.amber,
  red: tokens.red,
  gray: tokens.textMuted,
};

function fmt(val: number | null, suffix = "%"): string {
  if (val == null) return "--";
  return `${val.toFixed(1)}${suffix}`;
}

function fmtDollars(val: number | null): string {
  if (val == null) return "--";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Columns config
// ---------------------------------------------------------------------------

interface Column {
  key: string;
  label: string;
  align: "left" | "right";
  render: (p: ProviderRow) => React.ReactNode;
  sortable: boolean;
}

const columns: Column[] = [
  {
    key: "tier",
    label: "",
    align: "left",
    sortable: false,
    render: (p) => (
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: tierDot[p.tier] || tierDot.gray }}
        title={p.tier}
      />
    ),
  },
  { key: "name", label: "Provider", align: "left", sortable: true, render: (p) => p.name },
  { key: "specialty", label: "Specialty", align: "left", sortable: true, render: (p) => p.specialty || "--" },
  {
    key: "panel_size",
    label: "Panel",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{p.panel_size.toLocaleString()}</span>,
  },
  {
    key: "capture_rate",
    label: "Capture",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{fmt(p.capture_rate)}</span>,
  },
  {
    key: "recapture_rate",
    label: "Recapture",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{fmt(p.recapture_rate)}</span>,
  },
  {
    key: "avg_raf",
    label: "Avg RAF",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{p.avg_raf != null ? p.avg_raf.toFixed(3) : "--"}</span>,
  },
  {
    key: "panel_pmpm",
    label: "PMPM",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{fmtDollars(p.panel_pmpm)}</span>,
  },
  {
    key: "gap_closure_rate",
    label: "Gap Closure",
    align: "right",
    sortable: true,
    render: (p) => <span style={{ fontFamily: fonts.code }}>{fmt(p.gap_closure_rate)}</span>,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderTable({ providers, sortBy, order, onSort, onRowClick }: ProviderTableProps) {
  return (
    <div className="overflow-x-auto rounded-[10px] border" style={{ borderColor: tokens.border, background: tokens.surface }}>
      <table className="w-full text-[13px]" style={{ color: tokens.text }}>
        <thead>
          <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                  col.align === "right" ? "text-right" : "text-left"
                } ${col.sortable ? "cursor-pointer select-none" : ""}`}
                style={{ color: tokens.textSecondary, fontSize: "11px", letterSpacing: "0.04em", textTransform: "uppercase" }}
                onClick={() => col.sortable && onSort(col.key)}
              >
                {col.label}
                {col.sortable && sortBy === col.key && (
                  <span className="ml-1">{order === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer transition-colors"
              style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
              onClick={() => onRowClick(p.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = tokens.surfaceAlt)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.render(p)}
                </td>
              ))}
            </tr>
          ))}
          {providers.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center" style={{ color: tokens.textMuted }}>
                No providers found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
