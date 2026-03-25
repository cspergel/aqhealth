import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface AddToWatchlistButtonProps {
  entityType: string;
  entityId: number;
  entityName: string;
}

const WATCH_OPTIONS = [
  { key: "raf_change", label: "RAF changes" },
  { key: "new_admission", label: "New admission" },
  { key: "gap_closed", label: "Gap closed" },
  { key: "gap_opened", label: "New gap opened" },
  { key: "suspect_captured", label: "Suspect captured" },
  { key: "capture_rate_change", label: "Capture rate change" },
];

/* ------------------------------------------------------------------ */
/* AddToWatchlistButton                                                */
/* ------------------------------------------------------------------ */

export function AddToWatchlistButton({
  entityType,
  entityId,
  entityName,
}: AddToWatchlistButtonProps) {
  const [isOnWatchlist, setIsOnWatchlist] = useState(false);
  const [watchlistItemId, setWatchlistItemId] = useState<number | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [reason, setReason] = useState("");
  const [watchFor, setWatchFor] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Check if already on watchlist
  useEffect(() => {
    api
      .get("/api/watchlist")
      .then((res) => {
        const items = res.data as Array<{
          id: number;
          entity_type: string;
          entity_id: number;
        }>;
        const existing = items.find(
          (i) => i.entity_type === entityType && i.entity_id === entityId
        );
        if (existing) {
          setIsOnWatchlist(true);
          setWatchlistItemId(existing.id);
        }
      })
      .catch(() => {});
  }, [entityType, entityId]);

  const handleAdd = () => {
    setSubmitting(true);
    api
      .post("/api/watchlist", {
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        reason: reason.trim() || null,
        watch_for: Object.keys(watchFor).length > 0 ? watchFor : null,
      })
      .then((res) => {
        setIsOnWatchlist(true);
        setWatchlistItemId(res.data.id);
        setShowPopover(false);
        setReason("");
        setWatchFor({});
      })
      .catch((err) => console.error("Failed to add to watchlist:", err))
      .finally(() => setSubmitting(false));
  };

  const handleRemove = () => {
    if (!watchlistItemId) return;
    api
      .delete(`/api/watchlist/${watchlistItemId}`)
      .then(() => {
        setIsOnWatchlist(false);
        setWatchlistItemId(null);
        setShowPopover(false);
      })
      .catch((err) => console.error("Failed to remove from watchlist:", err));
  };

  const toggleWatchFor = (key: string) => {
    setWatchFor((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
  };

  // Filter watch options based on entity type
  const relevantOptions =
    entityType === "provider"
      ? WATCH_OPTIONS.filter((o) =>
          ["capture_rate_change", "new_admission"].includes(o.key)
        )
      : entityType === "group"
        ? WATCH_OPTIONS.filter((o) =>
            ["capture_rate_change", "gap_closed"].includes(o.key)
          )
        : WATCH_OPTIONS.filter((o) =>
            ["raf_change", "new_admission", "gap_closed", "gap_opened", "suspect_captured"].includes(o.key)
          );

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => {
          if (isOnWatchlist) {
            handleRemove();
          } else {
            setShowPopover(!showPopover);
          }
        }}
        title={isOnWatchlist ? "Remove from watchlist" : "Add to watchlist"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 500,
          border: `1px solid ${isOnWatchlist ? tokens.amberSoft : tokens.border}`,
          borderRadius: 6,
          background: isOnWatchlist ? tokens.amberSoft : "transparent",
          color: isOnWatchlist ? tokens.amber : tokens.textSecondary,
          cursor: "pointer",
          fontFamily: fonts.body,
          transition: "all 150ms",
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>
          {isOnWatchlist ? "\u2605" : "\u2606"}
        </span>
        <span style={{ fontSize: 11 }}>
          {isOnWatchlist ? "Watching" : "Watch"}
        </span>
      </button>

      {/* Popover */}
      {showPopover && !isOnWatchlist && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowPopover(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              width: 260,
              background: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              zIndex: 100,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: tokens.text,
                marginBottom: 8,
              }}
            >
              Add to Watchlist
            </div>

            {/* Reason input */}
            <input
              type="text"
              placeholder="Why are you watching? (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: "100%",
                fontSize: 11,
                padding: "6px 8px",
                border: `1px solid ${tokens.border}`,
                borderRadius: 4,
                fontFamily: fonts.body,
                color: tokens.text,
                background: tokens.surface,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />

            {/* Watch-for checkboxes */}
            <div style={{ fontSize: 11, fontWeight: 600, color: tokens.textSecondary, marginBottom: 4 }}>
              Alert me when:
            </div>
            {relevantOptions.map((opt) => (
              <label
                key={opt.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: tokens.textSecondary,
                  padding: "2px 0",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!watchFor[opt.key]}
                  onChange={() => toggleWatchFor(opt.key)}
                  style={{ margin: 0, cursor: "pointer" }}
                />
                {opt.label}
              </label>
            ))}

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={submitting}
              style={{
                width: "100%",
                marginTop: 10,
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 0",
                borderRadius: 6,
                border: "none",
                background: tokens.accent,
                color: "#fff",
                cursor: "pointer",
                fontFamily: fonts.body,
              }}
            >
              {submitting ? "Adding..." : "Add to Watchlist"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
