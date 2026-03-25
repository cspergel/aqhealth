import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { InsightCard } from "../components/ui/InsightCard";
import { CategoryCard } from "../components/expenditure/CategoryCard";
import { DrillDown } from "../components/expenditure/DrillDown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  key: string;
  label: string;
  total_spend: number;
  pmpm: number;
  pct_of_total: number;
  claim_count: number;
  trend_vs_prior: number;
}

interface Overview {
  total_spend: number;
  pmpm: number;
  mlr: number;
  member_count: number;
  categories: Category[];
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenditurePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, _setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get("/api/expenditure")
      .then((res) => setOverview(res.data))
      .catch((err) => {
        console.error("Failed to load expenditure overview:", err);
        setError("Failed to load expenditure data.");
      })
      .finally(() => setLoading(false));
  }, []);

  // If a category is selected, show the drill-down
  if (selectedCategory) {
    return (
      <div className="p-7">
        <DrillDown
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: tokens.textMuted }}>
          Loading expenditure analytics...
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-7 text-center">
        <div className="text-sm" style={{ color: tokens.red }}>
          {error || "No data available."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Expenditure Analytics
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Total medical spend across {(overview.member_count ?? 0).toLocaleString()} members
          </p>
        </div>
        <button
          onClick={() => {
            window.open(
              `${api.defaults.baseURL}/api/expenditure/export`,
              "_blank"
            );
          }}
          className="text-[13px] px-4 py-2 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Export CSV
        </button>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <MetricCard
          label="Total Spend"
          value={formatDollars(overview.total_spend)}
        />
        <MetricCard
          label="PMPM"
          value={`$${(overview.pmpm ?? 0).toFixed(2)}`}
        />
        <MetricCard
          label="Medical Loss Ratio"
          value={`${((overview.mlr ?? 0) * 100).toFixed(1)}%`}
        />
      </div>

      {/* Category cards */}
      <h2
        className="text-[14px] font-semibold mb-4"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        Spend by Service Category
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {(overview.categories ?? []).map((cat) => (
          <CategoryCard
            key={cat.key}
            categoryKey={cat.key}
            label={cat.label}
            totalSpend={cat.total_spend}
            pmpm={cat.pmpm}
            pctOfTotal={cat.pct_of_total}
            trendVsPrior={cat.trend_vs_prior}
            onClick={() => setSelectedCategory(cat.key)}
          />
        ))}
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div>
          <h2
            className="text-[14px] font-semibold mb-4"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            AI Cost Recommendations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                title={insight.title}
                description={insight.description}
                impact={
                  insight.dollar_impact
                    ? `$${insight.dollar_impact.toLocaleString("en-US")} potential savings`
                    : undefined
                }
                category="cost"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
