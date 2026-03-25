import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { DataTierBadge } from "../components/ui/DataTierBadge";
import { CensusTable, type CensusItem } from "../components/census/CensusTable";

interface CensusSummary {
  currently_admitted: number;
  in_ed: number;
  in_observation: number;
  in_snf: number;
  total_census: number;
  today_admits: number;
  today_discharges: number;
  by_facility: { facility: string; count: number }[];
  trend_7d: { date: string; admits: number; discharges: number }[];
}

export function CensusPage() {
  const [summary, setSummary] = useState<CensusSummary | null>(null);
  const [census, setCensus] = useState<CensusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [facilityFilter, setFacilityFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/adt/census/summary"),
      api.get("/api/adt/census"),
    ])
      .then(([summaryRes, censusRes]) => {
        setSummary(summaryRes.data);
        setCensus(censusRes.data.items || censusRes.data);
        setLastRefresh(new Date());
      })
      .catch((err) => console.error("Failed to load census data:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Compute total accruing daily cost
  const totalDailyCost = census.reduce((sum, item) => sum + item.estimated_daily_cost, 0);

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Live Census
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            Real-time ADT census across all facilities
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-refresh indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: tokens.accent }}
            />
            <span className="text-xs" style={{ color: tokens.textMuted }}>
              Auto-refresh 60s
            </span>
          </div>
          <span className="text-xs" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
            Last: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            className="text-xs px-3 py-1.5 rounded-md border font-medium transition-colors hover:bg-stone-50"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
            onClick={loadData}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Top stats */}
      {loading && !summary ? (
        <div className="text-sm py-12 text-center" style={{ color: tokens.textMuted }}>
          Loading census data...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-4 mb-6">
            <MetricCard
              label="Currently Admitted"
              value={String(summary?.currently_admitted ?? 0)}
            />
            <MetricCard
              label="In ER"
              value={String(summary?.in_ed ?? 0)}
            />
            <MetricCard
              label="In Observation"
              value={String(summary?.in_observation ?? 0)}
            />
            <MetricCard
              label="In SNF"
              value={String(summary?.in_snf ?? 0)}
            />
            <MetricCard
              label="Today's Admits"
              value={String(summary?.today_admits ?? 0)}
              trend={`${summary?.today_discharges ?? 0} discharges`}
            />
            <div className="relative">
              <MetricCard
                label="Daily Cost Accruing"
                value={`$${totalDailyCost.toLocaleString()}`}
              />
              <div className="absolute top-2.5 right-3">
                <DataTierBadge
                  tooltip="All census costs are estimated from ADT data (signal tier). Actual claims have not been received yet."
                />
              </div>
            </div>
          </div>

          {/* Facility breakdown bar */}
          {summary?.by_facility && summary.by_facility.length > 0 && (
            <div
              className="rounded-[10px] border bg-white p-4 mb-6"
              style={{ borderColor: tokens.border }}
            >
              <div
                className="text-xs font-semibold mb-3"
                style={{ color: tokens.textMuted }}
              >
                By Facility
              </div>
              <div className="flex items-end gap-3">
                {summary.by_facility.map((f) => (
                  <div key={f.facility} className="flex-1">
                    <div className="flex items-end gap-1 mb-1">
                      <span
                        className="text-lg font-bold"
                        style={{ fontFamily: fonts.code, color: tokens.text }}
                      >
                        {f.count}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full mb-1"
                      style={{
                        background: tokens.accent,
                        width: `${Math.max(20, (f.count / (summary.total_census || 1)) * 100)}%`,
                        opacity: 0.7 + (f.count / (summary.total_census || 1)) * 0.3,
                      }}
                    />
                    <div
                      className="text-[11px] truncate"
                      style={{ color: tokens.textMuted }}
                    >
                      {f.facility}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7-day trend */}
          {summary?.trend_7d && summary.trend_7d.length > 0 && (
            <div
              className="rounded-[10px] border bg-white p-4 mb-6"
              style={{ borderColor: tokens.border }}
            >
              <div
                className="text-xs font-semibold mb-3"
                style={{ color: tokens.textMuted }}
              >
                7-Day Trend
              </div>
              <div className="flex items-end gap-2">
                {summary.trend_7d.map((d) => (
                  <div key={d.date} className="flex-1 text-center">
                    <div className="flex items-end justify-center gap-0.5 mb-1" style={{ height: 40 }}>
                      <div
                        className="w-3 rounded-t"
                        style={{
                          height: `${Math.max(8, (d.admits / 8) * 40)}px`,
                          background: tokens.blue,
                          opacity: 0.7,
                        }}
                        title={`${d.admits} admits`}
                      />
                      <div
                        className="w-3 rounded-t"
                        style={{
                          height: `${Math.max(8, (d.discharges / 8) * 40)}px`,
                          background: tokens.accent,
                          opacity: 0.7,
                        }}
                        title={`${d.discharges} discharges`}
                      />
                    </div>
                    <div className="text-[10px]" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2 justify-center">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: tokens.blue, opacity: 0.7 }} />
                  <span className="text-[10px]" style={{ color: tokens.textMuted }}>Admits</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: tokens.accent, opacity: 0.7 }} />
                  <span className="text-[10px]" style={{ color: tokens.textMuted }}>Discharges</span>
                </div>
              </div>
            </div>
          )}

          {/* Census table */}
          <CensusTable
            items={census}
            facilityFilter={facilityFilter}
            classFilter={classFilter}
            providerFilter={providerFilter}
            onFacilityFilterChange={setFacilityFilter}
            onClassFilterChange={setClassFilter}
            onProviderFilterChange={setProviderFilter}
          />
        </>
      )}
    </div>
  );
}
