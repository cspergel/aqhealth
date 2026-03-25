import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

interface Suspect {
  id: string;
  condition_name: string;
  icd10_code: string;
  hcc_code: string;
  raf_value: number;
  annual_value: number;
  evidence_summary: string;
  confidence_score: number;
  suspect_type: string;
  status: string;
  dismiss_reason?: string;
}

interface MemberDetailProps {
  memberId: string;
  suspects: Suspect[];
  medications?: { name: string; dx_linked: boolean }[];
  onSuspectUpdated: (suspectId: string, status: string) => void;
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

export function MemberDetail({ memberId, suspects, medications, onSuspectUpdated }: MemberDetailProps) {
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

  const trackInteraction = (type: string, suspectId: string, extra?: Record<string, unknown>) => {
    api.post("/api/learning/track", {
      interaction_type: type,
      target_type: "suspect",
      target_id: parseInt(suspectId) || null,
      page_context: window.location.pathname,
      metadata: { member_id: memberId, ...extra },
    }).catch(() => {});
  };

  const handleCapture = async (suspectId: string) => {
    setActionLoading((prev) => ({ ...prev, [suspectId]: true }));
    try {
      await api.patch(`/api/hcc/suspects/${suspectId}`, { status: "captured" });
      setLocalStatuses((prev) => ({ ...prev, [suspectId]: "captured" }));
      onSuspectUpdated(suspectId, "captured");
      trackInteraction("capture", suspectId);
    } catch {
      // silently fail — user will see no change
    } finally {
      setActionLoading((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleDismiss = async (suspectId: string) => {
    if (!dismissReason.trim()) return;
    setActionLoading((prev) => ({ ...prev, [suspectId]: true }));
    try {
      await api.patch(`/api/hcc/suspects/${suspectId}`, {
        status: "dismissed",
        dismiss_reason: dismissReason.trim(),
      });
      setLocalStatuses((prev) => ({ ...prev, [suspectId]: "dismissed" }));
      onSuspectUpdated(suspectId, "dismissed");
      trackInteraction("dismiss", suspectId, { reason: dismissReason.trim() });
      setDismissingId(null);
      setDismissReason("");
    } catch {
      // silently fail
    } finally {
      setActionLoading((prev) => ({ ...prev, [suspectId]: false }));
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
                      {s.condition_name}
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
                      ICD-10: <span style={{ fontFamily: fonts.code }}>{s.icd10_code}</span>
                    </span>
                    <span>
                      HCC: <span style={{ fontFamily: fonts.code }}>{s.hcc_code}</span>
                    </span>
                    <span>
                      RAF: <span style={{ fontFamily: fonts.code }}>{s.raf_value.toFixed(3)}</span>
                    </span>
                    <span>
                      Annual: <span style={{ fontFamily: fonts.code }}>${s.annual_value.toLocaleString()}</span>
                    </span>
                    <span>
                      Confidence: <span style={{ fontFamily: fonts.code }}>{Math.round(s.confidence_score * 100)}%</span>
                    </span>
                  </div>

                  <div className="text-xs leading-relaxed" style={{ color: tokens.textSecondary }}>
                    {s.evidence_summary}
                  </div>
                </div>

                {/* Action buttons */}
                {!isCaptured && !isDismissed && (
                  <div className="flex items-center gap-2 flex-shrink-0">
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Medication list */}
      {medications && medications.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold mb-2" style={{ color: tokens.textSecondary }}>
            Medication List
          </div>
          <div className="flex flex-wrap gap-2">
            {medications.map((med, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border"
                style={{
                  borderColor: med.dx_linked ? "#bbf7d0" : tokens.border,
                  background: med.dx_linked ? tokens.accentSoft : tokens.surface,
                  color: tokens.textSecondary,
                }}
              >
                <span>{med.name}</span>
                {med.dx_linked ? (
                  <span style={{ color: tokens.accentText, fontSize: 10 }}>Dx-Linked</span>
                ) : (
                  <span style={{ color: tokens.textMuted, fontSize: 10 }}>No Dx</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
