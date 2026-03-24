import { useState, useCallback } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";
import { MemberDetail } from "./MemberDetail";

export interface SuspectRow {
  member_id: string;
  member_name: string;
  dob: string;
  pcp: string;
  current_raf: number;
  projected_raf: number;
  uplift: number;
  top_suspects: { condition_name: string; suspect_type: string }[];
  status: string;
  suspect_count: number;
}

interface ChaseListProps {
  rows: SuspectRow[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onDataChanged: () => void;
}

const statusVariant = (s: string) => {
  switch (s) {
    case "open": return "amber" as const;
    case "captured": return "green" as const;
    default: return "default" as const;
  }
};

const typeVariant = (t: string) => {
  switch (t) {
    case "recapture": return "blue" as const;
    case "med_dx_gap": return "amber" as const;
    case "near_miss": return "green" as const;
    default: return "default" as const;
  }
};

export function ChaseList({ rows, page, totalPages, onPageChange, onDataChanged }: ChaseListProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [memberSuspects, setMemberSuspects] = useState<Record<string, any>>({});
  const [loadingMember, setLoadingMember] = useState<string | null>(null);

  const toggleExpand = useCallback(async (memberId: string) => {
    if (expandedMember === memberId) {
      setExpandedMember(null);
      return;
    }

    setExpandedMember(memberId);

    if (!memberSuspects[memberId]) {
      setLoadingMember(memberId);
      try {
        const res = await api.get(`/api/hcc/suspects/${memberId}`);
        setMemberSuspects((prev) => ({ ...prev, [memberId]: res.data }));
      } catch {
        // fail silently
      } finally {
        setLoadingMember(null);
      }
    }
  }, [expandedMember, memberSuspects]);

  const handleSuspectUpdated = useCallback((_suspectId: string, _status: string) => {
    // Refresh parent data after a capture/dismiss
    onDataChanged();
  }, [onDataChanged]);

  return (
    <div>
      {/* Table */}
      <div
        className="rounded-[10px] border overflow-hidden"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <table className="w-full text-left">
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              {["Member Name", "DOB", "PCP", "Current RAF", "Projected RAF", "Uplift", "Top Suspects", "Status"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3"
                    style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <>
                <tr
                  key={row.member_id}
                  onClick={() => toggleExpand(row.member_id)}
                  className="cursor-pointer transition-colors hover:bg-stone-50"
                  style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}
                >
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: tokens.text }}>
                    {row.member_name}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                    {row.dob}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: tokens.textSecondary }}>
                    {row.pcp}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ fontFamily: fonts.code, color: tokens.text }}>
                    {row.current_raf.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    {row.projected_raf.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    +{row.uplift.toFixed(3)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.top_suspects.slice(0, 3).map((s, i) => (
                        <Tag key={i} variant={typeVariant(s.suspect_type)}>
                          {s.condition_name.length > 20
                            ? s.condition_name.slice(0, 18) + "..."
                            : s.condition_name}
                        </Tag>
                      ))}
                      {row.suspect_count > 3 && (
                        <Tag>+{row.suspect_count - 3}</Tag>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Tag variant={statusVariant(row.status)}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </Tag>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {expandedMember === row.member_id && (
                  <tr key={`${row.member_id}-detail`}>
                    <td colSpan={8} className="p-0" style={{ borderBottom: `1px solid ${tokens.border}` }}>
                      {loadingMember === row.member_id ? (
                        <div className="px-6 py-8 text-center text-xs" style={{ color: tokens.textMuted }}>
                          Loading member details...
                        </div>
                      ) : memberSuspects[row.member_id] ? (
                        <MemberDetail
                          memberId={row.member_id}
                          suspects={memberSuspects[row.member_id].suspects || []}
                          medications={memberSuspects[row.member_id].medications}
                          onSuspectUpdated={handleSuspectUpdated}
                        />
                      ) : (
                        <div className="px-6 py-8 text-center text-xs" style={{ color: tokens.textMuted }}>
                          Unable to load details.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: tokens.textMuted }}>
                  No suspects match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="text-xs" style={{ color: tokens.textMuted }}>
            Page <span style={{ fontFamily: fonts.code }}>{page}</span> of{" "}
            <span style={{ fontFamily: fonts.code }}>{totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-30"
              style={{ borderColor: tokens.border, color: tokens.textSecondary }}
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className="w-8 h-8 text-xs rounded font-medium"
                  style={{
                    background: page === pageNum ? tokens.accent : "transparent",
                    color: page === pageNum ? "#fff" : tokens.textSecondary,
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs rounded border disabled:opacity-30"
              style={{ borderColor: tokens.border, color: tokens.textSecondary }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
