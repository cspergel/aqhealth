import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";
import { CreateFromInsight } from "../actions/CreateFromInsight";

export interface CareAlertData {
  id: number;
  adt_event_id: number;
  member_id: number | null;
  alert_type: string;
  priority: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  assigned_to: number | null;
  status: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  patient_name: string | null;
  facility_name: string | null;
  event_type: string | null;
  event_timestamp: string | null;
  created_at: string;
}

interface AlertCardProps {
  alert: CareAlertData;
  onAcknowledge: (id: number) => void;
  onResolve: (id: number, notes: string) => void;
  onAssign: (id: number, userId: number) => void;
}

const priorityVariant: Record<string, "default" | "green" | "amber" | "red" | "blue"> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "default",
};

const typeLabel: Record<string, string> = {
  admission: "Admission",
  er_visit: "ER Visit",
  discharge_planning: "Discharge",
  readmission_risk: "Readmission",
  snf_placement: "SNF Placement",
  hcc_opportunity: "HCC Opportunity",
};

const priorityBorder: Record<string, string> = {
  critical: tokens.red,
  high: tokens.amber,
  medium: tokens.blue,
  low: tokens.border,
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertCard({ alert, onAcknowledge, onResolve, onAssign }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");

  return (
    <div
      className="rounded-[10px] border bg-white overflow-hidden transition-all"
      style={{
        borderColor: tokens.border,
        borderLeft: `4px solid ${priorityBorder[alert.priority] || tokens.border}`,
      }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Priority dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: priorityBorder[alert.priority] || tokens.textMuted }}
        />

        {/* Patient name */}
        <span className="text-sm font-semibold shrink-0" style={{ color: tokens.text, minWidth: 140 }}>
          {alert.patient_name || "Unmatched"}
        </span>

        {/* Alert type badge */}
        <Tag variant={priorityVariant[alert.priority] || "default"}>
          {typeLabel[alert.alert_type] || alert.alert_type}
        </Tag>

        {/* Title */}
        <span className="text-sm flex-1 truncate" style={{ color: tokens.textSecondary }}>
          {alert.title}
        </span>

        {/* Time */}
        <span className="text-xs shrink-0" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
          {timeAgo(alert.event_timestamp || alert.created_at)}
        </span>

        {/* Status */}
        <Tag variant={alert.status === "resolved" ? "green" : alert.status === "open" ? "default" : "blue"}>
          {alert.status}
        </Tag>

        {/* Expand chevron */}
        <svg
          className="w-4 h-4 shrink-0 transition-transform"
          style={{
            color: tokens.textMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
          {/* Description */}
          {alert.description && (
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.textMuted }}>
                Description
              </div>
              <div className="text-sm" style={{ color: tokens.textSecondary }}>
                {alert.description}
              </div>
            </div>
          )}

          {/* Recommended action */}
          {alert.recommended_action && (
            <div
              className="mb-3 p-3 rounded-lg"
              style={{ background: tokens.accentSoft, border: `1px solid #bbf7d0` }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.accentText }}>
                Recommended Action
              </div>
              <div className="text-sm" style={{ color: tokens.accentText }}>
                {alert.recommended_action}
              </div>
            </div>
          )}

          {/* Event details */}
          <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: tokens.textMuted }}>
            {alert.facility_name && <span>Facility: {alert.facility_name}</span>}
            {alert.event_type && <span>Event: {alert.event_type}</span>}
            {alert.event_timestamp && (
              <span>Event time: {new Date(alert.event_timestamp).toLocaleString()}</span>
            )}
          </div>

          {/* Resolution notes (if resolved) */}
          {alert.resolution_notes && (
            <div className="mb-3 p-3 rounded-lg" style={{ background: tokens.surfaceAlt }}>
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.textMuted }}>
                Resolution Notes
              </div>
              <div className="text-sm" style={{ color: tokens.textSecondary }}>
                {alert.resolution_notes}
              </div>
            </div>
          )}

          {/* Create Action */}
          <div className="mb-3">
            <CreateFromInsight
              sourceType="alert"
              sourceId={alert.id}
              sourceTitle={alert.title}
              sourceDescription={alert.description || undefined}
            />
          </div>

          {/* Actions */}
          {alert.status !== "resolved" && (
            <div className="flex items-center gap-2 mt-3">
              {alert.status === "open" && (
                <button
                  className="text-xs px-3 py-1.5 rounded-md font-medium border transition-colors hover:bg-stone-50"
                  style={{ borderColor: tokens.border, color: tokens.text }}
                  onClick={() => onAcknowledge(alert.id)}
                >
                  Acknowledge
                </button>
              )}

              <select
                className="text-xs px-2 py-1.5 rounded-md border"
                style={{ borderColor: tokens.border, color: tokens.textSecondary, fontFamily: fonts.body }}
                value={alert.assigned_to || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) onAssign(alert.id, val);
                }}
              >
                <option value="">Assign to...</option>
                <option value={1}>Maria Santos (CM)</option>
                <option value={2}>James Rivera (CM)</option>
                <option value={3}>Lisa Chen (CM)</option>
                <option value={4}>Angela Brooks (CM)</option>
              </select>

              <div className="flex-1" />

              <input
                type="text"
                placeholder="Resolution notes..."
                className="text-xs px-2 py-1.5 rounded-md border flex-1 max-w-[240px]"
                style={{ borderColor: tokens.border, color: tokens.text, fontFamily: fonts.body }}
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
              />
              <button
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-colors"
                style={{ background: tokens.accent }}
                onClick={() => {
                  onResolve(alert.id, resolveNotes);
                  setResolveNotes("");
                }}
              >
                Resolve
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
