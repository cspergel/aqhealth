import { useState, useEffect, useCallback } from "react";
import { tokens, fonts } from "../lib/tokens";
import api from "../lib/api";
import { UniversalFilterBuilder, type FilterConditions } from "../components/filters/UniversalFilterBuilder";
import type { SavedFilter } from "../components/filters/SavedFiltersList";
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
/* Page Component                                                      */
/* ------------------------------------------------------------------ */

export function MembersPage() {
  const [filterConditions, setFilterConditions] = useState<FilterConditions | null>(null);
  const [sortBy, setSortBy] = useState("raf");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const [members, setMembers] = useState<MockMember[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<MemberStats>({ count: 0, avg_raf: 0, total_suspects: 0, total_gaps: 0 });
  const [loading, setLoading] = useState(true);

  // Saved filters state
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  // Fetch saved filters on mount
  useEffect(() => {
    api
      .get("/api/filters", { params: { context: "members" } })
      .then((res) => setSavedFilters(res.data as SavedFilter[]))
      .catch(() => {});
  }, []);

  /* Build query params from current state */
  const buildParams = useCallback(() => {
    const params: Record<string, string> = {
      sort_by: sortBy,
      order,
      page: String(page),
      page_size: "25",
    };
    if (search) params.search = search;
    if (filterConditions) {
      params.conditions = JSON.stringify(filterConditions);
    }
    return params;
  }, [filterConditions, sortBy, order, page, search]);

  /* Fetch member list and stats */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = buildParams();

    Promise.allSettled([
      api.get<MemberListResponse>("/api/members", { params }),
      api.get<MemberStats>("/api/members/stats", { params }),
    ]).then(([listRes, statsRes]) => {
      if (cancelled) return;
      if (listRes.status === "fulfilled" && listRes.value.data) {
        const data = listRes.value.data;
        setMembers(data.items ?? []);
        setTotalPages(data.total_pages ?? 1);
        setTotal(data.total ?? 0);
      } else {
        setMembers([]);
        setTotalPages(1);
        setTotal(0);
      }
      if (statsRes.status === "fulfilled" && statsRes.value.data) {
        setStats(statsRes.value.data);
      }
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

  /* Handle filter apply from UniversalFilterBuilder */
  const handleFilterApply = (conditions: FilterConditions | null) => {
    setFilterConditions(conditions);
    setPage(1);
  };

  /* Handle save filter */
  const handleSaveFilter = (
    name: string,
    description: string,
    conditions: FilterConditions,
    isShared: boolean
  ) => {
    api
      .post("/api/filters", {
        name,
        description: description || null,
        page_context: "members",
        conditions,
        is_shared: isShared,
      })
      .then((res) => {
        const newFilter = res.data as SavedFilter;
        setSavedFilters((prev) => [...prev, newFilter]);
      })
      .catch(() => {});
  };

  /* Handle delete filter */
  const handleDeleteFilter = (filterId: number) => {
    api
      .delete(`/api/filters/${filterId}`)
      .then(() => {
        setSavedFilters((prev) => prev.filter((f) => f.id !== filterId));
      })
      .catch(() => {});
  };

  /* Export CSV */
  const handleExport = () => {
    const header = "Member ID,Name,DOB,PCP,Group,RAF,Risk Tier,Last Visit,Days Since Visit,ER Visits 12mo,Admissions 12mo,SNF Days 12mo,Suspects,Gaps,12mo Spend,Plan\n";
    const rows = members.map((m) =>
      `${m.member_id},"${m.name}",${m.dob},"${m.pcp}","${m.group}",${m.current_raf},${m.risk_tier},${m.last_visit_date},${m.days_since_visit},${m.er_visits_12mo},${m.admissions_12mo},${m.snf_days_12mo},${m.suspect_count},${m.gap_count},${m.total_spend_12mo},"${m.plan}"`
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
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name or ID..."
            style={{
              width: 200,
              padding: "7px 12px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              fontSize: 13,
              fontFamily: fonts.body,
              outline: "none",
              background: tokens.surface,
            }}
          />
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
      </div>

      {/* Universal Filter Builder (replaces old MemberFilters) */}
      <UniversalFilterBuilder
        pageContext="members"
        onApply={handleFilterApply}
        savedFilters={savedFilters}
        onSaveFilter={handleSaveFilter}
        onDeleteFilter={handleDeleteFilter}
      />

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
        <StatItem label="Members" value={(stats.count ?? 0).toLocaleString()} />
        <StatItem label="Avg RAF" value={(stats.avg_raf ?? 0).toFixed(3)} mono />
        <StatItem label="Total Suspects" value={(stats.total_suspects ?? 0).toLocaleString()} color={(stats.total_suspects ?? 0) > 0 ? tokens.amber : undefined} />
        <StatItem label="Total Gaps" value={(stats.total_gaps ?? 0).toLocaleString()} color={(stats.total_gaps ?? 0) > 0 ? tokens.red : undefined} />
        {filterConditions && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: tokens.accentText,
                background: tokens.accentSoft,
                padding: "3px 10px",
                borderRadius: 9999,
              }}
            >
              Filtered: {filterConditions.rules.length} rule{filterConditions.rules.length > 1 ? "s" : ""} ({filterConditions.logic})
            </span>
          </div>
        )}
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
