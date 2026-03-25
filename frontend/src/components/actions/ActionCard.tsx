import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

export interface ActionItemData {
  id: number;
  source_type: string | null;
  source_id: number | null;
  title: string;
  description: string | null;
  action_type: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  member_id: number | null;
  provider_id: number | null;
  group_id: number | null;
  expected_impact: string | null;
  actual_outcome: string | null;
  outcome_measured: boolean;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ActionCardProps {
  action: ActionItemData;
  onUpdate: (id: number, updates: Record<string, any>) => void;
}

const priorityBorder: Record<string, string> = {
  critical: tokens.red,
  high: tokens.amber,
  medium: tokens.blue,
  low: tokens.border,
};

const priorityVariant: Record<string, "default" | "green" | "amber" | "red" | "blue"> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "default",
};

const statusVariant: Record<string, "default" | "green" | "amber" | "red" | "blue"> = {
  open: "default",
  in_progress: "blue",
  completed: "green",
  cancelled: "red",
};

const sourceLabel: Record<string, string> = {
  insight: "Insight",
  alert: "Alert",
  report: "Report",
  manual: "Manual",
  discovery: "Discovery",
};

const sourceVariant: Record<string, "default" | "green" | "amber" | "red" | "blue"> = {
  insight: "amber",
  alert: "red",
  report: "blue",
  manual: "default",
  discovery: "green",
};

const actionTypeLabel: Record<string, string> = {
  outreach: "Outreach",
  scheduling: "Scheduling",
  coding_education: "Coding Education",
  referral: "Referral",
  care_plan: "Care Plan",
  investigation: "Investigation",
  other: "Other",
};

function daysUntilDue(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d remaining`;
}

export function ActionCard({ action, onUpdate }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [outcomeText, setOutcomeText] = useState("");
  const [resolutionText, setResolutionText] = useState("");

  const isOverdue =
    action.due_date &&
    (action.status === "open" || action.status === "in_progress") &&
    new Date(action.due_date) < new Date();

  return (
    <div
      className="rounded-[10px] border bg-white overflow-hidden transition-all"
      style={{
        borderColor: tokens.border,
        borderLeft: `4px solid ${priorityBorder[action.priority] || tokens.border}`,
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
          style={{ background: priorityBorder[action.priority] || tokens.textMuted }}
        />

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: tokens.text }}>
            {action.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {action.assigned_to_name && (
              <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                {action.assigned_to_name}
              </span>
            )}
            {action.due_date && (
              <span
                className="text-[11px]"
                style={{ color: isOverdue ? tokens.red : tokens.textMuted }}
              >
                {daysUntilDue(action.due_date)}
              </span>
            )}
          </div>
        </div>

        {/* Source badge */}
        <Tag variant={sourceVariant[action.source_type || "manual"] || "default"}>
          {sourceLabel[action.source_type || "manual"] || "Manual"}
        </Tag>

        {/* Type */}
        <span className="text-[11px] shrink-0" style={{ color: tokens.textMuted }}>
          {actionTypeLabel[action.action_type] || action.action_type}
        </span>

        {/* Priority */}
        <Tag variant={priorityVariant[action.priority] || "default"}>
          {action.priority}
        </Tag>

        {/* Status */}
        <Tag variant={statusVariant[action.status] || "default"}>
          {action.status === "in_progress" ? "In Progress" : action.status.charAt(0).toUpperCase() + action.status.slice(1)}
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
          {action.description && (
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.textMuted }}>
                Description
              </div>
              <div className="text-sm" style={{ color: tokens.textSecondary }}>
                {action.description}
              </div>
            </div>
          )}

          {/* Expected impact */}
          {action.expected_impact && (
            <div
              className="mb-3 p-3 rounded-lg"
              style={{ background: tokens.accentSoft, border: "1px solid #bbf7d0" }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.accentText }}>
                Expected Impact
              </div>
              <div className="text-sm font-medium" style={{ color: tokens.accentText }}>
                {action.expected_impact}
              </div>
            </div>
          )}

          {/* Actual outcome (if completed) */}
          {action.actual_outcome && (
            <div className="mb-3 p-3 rounded-lg" style={{ background: tokens.blueSoft, border: "1px solid #bfdbfe" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: "#1e40af" }}>
                Actual Outcome
              </div>
              <div className="text-sm" style={{ color: "#1e40af" }}>
                {action.actual_outcome}
              </div>
            </div>
          )}

          {/* Resolution notes */}
          {action.resolution_notes && (
            <div className="mb-3 p-3 rounded-lg" style={{ background: tokens.surfaceAlt }}>
              <div className="text-xs font-semibold mb-1" style={{ color: tokens.textMuted }}>
                Resolution Notes
              </div>
              <div className="text-sm" style={{ color: tokens.textSecondary }}>
                {action.resolution_notes}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: tokens.textMuted }}>
            {action.due_date && <span>Due: {action.due_date}</span>}
            {action.completed_date && <span>Completed: {action.completed_date}</span>}
            <span>Created: {new Date(action.created_at).toLocaleDateString()}</span>
          </div>

          {/* Actions */}
          {action.status !== "completed" && action.status !== "cancelled" && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Status workflow buttons */}
              {action.status === "open" && (
                <button
                  className="text-xs px-3 py-1.5 rounded-md font-medium border transition-colors hover:bg-stone-50"
                  style={{ borderColor: tokens.border, color: tokens.text }}
                  onClick={() => onUpdate(action.id, { status: "in_progress" })}
                >
                  Start Working
                </button>
              )}

              {/* Assign */}
              <select
                className="text-xs px-2 py-1.5 rounded-md border"
                style={{ borderColor: tokens.border, color: tokens.textSecondary, fontFamily: fonts.body }}
                value={action.assigned_to || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  const names: Record<number, string> = { 1: "Maria Santos", 2: "James Rivera", 3: "Lisa Chen", 4: "Angela Brooks" };
                  if (!isNaN(val)) onUpdate(action.id, { assigned_to: val, assigned_to_name: names[val] || "" });
                }}
              >
                <option value="">Assign to...</option>
                <option value={1}>Maria Santos</option>
                <option value={2}>James Rivera</option>
                <option value={3}>Lisa Chen</option>
                <option value={4}>Angela Brooks</option>
              </select>

              <div className="flex-1" />

              {/* Outcome + resolve */}
              <input
                type="text"
                placeholder="Actual outcome..."
                className="text-xs px-2 py-1.5 rounded-md border flex-1 max-w-[200px]"
                style={{ borderColor: tokens.border, color: tokens.text, fontFamily: fonts.body }}
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
              />
              <input
                type="text"
                placeholder="Resolution notes..."
                className="text-xs px-2 py-1.5 rounded-md border flex-1 max-w-[200px]"
                style={{ borderColor: tokens.border, color: tokens.text, fontFamily: fonts.body }}
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
              />
              <button
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-colors"
                style={{ background: tokens.accent }}
                onClick={() => {
                  const updates: Record<string, any> = { status: "completed" };
                  if (outcomeText) updates.actual_outcome = outcomeText;
                  if (resolutionText) updates.resolution_notes = resolutionText;
                  onUpdate(action.id, updates);
                  setOutcomeText("");
                  setResolutionText("");
                }}
              >
                Complete
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded-md font-medium border transition-colors hover:bg-stone-50"
                style={{ borderColor: tokens.border, color: tokens.textMuted }}
                onClick={() => onUpdate(action.id, { status: "cancelled" })}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
