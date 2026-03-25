import { useState, useEffect, useCallback } from "react";
import { tokens, fonts } from "../lib/tokens";
import api from "../lib/api";
import { MemberFilters, type MemberFilterState } from "../components/members/MemberFilters";
import { MemberTable } from "../components/members/MemberTable";
import type { MockMember } from "../lib/mockData";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MemberListResponse {
  items: MockMember[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface MemberStats {
  count: number;
  avg_raf: number;
  total_suspects: number;
  total_gaps: number;
}

/* ------------------------------------------------------------------ */
/* Default filter state                                                */
/* ------------------------------------------------------------------ */

const defaultFilters: MemberFilterState = {
  raf_min: 0,
  raf_max: 5,
  days_not_seen: null,
  risk_tier: null,
  has_suspects: false,
  has_gaps: false,
  search: "",
};

/* ------------------------------------------------------------------ */
/* Page Component                                                      */
/* ------------------------------------------------------------------ */

export function MembersPage() {
  const [filters, setFilters] = useState<MemberFilterState>(defaultFilters);
  const [sortBy, setSortBy] = useState("raf");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const [members, setMembers] = useState<MockMember[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<MemberStats>({ count: 0, avg_raf: 0, total_suspects: 0, total_gaps: 0 });
  const [loading, setLoading] = useState(true);

  /* Build query params from filters */
  const buildParams = useCallback(() => {
    const params: Record<string, string> = {
      sort_by: sortBy,
      order,
      page: String(page),
      page_size: "25",
    };
    if (filters.raf_min > 0) params.raf_min = String(filters.raf_min);
    if (filters.raf_max < 5) params.raf_max = String(filters.raf_max);
    if (filters.days_not_seen) params.days_not_seen = String(filters.days_not_seen);
    if (filters.risk_tier) params.risk_tier = filters.risk_tier;
    if (filters.has_suspects) params.has_suspects = "true";
    if (filters.has_gaps) params.has_gaps = "true";
    if (filters.search) params.search = filters.search;
    return params;
  }, [filters, sortBy, order, page]);

  /* Fetch member list and stats */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = buildParams();

    Promise.all([
      api.get<MemberListResponse>("/api/members", { params }),
      api.get<MemberStats>("/api/members/stats", { params }),
    ]).then(([listRes, statsRes]) => {
      if (cancelled) return;
      setMembers(listRes.data.items);
      setTotalPages(listRes.data.total_pages);
      setTotal(listRes.data.total);
      setStats(statsRes.data);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [buildParams]);

  /* Handle sort click */
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("desc");
    }
    setPage(1);
  };

  /* Handle filter change */
  const handleFilterChange = (f: MemberFilterState) => {
    setFilters(f);
    setPage(1);
  };

  /* Handle presets */
  const handlePreset = (preset: string) => {
    switch (preset) {
      case "high_raf_not_seen":
        setFilters({ ...defaultFilters, raf_min: 1.5, days_not_seen: 90 });
        setSortBy("raf");
        setOrder("desc");
        break;
      case "all_suspects":
        setFilters({ ...defaultFilters, has_suspects: true });
        setSortBy("suspect_count");
        setOrder("desc");
        break;
      case "all_gaps":
        setFilters({ ...defaultFilters, has_gaps: true });
        setSortBy("gap_count");
        setOrder("desc");
        break;
    }
    setPage(1);
  };

  /* Export CSV */
  const handleExport = () => {
    const header = "Member ID,Name,DOB,PCP,Group,RAF,Risk Tier,Last Visit,Days Since Visit,Suspects,Gaps,12mo Spend,Plan\n";
    const rows = members.map((m) =>
      `${m.member_id},"${m.name}",${m.dob},"${m.pcp}","${m.group}",${m.current_raf},${m.risk_tier},${m.last_visit_date},${m.days_since_visit},${m.suspect_count},${m.gap_count},${m.total_spend_12mo},"${m.plan}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "member_roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: fonts.heading,
              color: tokens.text,
              margin: 0,
            }}
          >
            Members
          </h1>
          <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "4px 0 0 0" }}>
            Panel management &mdash; filter, sort, and drill into member detail
          </p>
        </div>
        <button
          onClick={handleExport}
          style={{
            padding: "8px 18px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
            color: tokens.textSecondary,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: fonts.body,
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surfaceAlt; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = tokens.surface; }}
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <MemberFilters filters={filters} onChange={handleFilterChange} onPreset={handlePreset} />

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: 24,
          margin: "16px 0",
          padding: "14px 20px",
          background: tokens.surface,
          borderRadius: 8,
          border: `1px solid ${tokens.border}`,
        }}
      >
        <StatItem label="Members" value={stats.count.toLocaleString()} />
        <StatItem label="Avg RAF" value={stats.avg_raf.toFixed(3)} mono />
        <StatItem label="Total Suspects" value={stats.total_suspects.toLocaleString()} color={stats.total_suspects > 0 ? tokens.amber : undefined} />
        <StatItem label="Total Gaps" value={stats.total_gaps.toLocaleString()} color={stats.total_gaps > 0 ? tokens.red : undefined} />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: tokens.textMuted }}>Loading...</div>
      ) : (
        <>
          <MemberTable members={members} sortBy={sortBy} order={order} onSort={handleSort} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                fontSize: 13,
                color: tokens.textSecondary,
              }}
            >
              <span>
                Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total} members
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: `1px solid ${tokens.border}`,
                    background: tokens.surface,
                    color: page <= 1 ? tokens.textMuted : tokens.textSecondary,
                    fontSize: 12,
                    cursor: page <= 1 ? "default" : "pointer",
                    fontFamily: fonts.body,
                  }}
                >
                  Prev
                </button>
                <span style={{ padding: "6px 10px", fontSize: 12 }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: `1px solid ${tokens.border}`,
                    background: tokens.surface,
                    color: page >= totalPages ? tokens.textMuted : tokens.textSecondary,
                    fontSize: 12,
                    cursor: page >= totalPages ? "default" : "pointer",
                    fontFamily: fonts.body,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat item subcomponent                                              */
/* ------------------------------------------------------------------ */

function StatItem({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: mono ? fonts.code : fonts.heading,
          color: color || tokens.text,
        }}
      >
        {value}
      </span>
    </div>
  );
}
