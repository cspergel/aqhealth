import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { CohortBuilder } from "../components/cohorts/CohortBuilder";
import { CohortResults } from "../components/cohorts/CohortResults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CohortMember {
  id: string;
  name: string;
  age: number;
  gender: string;
  raf: number;
  risk_tier: string;
  provider: string;
  group: string;
  er_visits: number;
  admissions: number;
  total_spend: number;
  top_diagnoses: string[];
  open_gaps: number;
  suspect_hccs: string[];
}

interface AggregateStats {
  avg_raf: number;
  total_spend: number;
  avg_spend: number;
  avg_age: number;
  avg_er_visits: number;
  avg_admissions: number;
  pct_high_risk: number;
  total_open_gaps: number;
}

interface CohortResult {
  member_count: number;
  filters_applied: Record<string, unknown>;
  aggregate_stats: AggregateStats;
  top_diagnoses: { code: string; count: number }[];
  top_suspects: { code: string; count: number }[];
  members: CohortMember[];
}

interface SavedCohort {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
  member_count: number;
  last_run: string;
  trend_sparkline?: number[];
}

// ---------------------------------------------------------------------------
// Sparkline component
// ---------------------------------------------------------------------------

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cohorts Page
// ---------------------------------------------------------------------------

export function CohortsPage() {
  const [result, setResult] = useState<CohortResult | null>(null);
  const [savedCohorts, setSavedCohorts] = useState<SavedCohort[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(true);

  // Load saved cohorts on mount
  useEffect(() => {
    api
      .get("/api/cohorts")
      .then((res) => setSavedCohorts(res.data))
      .catch(() => {});
  }, []);

  const handleBuild = (filters: Record<string, unknown>) => {
    setBuilding(true);
    setError(null);
    api
      .post("/api/cohorts/build", { filters })
      .then((res) => {
        setResult(res.data);
        setShowBuilder(false);
      })
      .catch((err) => {
        console.error("Cohort build failed:", err);
        setError("Failed to build cohort.");
      })
      .finally(() => setBuilding(false));
  };

  const handleSave = (name: string) => {
    if (!result) return;
    api
      .post("/api/cohorts/save", { name, filters: result.filters_applied })
      .then((res) => {
        setSavedCohorts((prev) => [
          ...prev,
          { ...res.data, trend_sparkline: undefined },
        ]);
      })
      .catch(() => {});
  };

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Population Cohorts
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Build and track custom population segments
          </p>
        </div>
        {!showBuilder && (
          <button
            onClick={() => { setShowBuilder(true); setResult(null); }}
            className="text-[13px] px-4 py-2 rounded-md font-semibold text-white"
            style={{ background: tokens.accent }}
          >
            New Cohort
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-[13px]" style={{ background: tokens.redSoft, color: tokens.red }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {showBuilder && (
            <CohortBuilder onBuild={handleBuild} loading={building} />
          )}
          {result && (
            <CohortResults data={result} onSave={handleSave} />
          )}
        </div>

        {/* Saved Cohorts Sidebar */}
        <div>
          <div
            className="rounded-xl border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <h3
              className="text-[14px] font-semibold mb-4"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Saved Cohorts
            </h3>

            {savedCohorts.length === 0 ? (
              <p className="text-[12px]" style={{ color: tokens.textMuted }}>
                No saved cohorts yet. Build a cohort and save it.
              </p>
            ) : (
              <div className="space-y-2">
                {savedCohorts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      // Load this cohort's results
                      setBuilding(true);
                      api
                        .get(`/api/cohorts/${c.id}`)
                        .then((res) => {
                          setResult(res.data);
                          setShowBuilder(false);
                        })
                        .catch(() => {})
                        .finally(() => setBuilding(false));
                    }}
                    className="w-full text-left p-3 rounded-lg border transition-colors hover:bg-stone-50"
                    style={{ borderColor: tokens.borderSoft }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium" style={{ color: tokens.text }}>
                        {c.name}
                      </span>
                      <span
                        className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: tokens.surfaceAlt, fontFamily: fonts.code, color: tokens.text }}
                      >
                        {c.member_count}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                        Last run: {c.last_run}
                      </span>
                      {c.trend_sparkline && (
                        <Sparkline data={c.trend_sparkline} color={tokens.accent} />
                      )}
                    </div>
                    {/* Filter tags */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(c.filters).map(([key, val]) => (
                        <span
                          key={key}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: tokens.blueSoft, color: tokens.blue }}
                        >
                          {key}: {Array.isArray(val) ? val.join(", ") : String(val)}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
