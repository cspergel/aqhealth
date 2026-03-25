import { useNavigate } from "react-router-dom";
import { tokens, fonts } from "../../lib/tokens";
import type { MockMember } from "../../lib/mockData";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  members: MockMember[];
  sortBy: string;
  order: string;
  onSort: (field: string) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function rafColor(raf: number): string {
  if (raf < 1) return tokens.accent;
  if (raf <= 1.5) return tokens.text;
  if (raf <= 2.5) return tokens.amber;
  return tokens.red;
}

function daysColor(days: number): string {
  if (days > 180) return tokens.red;
  if (days > 90) return tokens.amber;
  return tokens.textSecondary;
}

function tierTag(tier: string): { bg: string; text: string } {
  switch (tier) {
    case "low": return { bg: tokens.accentSoft, text: tokens.accentText };
    case "rising": return { bg: tokens.amberSoft, text: tokens.amber };
    case "high": return { bg: tokens.redSoft, text: tokens.red };
    case "complex": return { bg: "#f3e8ff", text: "#7c3aed" };
    default: return { bg: tokens.surfaceAlt, text: tokens.textSecondary };
  }
}

function formatDollars(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function daysAgoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

const columns = [
  { key: "name", label: "Name", width: "auto" },
  { key: "dob", label: "DOB", width: 90 },
  { key: "pcp", label: "PCP", width: 130 },
  { key: "group", label: "Group", width: 120 },
  { key: "raf", label: "RAF", width: 70 },
  { key: "risk_tier", label: "Risk", width: 80 },
  { key: "last_visit", label: "Last Visit", width: 120 },
  { key: "suspect_count", label: "Suspects", width: 80 },
  { key: "gap_count", label: "Gaps", width: 70 },
  { key: "spend", label: "12mo Spend", width: 100 },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function MemberTable({ members, sortBy, order, onSort }: Props) {
  const navigate = useNavigate();

  const sortIndicator = (key: string) => {
    if (sortBy !== key) return "";
    return order === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <div
      style={{
        background: tokens.surface,
        borderRadius: 8,
        border: `1px solid ${tokens.border}`,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            fontFamily: fonts.body,
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: sortBy === col.key ? tokens.text : tokens.textMuted,
                    borderBottom: `1px solid ${tokens.border}`,
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    width: col.width,
                    background: tokens.surfaceAlt,
                  }}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: tokens.textMuted,
                    fontSize: 14,
                  }}
                >
                  No members match the current filters.
                </td>
              </tr>
            )}
            {members.map((m) => {
              const tier = tierTag(m.risk_tier);
              return (
                <tr
                  key={m.member_id}
                  style={{
                    borderBottom: `1px solid ${tokens.borderSoft}`,
                    transition: "background 100ms",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surfaceAlt; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  onClick={() => {
                    // Navigate to journey page with member_id number extracted
                    const numId = parseInt(m.member_id.replace("M", ""));
                    navigate(`/journey/${numId}`);
                  }}
                >
                  {/* Name */}
                  <td style={{ padding: "10px 12px", fontWeight: 500, color: tokens.accent }}>
                    {m.name}
                    <div style={{ fontSize: 11, color: tokens.textMuted, fontWeight: 400 }}>{m.member_id}</div>
                  </td>

                  {/* DOB */}
                  <td style={{ padding: "10px 12px", color: tokens.textSecondary, fontSize: 12 }}>
                    {m.dob}
                  </td>

                  {/* PCP */}
                  <td style={{ padding: "10px 12px", color: tokens.textSecondary, fontSize: 12 }}>
                    {m.pcp.replace("Dr. ", "")}
                  </td>

                  {/* Group */}
                  <td style={{ padding: "10px 12px", color: tokens.textSecondary, fontSize: 12 }}>
                    {m.group}
                  </td>

                  {/* RAF */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: fonts.code,
                      fontWeight: 600,
                      fontSize: 13,
                      color: rafColor(m.current_raf),
                    }}
                  >
                    {m.current_raf.toFixed(3)}
                  </td>

                  {/* Risk Tier */}
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background: tier.bg,
                        color: tier.text,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {m.risk_tier}
                    </span>
                  </td>

                  {/* Last Visit */}
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>{m.last_visit_date}</span>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: daysColor(m.days_since_visit),
                      }}
                    >
                      {daysAgoLabel(m.days_since_visit)}
                    </div>
                  </td>

                  {/* Suspects */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: fonts.code,
                      fontWeight: 600,
                      color: m.suspect_count > 0 ? tokens.amber : tokens.textMuted,
                      textAlign: "center",
                    }}
                  >
                    {m.suspect_count}
                  </td>

                  {/* Gaps */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: fonts.code,
                      fontWeight: 600,
                      color: m.gap_count > 0 ? tokens.red : tokens.textMuted,
                      textAlign: "center",
                    }}
                  >
                    {m.gap_count}
                  </td>

                  {/* 12mo Spend */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: fonts.code,
                      fontSize: 12,
                      color: tokens.textSecondary,
                      textAlign: "right",
                    }}
                  >
                    {formatDollars(m.total_spend_12mo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
