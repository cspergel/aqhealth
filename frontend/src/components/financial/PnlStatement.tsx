import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PnlData {
  period: string;
  revenue: {
    capitation: number;
    raf_adjustment: number;
    quality_bonus: number;
    per_capture_fees: number;
    total: number;
  };
  expenses: {
    inpatient: number;
    pharmacy: number;
    professional: number;
    ed_observation: number;
    snf_postacute: number;
    home_health: number;
    dme: number;
    administrative: number;
    care_management: number;
    total: number;
  };
  surplus: number;
  mlr: number;
  member_count: number;
  per_member_margin: number;
  comparison: {
    budget: { revenue: number; expenses: number; surplus: number; mlr: number };
    prior_year: { revenue: number; expenses: number; surplus: number; mlr: number };
    prior_quarter: { revenue: number; expenses: number; surplus: number; mlr: number };
  };
}

interface PnlStatementProps {
  data: PnlData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function varianceColor(actual: number, comparator: number, inverted = false): string {
  const diff = actual - comparator;
  if (Math.abs(diff) < 0.001) return tokens.textMuted;
  const positive = inverted ? diff < 0 : diff > 0;
  return positive ? tokens.accentText : tokens.red;
}

// ---------------------------------------------------------------------------
// Line item row
// ---------------------------------------------------------------------------

function PnlRow({
  label,
  value,
  budgetValue,
  isTotal = false,
  isHeader = false,
  indent = false,
}: {
  label: string;
  value: number;
  budgetValue?: number;
  isTotal?: boolean;
  isHeader?: boolean;
  indent?: boolean;
}) {
  const variance = budgetValue != null ? value - budgetValue : undefined;

  return (
    <tr
      className={isTotal ? "border-t-2" : ""}
      style={isTotal ? { borderColor: tokens.border } : undefined}
    >
      <td
        className={`py-1.5 pr-4 text-[13px] ${isTotal || isHeader ? "font-semibold" : "font-normal"}`}
        style={{
          color: isHeader ? tokens.text : tokens.textSecondary,
          paddingLeft: indent ? 24 : 0,
          fontFamily: isHeader ? fonts.heading : fonts.body,
        }}
      >
        {label}
      </td>
      <td
        className={`py-1.5 text-right text-[13px] ${isTotal ? "font-bold" : "font-medium"}`}
        style={{
          fontFamily: fonts.code,
          color: isTotal
            ? value >= 0 ? tokens.accentText : tokens.red
            : tokens.text,
        }}
      >
        {fmt(value)}
      </td>
      <td
        className="py-1.5 text-right text-[13px]"
        style={{ fontFamily: fonts.code, color: tokens.textMuted }}
      >
        {budgetValue != null ? fmt(budgetValue) : ""}
      </td>
      <td
        className="py-1.5 text-right text-[13px] font-medium"
        style={{
          fontFamily: fonts.code,
          color: variance != null ? varianceColor(value, budgetValue!) : tokens.textMuted,
        }}
      >
        {variance != null ? (
          <>
            {variance >= 0 ? "+" : ""}
            {fmt(variance)}
          </>
        ) : ""}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PnlStatement({ data }: PnlStatementProps) {
  const budget = data.comparison.budget;

  return (
    <div
      className="rounded-xl border bg-white p-6"
      style={{ borderColor: tokens.border }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-[15px] font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Profit & Loss Statement
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
            {data.period.toUpperCase()} &mdash; {data.member_count.toLocaleString()} members
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-[13px] font-bold"
          style={{
            fontFamily: fonts.code,
            background: data.surplus >= 0 ? tokens.accentSoft : tokens.redSoft,
            color: data.surplus >= 0 ? tokens.accentText : tokens.red,
          }}
        >
          {data.surplus >= 0 ? "Surplus" : "Deficit"}: {fmt(Math.abs(data.surplus))}
        </div>
      </div>

      {/* P&L Table */}
      <table className="w-full">
        <thead>
          <tr className="border-b" style={{ borderColor: tokens.border }}>
            <th className="text-left text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Line Item
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Actual
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Budget
            </th>
            <th className="text-right text-[11px] font-semibold pb-2 uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              Variance
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Revenue Section */}
          <PnlRow label="Revenue" value={data.revenue.total} budgetValue={budget.revenue} isHeader />
          <PnlRow label="Capitation" value={data.revenue.capitation} indent />
          <PnlRow label="RAF Adjustment" value={data.revenue.raf_adjustment} indent />
          <PnlRow label="Quality Bonus" value={data.revenue.quality_bonus} indent />
          <PnlRow label="Per-Capture Fees" value={data.revenue.per_capture_fees} indent />

          {/* Spacer */}
          <tr><td colSpan={4} className="py-2" /></tr>

          {/* Expenses Section */}
          <PnlRow label="Expenses" value={data.expenses.total} budgetValue={budget.expenses} isHeader />
          <PnlRow label="Inpatient" value={data.expenses.inpatient} indent />
          <PnlRow label="Pharmacy" value={data.expenses.pharmacy} indent />
          <PnlRow label="Professional" value={data.expenses.professional} indent />
          <PnlRow label="ED / Observation" value={data.expenses.ed_observation} indent />
          <PnlRow label="SNF / Post-Acute" value={data.expenses.snf_postacute} indent />
          <PnlRow label="Home Health" value={data.expenses.home_health} indent />
          <PnlRow label="DME" value={data.expenses.dme} indent />
          <PnlRow label="Administrative" value={data.expenses.administrative} indent />
          <PnlRow label="Care Management" value={data.expenses.care_management} indent />

          {/* Spacer */}
          <tr><td colSpan={4} className="py-1" /></tr>

          {/* Bottom Line */}
          <PnlRow label="Net Surplus / (Deficit)" value={data.surplus} budgetValue={budget.surplus} isTotal />
        </tbody>
      </table>

      {/* Bottom KPIs */}
      <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t" style={{ borderColor: tokens.border }}>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            Medical Loss Ratio
          </div>
          <div className="text-lg font-bold mt-0.5" style={{ fontFamily: fonts.code, color: tokens.text }}>
            {pct(data.mlr)}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: varianceColor(budget.mlr, data.mlr) }}>
            Budget: {pct(budget.mlr)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            Per-Member Margin
          </div>
          <div
            className="text-lg font-bold mt-0.5"
            style={{
              fontFamily: fonts.code,
              color: data.per_member_margin >= 0 ? tokens.accentText : tokens.red,
            }}
          >
            ${data.per_member_margin.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
            vs Prior Year
          </div>
          <div
            className="text-lg font-bold mt-0.5"
            style={{
              fontFamily: fonts.code,
              color: varianceColor(data.surplus, data.comparison.prior_year.surplus),
            }}
          >
            {data.surplus > data.comparison.prior_year.surplus ? "+" : ""}
            {fmt(data.surplus - data.comparison.prior_year.surplus)}
          </div>
        </div>
      </div>
    </div>
  );
}
