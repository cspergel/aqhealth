import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface WatchlistItem {
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  reason: string | null;
  watch_for: Record<string, boolean> | null;
  last_snapshot: Record<string, any> | null;
  changes_detected: Record<string, { old: any; new: any }> | null;
  last_checked: string | null;
  has_changes: boolean;
  created_at: string;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  member: "Members",
  provider: "Providers",
  group: "Groups",
  facility: "Facilities",
};

/* ------------------------------------------------------------------ */
/* Format change display                                               */
/* ------------------------------------------------------------------ */

function formatChange(key: string, change: { old: any; new: any }): string {
  const oldVal = change.old;
  const newVal = change.new;

  if (typeof oldVal === "number" && typeof newVal === "number") {
    const diff = newVal - oldVal;
    const sign = diff > 0 ? "+" : "";
    if (key === "raf" || key === "projected_raf") {
      return `${key === "projected_raf" ? "Proj. RAF" : "RAF"}: ${oldVal.toFixed(3)} -> ${newVal.toFixed(3)} (${sign}${diff.toFixed(3)})`;
    }
    if (key.includes("rate")) {
      return `${key.replace(/_/g, " ")}: ${oldVal.toFixed(1)}% -> ${newVal.toFixed(1)}% (${sign}${diff.toFixed(1)}pp)`;
    }
    return `${key.replace(/_/g, " ")}: ${oldVal} -> ${newVal} (${sign}${diff})`;
  }

  return `${key.replace(/_/g, " ")}: ${oldVal} -> ${newVal}`;
}

/* ------------------------------------------------------------------ */
/* Navigate helper                                                     */
/* ------------------------------------------------------------------ */

function getEntityPath(type: string, id: number): string {
  switch (type) {
    case "member":
      return `/members`;
    case "provider":
      return `/providers/${id}`;
    case "group":
      return `/groups/${id}`;
    default:
      return "/";
  }
}

/* ------------------------------------------------------------------ */
/* WatchlistPanel                                                      */
/* ------------------------------------------------------------------ */

export function WatchlistPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const loadWatchlist = () => {
    setLoading(true);
    api
      .get("/api/watchlist")
      .then((res) => setItems(res.data))
      .catch((err) => console.error("Failed to load watchlist:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  const handleCheckChanges = () => {
    setChecking(true);
    api
      .post("/api/watchlist/check")
      .then(() => loadWatchlist())
      .catch((err) => console.error("Failed to check changes:", err))
      .finally(() => setChecking(false));
  };

  const handleAcknowledge = (itemId: number) => {
    api
      .patch(`/api/watchlist/${itemId}/acknowledge`)
      .then(() => loadWatchlist())
      .catch((err) => console.error("Failed to acknowledge:", err));
  };

  const handleRemove = (itemId: number) => {
    api
      .delete(`/api/watchlist/${itemId}`)
      .then(() => loadWatchlist())
      .catch((err) => console.error("Failed to remove:", err));
  };

  // Group items by entity type
  const grouped: Record<string, WatchlistItem[]> = {};
  items.forEach((item) => {
    const key = item.entity_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  const changeCount = items.filter((i) => i.has_changes).length;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: fonts.heading,
              color: tokens.text,
            }}
          >
            My Watchlist
          </h2>
          {changeCount > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 9999,
                background: tokens.red,
                color: "#fff",
              }}
            >
              {changeCount} change{changeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={handleCheckChanges}
          disabled={checking}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 12px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
            color: tokens.textSecondary,
            cursor: "pointer",
            fontFamily: fonts.body,
          }}
        >
          {checking ? "Checking..." : "Check for changes"}
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: tokens.textMuted, padding: 20, textAlign: "center" }}>
          Loading watchlist...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: tokens.surfaceAlt,
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>&#x2606;</div>
          <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 4 }}>
            Your watchlist is empty
          </div>
          <div style={{ fontSize: 11, color: tokens.textMuted }}>
            Click the star button on any member, provider, or group to start watching.
          </div>
        </div>
      )}

      {/* Grouped items */}
      {Object.entries(grouped).map(([type, typeItems]) => (
        <div key={type} style={{ marginBottom: 20 }}>
          {/* Group header */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: tokens.textMuted,
              padding: "0 0 6px 0",
              borderBottom: `1px solid ${tokens.borderSoft}`,
              marginBottom: 4,
            }}
          >
            {ENTITY_TYPE_LABELS[type] || type}
          </div>

          {typeItems.map((item) => {
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 12px",
                  borderBottom: `1px solid ${tokens.borderSoft}`,
                  background: item.has_changes ? "#fef2f2" : "transparent",
                  transition: "background 150ms",
                }}
              >
                {/* Item header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {/* Change indicator dot */}
                  {item.has_changes && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: tokens.red,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: tokens.text,
                      flex: 1,
                    }}
                  >
                    {item.entity_name}
                  </span>
                  {item.reason && (
                    <span
                      style={{
                        fontSize: 11,
                        color: tokens.textMuted,
                        maxWidth: 150,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.reason}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: tokens.textMuted,
                      transition: "transform 200ms",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop: 8, paddingLeft: item.has_changes ? 15 : 0 }}>
                    {/* Changes detected */}
                    {item.has_changes && item.changes_detected && (
                      <div style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: tokens.red,
                            marginBottom: 4,
                          }}
                        >
                          Changes detected:
                        </div>
                        {Object.entries(item.changes_detected).map(([key, change]) => (
                          <div
                            key={key}
                            style={{
                              fontSize: 11,
                              color: tokens.textSecondary,
                              padding: "2px 0",
                              fontFamily: fonts.code,
                            }}
                          >
                            {formatChange(key, change)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(getEntityPath(item.entity_type, item.entity_id));
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: `1px solid ${tokens.border}`,
                          background: tokens.surface,
                          color: tokens.text,
                          cursor: "pointer",
                          fontFamily: fonts.body,
                        }}
                      >
                        View
                      </button>
                      {item.has_changes && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcknowledge(item.id);
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: `1px solid ${tokens.accentSoft}`,
                            background: tokens.accentSoft,
                            color: tokens.accentText,
                            cursor: "pointer",
                            fontFamily: fonts.body,
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(item.id);
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: `1px solid ${tokens.borderSoft}`,
                          background: "transparent",
                          color: tokens.textMuted,
                          cursor: "pointer",
                          fontFamily: fonts.body,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
