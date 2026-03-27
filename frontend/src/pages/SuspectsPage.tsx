import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { ChaseList, type SuspectRow } from "../components/suspects/ChaseList";

interface Summary {
  total_suspects: number;
  total_open: number;
  total_captured: number;
  total_raf_opportunity: number;
  total_dollar_opportunity: number;
  by_provider: { provider_id: number; provider_name: string; count: number }[];
}

type SortField = "raf_value" | "member_name" | "identified_date" | "annual_value";

const sortOptions: { value: SortField; label: string }[] = [
  { value: "raf_value", label: "RAF Value (High to Low)" },
  { value: "annual_value", label: "Annual Value (High to Low)" },
  { value: "member_name", label: "Member Name (A-Z)" },
  { value: "identified_date", label: "Date Identified (Newest)" },
];

const suspectTypes = [
  { value: "", label: "All Types" },
  { value: "recapture", label: "Recapture" },
  { value: "med_dx_gap", label: "Med-Dx Gap" },
  { value: "specificity", label: "Specificity" },
  { value: "near_miss", label: "Near Miss" },
  { value: "historical", label: "Historical" },
];

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "captured", label: "Captured" },
  { value: "dismissed", label: "Dismissed" },
];

const rafThresholds = [
  { value: "", label: "Any RAF" },
  { value: "0.1", label: "RAF >= 0.100" },
  { value: "0.2", label: "RAF >= 0.200" },
  { value: "0.5", label: "RAF >= 0.500" },
  { value: "1.0", label: "RAF >= 1.000" },
];

export function SuspectsPage() {
  // Summary
  const [summary, setSummary] = useState<Summary | null>(null);

  // Filters
  const [providerId, setProviderId] = useState("");
  const [suspectType, setSuspectType] = useState("");
  const [status, setStatus] = useState("");
  const [minRaf, setMinRaf] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("raf_value");

  // Data
  const [rows, setRows] = useState<SuspectRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get("/api/hcc/summary");
      setSummary(res.data);
    } catch {
      // fail silently
    }
  }, []);

  // Fetch suspects list
  const fetchSuspects = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        sort_by: sortBy,
      };
      if (providerId) params.provider_id = providerId;
      if (suspectType) params.suspect_type = suspectType;
      if (status) params.status = status;
      if (minRaf) params.min_raf_value = minRaf;

      const res = await api.get("/api/hcc/suspects", { params });
      setRows(res.data.items || []);
      setTotalPages(res.data.total_pages || 1);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, providerId, suspectType, status, minRaf]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchSuspects(); }, [fetchSuspects]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [providerId, suspectType, status, minRaf, sortBy]);

  const handleExport = async () => {
    try {
      const res = await api.get("/api/hcc/export", {
        params: { format: "csv" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "hcc_suspects_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // fail silently
    }
  };

  const handleDataChanged = useCallback(() => {
    fetchSuspects();
    fetchSummary();
  }, [fetchSuspects, fetchSummary]);

  const selectStyle = {
    borderColor: tokens.border,
    color: tokens.text,
    background: tokens.surface,
  };

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-1">
        <h1
          className="text-lg font-bold"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          HCC Suspect Chase List
        </h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 text-xs font-medium rounded-[6px] border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Export CSV
        </button>
      </div>
      <p className="text-xs mb-6" style={{ color: tokens.textMuted }}>
        Review and action suspected HCC coding opportunities across your member population.
      </p>

      {/* Summary metric cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Suspects"
          value={summary ? (summary.total_suspects ?? 0).toLocaleString() : "--"}
        />
        <MetricCard
          label="Total RAF Opportunity"
          value={summary ? (summary.total_raf_opportunity ?? 0).toFixed(1) : "--"}
        />
        <MetricCard
          label="Estimated Annual Value"
          value={summary ? `$${Math.round(summary.total_dollar_opportunity ?? 0).toLocaleString()}` : "--"}
        />
        <MetricCard
          label="Capture Rate"
          value={summary ? `${(summary.total_suspects ?? 0) > 0 ? (((summary.total_captured ?? 0) / summary.total_suspects) * 100).toFixed(1) : "0.0"}%` : "--"}
        />
      </div>

      {/* Filters bar */}
      <div
        className="rounded-[10px] border p-4 mb-5 flex items-center gap-3 flex-wrap"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        {/* Provider filter */}
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border"
          style={selectStyle}
        >
          <option value="">All Providers</option>
          {summary?.by_provider?.map((p: { provider_id: number; provider_name: string }) => (
            <option key={p.provider_id} value={p.provider_id}>{p.provider_name}</option>
          ))}
        </select>

        {/* Suspect type */}
        <select
          value={suspectType}
          onChange={(e) => setSuspectType(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border"
          style={selectStyle}
        >
          {suspectTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border"
          style={selectStyle}
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Min RAF */}
        <select
          value={minRaf}
          onChange={(e) => setMinRaf(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border"
          style={selectStyle}
        >
          {rafThresholds.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium" style={{ color: tokens.textMuted }}>Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="text-xs px-3 py-2 rounded-lg border"
            style={selectStyle}
          >
            {sortOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chase list table */}
      {loading ? (
        <div
          className="rounded-[10px] border p-12 text-center text-sm"
          style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.textMuted }}
        >
          Loading suspects...
        </div>
      ) : (
        <ChaseList
          rows={rows}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onDataChanged={handleDataChanged}
        />
      )}
    </div>
  );
}
