import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryBreakdown {
  name: string;
  budget_annual: number;
  actual_ytd: number;
  pct_of_budget: number;
  variance: number;
}

interface ExpenseDashboard {
  total_budget: number;
  total_actual: number;
  budget_utilization: number;
  staffing_cost: number;
  categories: CategoryBreakdown[];
}

interface RoleBreakdown {
  role: string;
  count: number;
  total_salary: number;
  total_benefits: number;
  total_cost: number;
  total_fte: number;
}

interface BenchmarkItem {
  current: number;
  benchmark: number;
  status: string;
  label?: string;
}

interface StaffingAnalysis {
  total_staff: number;
  total_cost: number;
  provider_count: number;
  staff_to_provider_ratio: number;
  staff_to_member_ratio: number;
  by_role: RoleBreakdown[];
  benchmarks: Record<string, BenchmarkItem>;
  ai_recommendations: { type: string; message: string }[];
}

interface TrendMonth {
  month: string;
  staffing: number;
  supplies: number;
  rent: number;
  software: number;
  equipment: number;
  insurance: number;
  marketing: number;
}

interface EfficiencyMetrics {
  total_staff: number;
  total_expenses: number;
  expense_per_staff: number;
  revenue_per_staff: number;
  cost_per_member: number;
  overhead_ratio: number;
  supply_cost_per_visit: number;
  staffing_pct_of_revenue: number;
  benchmarks: Record<string, BenchmarkItem>;
}

interface RecommendedHire {
  role: string;
  title: string;
  estimated_salary: number;
  estimated_benefits: number;
  total_cost: number;
  impact: string;
  revenue_impact: number;
  break_even_months: number;
  priority: string;
}

interface HiringAnalysis {
  current_staff: number;
  current_cost: number;
  monthly_revenue: number;
  provider_count: number;
  panel_size: number;
  staff_to_provider_ratio: number;
  financial_capacity: {
    annual_surplus: number;
    max_new_hire_budget: number;
    surplus_after_hire: number;
    can_hire: boolean;
  };
  recommended_hires: RecommendedHire[];
}

interface StaffMember {
  id: number;
  name: string;
  role: string;
  practice_group_id: number | null;
  salary: number;
  benefits_cost: number;
  fte: number;
  hire_date: string | null;
  is_active: boolean;
}

interface ExpenseEntry {
  id: number;
  category_id: number;
  description: string;
  amount: number;
  expense_date: string;
  practice_group_id: number | null;
  vendor: string | null;
  recurring: boolean;
  recurring_frequency: string | null;
  notes: string | null;
}

type ActiveTab = "overview" | "staffing" | "efficiency" | "hiring" | "expenses";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const ROLE_LABELS: Record<string, string> = {
  physician: "Physician",
  np: "Nurse Practitioner",
  ma: "Medical Assistant",
  front_desk: "Front Desk",
  biller: "Biller",
  coder: "Coder",
  care_manager: "Care Manager",
  admin: "Admin",
};

