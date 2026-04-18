import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/**
 * A single suspect as returned by the backend SuspectOut schema.
 * Field names match GET /api/hcc/suspects/{member_id} response.
 */
interface Suspect {
  id: number;
  hcc_code: number;
  hcc_label: string | null;
  icd10_code: string | null;
  icd10_label: string | null;
  raf_value: number;
  annual_value: number | null;
  evidence_summary: string | null;
  confidence: number | null;
  suspect_type: string;
  status: string;
  dismissed_reason?: string | null;
}

interface MemberDetailProps {
  memberId: number;
  suspects: Suspect[];
  onSuspectUpdated: (suspectId: number, status: string) => void;
}

const typeVariant = (t: string) => {
  switch (t) {
    case "recapture": return "blue" as const;
    case "med_dx_gap": return "amber" as const;
    case "near_miss": return "green" as const;
    default: return "default" as const;
  }
};

const typeLabel = (t: string) => {
  switch (t) {
    case "recapture": return "Recapture";
    case "med_dx_gap": return "Med-Dx Gap";
    case "specificity": return "Specificity";
    case "near_miss": return "Near Miss";
    case "historical": return "Historical";
    default: return t;
  }
};

export function MemberDetail({ memberId, suspects, onSuspectUpdated }: MemberDetailProps) {
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<number, string>>({});
  const [errorByRow, setErrorByRow] = useState<Record<number, string>>({});
  // Remember which action (capture | dismiss) failed on each row + the reason
  // used, so Retry re-runs the same action even if the UI state has changed.
  const [lastFailedAction, setLastFailedAction] = useState<
    Record<number, { type: "capture" } | { type: "dismiss"; reason: string }>
  >({});

  const extractErrorMessage = (err: unknown, fallback: string): string => {
    const e = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
    const detail = e?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (e?.response?.status === 403) return "You don't have permission to save this.";
    if (e?.response?.status === 409) return "This suspect changed — refresh and try again.";
    if (e?.message === "Network Error") return "Can't reach the server. Check your connection.";
    return fallback;
  };

  const trackInteraction = (type: string, suspectId: number, extra?: Record<string, unknown>) => {
    api.post("/api/learning/track", {
      interaction_type: type,
      target_type: "suspect",
      target_id: suspectId,
      page_context: window.location.pathname,
      metadata: { member_id: memberId, ...extra },
    }).catch(() => {});
  };

  const clearRowError = (suspectId: number) => {
    setErrorByRow((prev) => {
      if (!(suspectId in prev)) return prev;
      const next = { ...prev };
      delete next[suspectId];
      return next;
    });
    setLastFailedAction((prev) => {
      if (!(suspectId in prev)) return prev;
      const next = { ...prev };
      delete next[suspectId];
      return next;
    });
  };

  const handleCapture = async (suspectId: number) => {
    setActionLoading((prev) => ({ ...prev, [suspectId]: true }));
    clearRowError(suspectId);
    try {
      await api.patch(`/api/hcc/suspects/${suspectId}`, { status: "captured" });
      setLocalStatuses((prev) => ({ ...prev, [suspectId]: "captured" }));
      onSuspectUpdated(suspectId, "captured");
      trackInteraction("capture", suspectId);
    } catch (err) {
      setErrorByRow((prev) => ({
        ...prev,
        [suspectId]: extractErrorMessage(err, "Could not save. Retry?"),
      }));
      setLastFailedAction((prev) => ({ ...prev, [suspectId]: { type: "capture" } }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleDismiss = async (suspectId: number, overrideReason?: string) => {
    const reason = (overrideReason ?? dismissReason).trim();
    if (!reason) return;
    setActionLoading((prev) => ({ ...prev, [suspectId]: true }));
    clearRowError(suspectId);
    try {
      await api.patch(`/api/hcc/suspects/${suspectId}`, {
        status: "dismissed",
        dismissed_reason: reason,
      });
      setLocalStatuses((prev) => ({ ...prev, [suspectId]: "dismissed" }));
      onSuspectUpdated(suspectId, "dismissed");
      trackInteraction("dismiss", suspectId, { reason });
      setDismissingId(null);
      setDismissReason("");
    } catch (err) {
      setErrorByRow((prev) => ({
        ...prev,
        [suspectId]: extractErrorMessage(err, "Could not dismiss. Retry?"),
      }));
      setLastFailedAction((prev) => ({ ...prev, [suspectId]: { type: "dismiss", reason } }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const retryFailed = (suspectId: number) => {
    const last = lastFailedAction[suspectId];
    if (!last) return;
    if (last.type === "capture") {
      handleCapture(suspectId);
    } else {
      // For dismiss, prefer the current input value (user may have edited
      // the reason after the failure). Fall back to the snapshot only if the
      // panel has been closed. Never use the snapshot when the user is
      // looking at a different reason — that writes a stale dismiss reason
      // to the clinical audit trail.
      const currentReason = dismissReason.trim();
      const reason =
        dismissingId === suspectId && currentReason ? currentReason : last.reason;
      handleDismiss(suspectId, reason);
    }
  };

  return (
    <div className="px-6 py-5" style={{ background: tokens.surfaceAlt }}>
      <div className="text-xs font-semibold mb-3" style={{ color: tokens.textSecondary }}>
        Suspect Conditions for Member {memberId}
      </div>

      <div className="space-y-3">
        {suspects.map((s) => {
          const status = localStatuses[s.id] || s.status;
          const isCaptured = status === "captured";
          const isDismissed = status === "dismissed";

          return (
            <div
              key={s.id}
              className="rounded-lg border p-4"
              style={{
                background: tokens.surface,
                borderColor: isCaptured ? "#bbf7d0" : tokens.border,
                opacity: isDismissed ? 0.5 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold" style={{ color: tokens.text }}>
                      {s.hcc_label ?? `HCC ${s.hcc_code}`}
                    </span>
                    <Tag variant={typeVariant(s.suspect_type)}>{typeLabel(s.suspect_type)}</Tag>
                    {isCaptured && (
                      <span className="text-xs font-medium" style={{ color: tokens.accentText }}>
                        &#10003; Captured
                      </span>
                    )}
                    {isDismissed && (
                      <span className="text-xs font-medium" style={{ color: tokens.textMuted }}>
                        Dismissed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs mb-2" style={{ color: tokens.textSecondary }}>
                    <span>
                      ICD-10: <span style={{ fontFamily: fonts.code }}>{s.icd10_code ?? "--"}</span>
                    </span>
                    <span>
                      HCC: <span style={{ fontFamily: fonts.code }}>{s.hcc_code}</span>
                    </span>
                    <span>
                      RAF: <span style={{ fontFamily: fonts.code }}>{s.raf_value.toFixed(3)}</span>
                    </span>
                    <span>
                      Annual: <span style={{ fontFamily: fonts.code }}>${(s.annual_value ?? 0).toLocaleString()}</span>
                    </span>
                    {s.confidence != null && (
                      <span>
                        Confidence: <span style={{ fontFamily: fonts.code }}>{s.confidence}%</span>
                      </span>
                    )}
                  </div>

                  {s.evidence_summary && (
                    <div className="text-xs leading-relaxed" style={{ color: tokens.textSecondary }}>
                      {s.evidence_summary}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {!isCaptured && !isDismissed && (
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCapture(s.id)}
                      disabled={!!actionLoading[s.id]}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-[6px] transition-opacity disabled:opacity-50"
                      style={{ background: tokens.accent }}
                    >
                      {actionLoading[s.id] ? "..." : "Capture"}
                    </button>
                    {dismissingId === s.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Reason..."
                          value={dismissReason}
                          onChange={(e) => setDismissReason(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleDismiss(s.id)}
                          className="text-xs px-2 py-1.5 rounded border w-36"
                          style={{ borderColor: tokens.border, color: tokens.text }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleDismiss(s.id)}
                          disabled={!dismissReason.trim() || !!actionLoading[s.id]}
                          className="text-xs px-2 py-1.5 rounded border font-medium disabled:opacity-40"
                          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
                        >
                          OK
                        </button>
                        <button
                          onClick={() => { setDismissingId(null); setDismissReason(""); }}
                          className="text-xs px-1 py-1.5"
                          style={{ color: tokens.textMuted }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDismissingId(s.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-[6px] border"
                        style={{ borderColor: tokens.border, color: tokens.textSecondary }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                  {errorByRow[s.id] && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: tokens.red }}>
                      <span>{errorByRow[s.id]}</span>
                      {lastFailedAction[s.id] && (
                        <button
                          onClick={() => retryFailed(s.id)}
                          className="underline font-medium"
                          style={{ color: tokens.red }}
                        >
                          Retry {lastFailedAction[s.id].type === "dismiss" ? "dismiss" : "capture"}
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
