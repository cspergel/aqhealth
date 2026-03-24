import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { ProviderTable, type ProviderRow } from "../components/providers/ProviderTable";
import { Scorecard } from "../components/providers/Scorecard";

// ---------------------------------------------------------------------------
// Provider List View
// ---------------------------------------------------------------------------

function ProviderListView() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { sort_by: sortBy, order };
      if (specialtyFilter) params.specialty = specialtyFilter;
      if (tierFilter) params.tier = tierFilter;
      const res = await api.get("/api/providers", { params });
      setProviders(res.data);
    } catch (err) {
      console.error("Failed to load providers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [sortBy, order, specialtyFilter, tierFilter]);

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setOrder("asc");
    }
  };

  const handleExport = () => {
    const baseUrl = (import.meta as any).env?.VITE_API_URL || "http://localhost:8080";
    window.open(`${baseUrl}/api/providers/export?sort_by=${sortBy}&order=${order}`, "_blank");
  };

  // Extract unique specialties for filter
  const specialties = [...new Set(providers.map((p) => p.specialty).filter(Boolean))] as string[];

  // Tier summary counts
  const greenCount = providers.filter((p) => p.tier === "green").length;
  const amberCount = providers.filter((p) => p.tier === "amber").length;
  const redCount = providers.filter((p) => p.tier === "red").length;

  return (
    <div className="p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Provider Scorecards
          </h1>
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
            {providers.length} providers in network
          </p>
        </div>
        <button
          onClick={handleExport}
          className="text-[13px] px-4 py-2 rounded-lg border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Export CSV
        </button>
      </div>

      {/* Tier summary */}
      <div className="flex items-center gap-6">
        {[
          { label: "Meets Target", count: greenCount, color: tokens.accent },
          { label: "Near Target", count: amberCount, color: tokens.amber },
          { label: "Below Target", count: redCount, color: tokens.red },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[13px]" style={{ color: tokens.textSecondary }}>
              {label}:{" "}
              <span style={{ fontFamily: fonts.code, color: tokens.text }}>{count}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="text-[13px] px-3 py-1.5 rounded border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary, background: tokens.surface }}
        >
          <option value="">All Specialties</option>
          {specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="text-[13px] px-3 py-1.5 rounded border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary, background: tokens.surface }}
        >
          <option value="">All Tiers</option>
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="red">Red</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-8 text-center text-[13px]" style={{ color: tokens.textMuted }}>
          Loading providers...
        </div>
      ) : (
        <ProviderTable
          providers={providers}
          sortBy={sortBy}
          order={order}
          onSort={handleSort}
          onRowClick={(id) => navigate(`/providers/${id}`)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page with nested routes
// ---------------------------------------------------------------------------

export function ProvidersPage() {
  return (
    <Routes>
      <Route path="/" element={<ProviderListView />} />
      <Route path="/:id" element={<Scorecard />} />
    </Routes>
  );
}