const CATEGORY_COLORS: Record<string, string> = {
  Staffing: "#16a34a",
  Supplies: "#2563eb",
  "Rent & Facilities": "#d97706",
  "Software & IT": "#7c3aed",
  Equipment: "#0891b2",
  Insurance: "#dc2626",
  Marketing: "#e11d48",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BudgetGauge({ pct }: { pct: number }) {
  const color = pct > 90 ? tokens.red : pct > 75 ? tokens.amber : tokens.accent;
  return (
    <div style={{ width: "100%", height: 8, background: tokens.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 600ms ease" }} />
    </div>
  );
}

function DonutChart({ categories }: { categories: CategoryBreakdown[] }) {
  const total = categories.reduce((s, c) => s + c.actual_ytd, 0);
  let cumPct = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width={140} height={140} viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke={tokens.surfaceAlt} strokeWidth="4" />
        {categories.map((cat) => {
          const pct = total ? (cat.actual_ytd / total) * 100 : 0;
          const dashArray = `${pct} ${100 - pct}`;
          const dashOffset = 25 - cumPct;
          cumPct += pct;
          return (
            <circle
              key={cat.name}
              cx="21"
              cy="21"
              r="15.91549431"
              fill="transparent"
              stroke={CATEGORY_COLORS[cat.name] || tokens.textMuted}
              strokeWidth="4"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {categories.map((cat) => (
          <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[cat.name] || tokens.textMuted, flexShrink: 0 }} />
            <span style={{ color: tokens.textSecondary }}>{cat.name}</span>
            <span style={{ marginLeft: "auto", fontWeight: 600, color: tokens.text }}>{fmt(cat.actual_ytd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ trends }: { trends: TrendMonth[] }) {
  const keys = ["staffing", "supplies", "rent", "software", "equipment", "insurance", "marketing"] as const;
  const keyLabels: Record<string, string> = {
    staffing: "Staffing", supplies: "Supplies", rent: "Rent", software: "Software", equipment: "Equipment", insurance: "Insurance", marketing: "Marketing",
  };
  const keyColors: Record<string, string> = {
    staffing: "#16a34a", supplies: "#2563eb", rent: "#d97706", software: "#7c3aed", equipment: "#0891b2", insurance: "#dc2626", marketing: "#e11d48",
  };

  // Get totals for bar chart
  const monthTotals = trends.map((t) => keys.reduce((s, k) => s + (t[k] || 0), 0));
  const maxTotal = Math.max(...monthTotals, 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160, marginBottom: 8 }}>
        {trends.map((t, i) => {
          const total = monthTotals[i];
          return (
            <div key={t.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: tokens.text, marginBottom: 4 }}>{fmt(total)}</div>
              <div style={{ width: "100%", maxWidth: 48, height: `${(total / maxTotal) * 120}px`, background: tokens.accent, borderRadius: "4px 4px 0 0", position: "relative", overflow: "hidden" }}>
                {/* Stack segments */}
                {(() => {
                  let y = 0;
                  const segmentHeight = total ? (total / maxTotal) * 120 : 0;
                  return keys.map((k) => {
                    const val = t[k] || 0;
                    const h = total ? (val / total) * segmentHeight : 0;
                    const top = y;
                    y += h;
                    return <div key={k} style={{ position: "absolute", bottom: top, left: 0, right: 0, height: h, background: keyColors[k] }} />;
                  });
                })()}
              </div>
              <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 4 }}>{t.month.slice(5)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {keys.filter((k) => k !== "staffing").map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: keyColors[k] }} />
            <span style={{ color: tokens.textSecondary }}>{keyLabels[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function PracticeExpensesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [dashboard, setDashboard] = useState<ExpenseDashboard | null>(null);
  const [staffing, setStaffing] = useState<StaffingAnalysis | null>(null);
  const [trends, setTrends] = useState<TrendMonth[]>([]);
  const [efficiency, setEfficiency] = useState<EfficiencyMetrics | null>(null);
  const [hiring, setHiring] = useState<HiringAnalysis | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/expenses/dashboard"),
      api.get("/api/expenses/staffing"),
      api.get("/api/expenses/trends"),
      api.get("/api/expenses/efficiency"),
      api.get("/api/expenses/hiring-analysis"),
      api.get("/api/expenses/staff"),
      api.get("/api/expenses/entries"),
    ])
      .then(([dashRes, staffingRes, trendsRes, effRes, hiringRes, staffRes, expRes]) => {
        setDashboard(dashRes.data);
        setStaffing(staffingRes.data);
        setTrends(trendsRes.data);
        setEfficiency(effRes.data);
        setHiring(hiringRes.data);
        setStaff(staffRes.data);
        setExpenses(expRes.data);
      })
      .catch((err) => console.error("Failed to load expense data:", err))
      .finally(() => setLoading(false));
  }, []);

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "staffing", label: "Staffing" },
    { key: "efficiency", label: "Efficiency" },
    { key: "hiring", label: "Hiring Analysis" },
    { key: "expenses", label: "Expenses" },
  ];

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading practice expense data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        Practice Costs
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 20 }}>
        Manage operational expenses, staffing costs, and identify efficiency opportunities.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 24 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? tokens.accent : tokens.textSecondary,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && dashboard && <OverviewTab dashboard={dashboard} trends={trends} />}
      {activeTab === "staffing" && staffing && <StaffingTab staffing={staffing} staff={staff} />}
      {activeTab === "efficiency" && efficiency && <EfficiencyTab efficiency={efficiency} />}
      {activeTab === "hiring" && hiring && <HiringTab hiring={hiring} />}
      {activeTab === "expenses" && <ExpensesTab expenses={expenses} staff={staff} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ dashboard, trends }: { dashboard: ExpenseDashboard; trends: TrendMonth[] }) {
  return (
    <div>
      {/* Top metrics */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricBox label="Total Operational Cost (YTD)" value={fmt(dashboard.total_actual)} sub={`Budget: ${fmt(dashboard.total_budget)}`} />
        <MetricBox label="Budget Utilization" value={`${dashboard.budget_utilization}%`} sub="of annual budget consumed" color={dashboard.budget_utilization > 85 ? tokens.amber : tokens.accent} />
        <MetricBox label="Staffing Cost" value={fmt(dashboard.staffing_cost)} sub={`${((dashboard.staffing_cost / dashboard.total_actual) * 100).toFixed(0)}% of total expenses`} />
        <MetricBox label="Non-Staffing Cost" value={fmt(dashboard.total_actual - dashboard.staffing_cost)} sub="Supplies, rent, software, etc." />
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Category Breakdown */}
        <div style={{ flex: 1, minWidth: 340, background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Expense Breakdown</h2>
          <DonutChart categories={dashboard.categories} />
        </div>

        {/* Budget vs Actual */}
        <div style={{ flex: 1, minWidth: 340, background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Budget vs Actual</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {dashboard.categories.map((cat) => (
              <div key={cat.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: tokens.textSecondary }}>{cat.name}</span>
                  <span style={{ fontWeight: 600, color: tokens.text }}>{fmt(cat.actual_ytd)} / {fmt(cat.budget_annual)}</span>
                </div>
                <BudgetGauge pct={cat.pct_of_budget} />
                <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 2 }}>
                  {cat.pct_of_budget}% consumed | {fmt(cat.variance)} remaining
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginTop: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Monthly Expense Trend</h2>
        <TrendChart trends={trends} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staffing Tab
// ---------------------------------------------------------------------------

function StaffingTab({ staffing, staff }: { staffing: StaffingAnalysis; staff: StaffMember[] }) {
  return (
    <div>
      {/* Top metrics */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricBox label="Total Staff" value={String(staffing.total_staff)} sub={`${staffing.provider_count} providers, ${staffing.total_staff - staffing.provider_count} support`} />
        <MetricBox label="Total Staffing Cost" value={fmt(staffing.total_cost)} sub="salaries + benefits" />
        <MetricBox label="Staff-to-Provider Ratio" value={`${staffing.staff_to_provider_ratio}:1`} sub={`Benchmark: 2.5:1`} color={staffing.staff_to_provider_ratio > 3 ? tokens.amber : tokens.accent} />
        <MetricBox label="Staff per 1K Members" value={staffing.staff_to_member_ratio.toFixed(1)} sub="Benchmark: 3.5" />
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* By Role */}
        <div style={{ flex: 1, minWidth: 420, background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Staffing by Role</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <th style={{ textAlign: "left", padding: "8px 8px 8px 0", color: tokens.textMuted, fontWeight: 500 }}>Role</th>
                <th style={{ textAlign: "right", padding: 8, color: tokens.textMuted, fontWeight: 500 }}>Count</th>
                <th style={{ textAlign: "right", padding: 8, color: tokens.textMuted, fontWeight: 500 }}>FTE</th>
                <th style={{ textAlign: "right", padding: 8, color: tokens.textMuted, fontWeight: 500 }}>Total Cost</th>
                <th style={{ textAlign: "right", padding: "8px 0 8px 8px", color: tokens.textMuted, fontWeight: 500 }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {staffing.by_role.map((r) => (
                <tr key={r.role} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                  <td style={{ padding: "10px 8px 10px 0", fontWeight: 500, color: tokens.text }}>{ROLE_LABELS[r.role] || r.role}</td>
                  <td style={{ textAlign: "right", padding: 8, color: tokens.textSecondary }}>{r.count}</td>
                  <td style={{ textAlign: "right", padding: 8, color: tokens.textSecondary }}>{r.total_fte}</td>
                  <td style={{ textAlign: "right", padding: 8, fontWeight: 600, fontFamily: fonts.code, color: tokens.text }}>{fmt(r.total_cost)}</td>
                  <td style={{ textAlign: "right", padding: "8px 0 8px 8px", color: tokens.textSecondary }}>{((r.total_cost / staffing.total_cost) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Benchmarks & AI Recommendations */}
        <div style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Benchmarks */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>Staffing Benchmarks</h2>
            {Object.entries(staffing.benchmarks).map(([key, b]) => {
              const isGood = b.status === "below" || b.status === "at";
              return (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${tokens.borderSoft}` }}>
                  <span style={{ fontSize: 12, color: tokens.textSecondary }}>{key.replace(/_/g, " ")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{b.current}</span>
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>vs {b.benchmark}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: isGood ? tokens.accentSoft : tokens.amberSoft, color: isGood ? tokens.accentText : tokens.amber }}>
                      {b.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Recommendations */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>AI Recommendations</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {staffing.ai_recommendations.map((rec, i) => {
                const bg = rec.type === "warning" ? tokens.amberSoft : rec.type === "success" ? tokens.accentSoft : tokens.blueSoft;
                const border = rec.type === "warning" ? tokens.amber : rec.type === "success" ? tokens.accent : tokens.blue;
                return (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: bg, borderLeft: `3px solid ${border}`, fontSize: 12, color: tokens.text, lineHeight: 1.5 }}>
                    {rec.message}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginTop: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Staff Directory</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
              {["Name", "Role", "Practice", "Salary", "Benefits", "FTE", "Hire Date"].map((h) => (
                <th key={h} style={{ textAlign: h === "Name" || h === "Role" ? "left" : "right", padding: "8px 8px", color: tokens.textMuted, fontWeight: 500, fontSize: 12 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                <td style={{ padding: "10px 8px", fontWeight: 500, color: tokens.text }}>{s.name}</td>
                <td style={{ padding: 8, color: tokens.textSecondary }}>{ROLE_LABELS[s.role] || s.role}</td>
                <td style={{ textAlign: "right", padding: 8, color: tokens.textSecondary }}>{s.practice_group_id ? `Group ${s.practice_group_id}` : "Central"}</td>
                <td style={{ textAlign: "right", padding: 8, fontFamily: fonts.code, color: tokens.text }}>{fmtFull(s.salary)}</td>
                <td style={{ textAlign: "right", padding: 8, fontFamily: fonts.code, color: tokens.textSecondary }}>{fmtFull(s.benefits_cost)}</td>
                <td style={{ textAlign: "right", padding: 8, color: tokens.textSecondary }}>{s.fte}</td>
                <td style={{ textAlign: "right", padding: 8, color: tokens.textMuted, fontSize: 12 }}>{s.hire_date || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Efficiency Tab
// ---------------------------------------------------------------------------

function EfficiencyTab({ efficiency }: { efficiency: EfficiencyMetrics }) {
  return (
    <div>
      {/* Key Metrics */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricBox label="Revenue per Staff" value={fmt(efficiency.revenue_per_staff)} sub="total revenue / headcount" color={tokens.accent} />
        <MetricBox label="Cost per Member" value={`$${efficiency.cost_per_member.toFixed(2)}`} sub="operational cost / members" />
        <MetricBox label="Overhead Ratio" value={`${efficiency.overhead_ratio}%`} sub="non-staffing as % of total" color={efficiency.overhead_ratio < 12 ? tokens.accent : tokens.amber} />
        <MetricBox label="Staffing % of Revenue" value={`${efficiency.staffing_pct_of_revenue}%`} sub="benchmark: 30%" color={efficiency.staffing_pct_of_revenue < 30 ? tokens.accent : tokens.amber} />
      </div>

      {/* Benchmark Comparison */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Efficiency Benchmarks</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {Object.entries(efficiency.benchmarks).map(([key, b]) => {
            const isGood = b.status === "below" || b.status === "above";
            const pctOfBenchmark = (b.current / b.benchmark) * 100;
            return (
              <div key={key} style={{ padding: 16, borderRadius: 8, border: `1px solid ${tokens.borderSoft}`, background: tokens.surfaceAlt }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: tokens.textSecondary }}>{b.label || key.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: isGood ? tokens.accentSoft : tokens.redSoft, color: isGood ? tokens.accentText : tokens.red }}>
                    {isGood ? "On Track" : "Review"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text }}>
                    {typeof b.current === "number" && b.current > 1000 ? fmt(b.current) : b.current}
                  </span>
                  <span style={{ fontSize: 12, color: tokens.textMuted }}>vs {typeof b.benchmark === "number" && b.benchmark > 1000 ? fmt(b.benchmark) : b.benchmark} benchmark</span>
                </div>
                <div style={{ width: "100%", height: 6, background: tokens.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pctOfBenchmark, 150)}%`, maxWidth: "100%", height: "100%", background: isGood ? tokens.accent : tokens.red, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Additional metrics */}
      <div style={{ display: "flex", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
        <MetricBox label="Supply Cost per Visit" value={`$${efficiency.supply_cost_per_visit.toFixed(2)}`} sub="benchmark: $5.50" color={efficiency.supply_cost_per_visit < 5.5 ? tokens.accent : tokens.amber} />
        <MetricBox label="Expense per Staff" value={fmt(efficiency.expense_per_staff)} sub="total operational / headcount" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hiring Analysis Tab
// ---------------------------------------------------------------------------

function HiringTab({ hiring }: { hiring: HiringAnalysis }) {
  const cap = hiring.financial_capacity;
  return (
    <div>
      {/* Can We Hire? Banner */}
      <div style={{
        background: cap.can_hire ? tokens.accentSoft : tokens.redSoft,
        border: `1px solid ${cap.can_hire ? tokens.accent : tokens.red}`,
        borderRadius: 10,
        padding: "20px 24px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: fonts.heading, color: cap.can_hire ? tokens.accentText : tokens.red }}>
          {cap.can_hire ? "Yes" : "No"}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: tokens.text, marginBottom: 4 }}>
            {cap.can_hire ? "You have capacity to hire" : "Hiring not recommended at this time"}
          </div>
          <div style={{ fontSize: 13, color: tokens.textSecondary }}>
            Annual surplus: {fmt(cap.annual_surplus)} | Max new hire budget: {fmt(cap.max_new_hire_budget)} | Surplus after hire: {fmt(cap.surplus_after_hire)}
          </div>
        </div>
      </div>

      {/* Current State */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricBox label="Current Staff" value={String(hiring.current_staff)} sub={`${hiring.provider_count} providers`} />
        <MetricBox label="Panel Size" value={hiring.panel_size.toLocaleString()} sub="total members" />
        <MetricBox label="Monthly Revenue" value={fmt(hiring.monthly_revenue)} />
        <MetricBox label="Annual Staffing Cost" value={fmt(hiring.current_cost)} />
      </div>

      {/* Recommended Hires */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 16, color: tokens.text }}>Recommended Hires (by Impact)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {hiring.recommended_hires.map((hire) => {
            const priorityColor = hire.priority === "high" ? tokens.accent : hire.priority === "medium" ? tokens.amber : tokens.textMuted;
            return (
              <div key={hire.role} style={{ border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, borderLeft: `4px solid ${priorityColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: tokens.text, marginBottom: 2 }}>{hire.title}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: hire.priority === "high" ? tokens.accentSoft : hire.priority === "medium" ? tokens.amberSoft : tokens.surfaceAlt, color: priorityColor, textTransform: "uppercase" }}>
                      {hire.priority} priority
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.heading, color: tokens.accent }}>{fmt(hire.revenue_impact)}</div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>projected annual revenue impact</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>{hire.impact}</div>
                <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
                  <div>
                    <span style={{ color: tokens.textMuted }}>Salary: </span>
                    <span style={{ fontWeight: 600, color: tokens.text }}>{fmtFull(hire.estimated_salary)}</span>
                  </div>
                  <div>
                    <span style={{ color: tokens.textMuted }}>Benefits: </span>
                    <span style={{ fontWeight: 600, color: tokens.text }}>{fmtFull(hire.estimated_benefits)}</span>
                  </div>
                  <div>
                    <span style={{ color: tokens.textMuted }}>Total Cost: </span>
                    <span style={{ fontWeight: 600, color: tokens.text }}>{fmtFull(hire.total_cost)}</span>
                  </div>
                  <div>
                    <span style={{ color: tokens.textMuted }}>Break-even: </span>
                    <span style={{ fontWeight: 600, color: tokens.accent }}>{hire.break_even_months} months</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses Tab
// ---------------------------------------------------------------------------

function ExpensesTab({ expenses, staff: _staff }: { expenses: ExpenseEntry[]; staff: StaffMember[] }) {
  const [filter, setFilter] = useState<string>("all");

  const CATEGORY_NAMES: Record<number, string> = {
    1: "Staffing", 2: "Supplies", 3: "Rent & Facilities", 4: "Software & IT", 5: "Equipment", 6: "Insurance", 7: "Marketing",
  };

  const filtered = filter === "all" ? expenses : expenses.filter((e) => CATEGORY_NAMES[e.category_id] === filter);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "Supplies", "Rent & Facilities", "Software & IT", "Equipment", "Insurance", "Marketing"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: filter === cat ? 600 : 400,
              color: filter === cat ? "#fff" : tokens.textSecondary,
              background: filter === cat ? tokens.accent : tokens.surfaceAlt,
              border: `1px solid ${filter === cat ? tokens.accent : tokens.border}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {cat === "all" ? "All Categories" : cat}
          </button>
        ))}
      </div>

      {/* Expense Table */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
              {["Date", "Description", "Category", "Vendor", "Amount", "Recurring"].map((h) => (
                <th key={h} style={{ textAlign: h === "Amount" ? "right" : "left", padding: "8px 8px", color: tokens.textMuted, fontWeight: 500, fontSize: 12 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                <td style={{ padding: "10px 8px", color: tokens.textSecondary, fontSize: 12 }}>{e.expense_date}</td>
                <td style={{ padding: 8, fontWeight: 500, color: tokens.text }}>{e.description}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
                    {CATEGORY_NAMES[e.category_id] || `Cat ${e.category_id}`}
                  </span>
                </td>
                <td style={{ padding: 8, color: tokens.textSecondary }}>{e.vendor || "-"}</td>
                <td style={{ textAlign: "right", padding: 8, fontWeight: 600, fontFamily: fonts.code, color: tokens.text }}>{fmtFull(e.amount)}</td>
                <td style={{ padding: 8 }}>
                  {e.recurring ? (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: tokens.blueSoft, color: tokens.blue }}>
                      {e.recurring_frequency}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>one-time</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
