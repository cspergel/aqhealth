import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface CreateFromInsightProps {
  sourceType: "insight" | "alert";
  sourceId: number;
  sourceTitle: string;
  sourceDescription?: string;
  onCreated?: () => void;
}

export function CreateFromInsight({
  sourceType,
  sourceId,
  sourceTitle,
  onCreated,
}: CreateFromInsightProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [assignedToName, setAssignedToName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");

  const handleCreate = () => {
    setCreating(true);
    const endpoint =
      sourceType === "insight"
        ? `/api/actions/from-insight/${sourceId}`
        : `/api/actions/from-alert/${sourceId}`;

    api
      .post(endpoint, {
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        assigned_to_name: assignedToName || null,
      })
      .then(() => {
        setCreated(true);
        setOpen(false);
        onCreated?.();
        // Reset after 3 seconds
        setTimeout(() => setCreated(false), 3000);
      })
      .catch(console.error)
      .finally(() => setCreating(false));
  };

  const assigneeNames: Record<string, string> = {
    "1": "Maria Santos",
    "2": "James Rivera",
    "3": "Lisa Chen",
    "4": "Angela Brooks",
  };

  if (created) {
    return (
      <span
        className="text-[11px] px-2 py-1 rounded font-medium"
        style={{ color: tokens.accentText, background: tokens.accentSoft }}
      >
        Action Created
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="text-[11px] px-2 py-1 rounded border transition-colors hover:bg-stone-50"
        style={{ borderColor: tokens.border, color: tokens.accent }}
      >
        Create Action
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 left-0 rounded-[10px] border bg-white shadow-lg p-4"
          style={{
            borderColor: tokens.border,
            width: 280,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-semibold mb-2" style={{ color: tokens.text }}>
            Create Action from {sourceType === "insight" ? "Insight" : "Alert"}
          </div>

          {/* Preview */}
          <div
            className="text-[11px] p-2 rounded mb-3 truncate"
            style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}
          >
            {sourceTitle}
          </div>

          {/* Assign to */}
          <div className="mb-2">
            <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>
              Assign To
            </label>
            <select
              className="w-full text-xs px-2 py-1.5 rounded-md border mt-0.5"
              style={{ borderColor: tokens.border, color: tokens.textSecondary, fontFamily: fonts.body }}
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setAssignedToName(assigneeNames[e.target.value] || "");
              }}
            >
              <option value="">Unassigned</option>
              <option value="1">Maria Santos (CM)</option>
              <option value="2">James Rivera (CM)</option>
              <option value="3">Lisa Chen (CM)</option>
              <option value="4">Angela Brooks (CM)</option>
            </select>
          </div>

          {/* Priority */}
          <div className="mb-2">
            <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>
              Priority
            </label>
            <select
              className="w-full text-xs px-2 py-1.5 rounded-md border mt-0.5"
              style={{ borderColor: tokens.border, color: tokens.textSecondary, fontFamily: fonts.body }}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Due date */}
          <div className="mb-3">
            <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>
              Due Date
            </label>
            <input
              type="date"
              className="w-full text-xs px-2 py-1.5 rounded-md border mt-0.5"
              style={{ borderColor: tokens.border, color: tokens.text, fontFamily: fonts.body }}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 text-xs px-3 py-1.5 rounded-md font-medium text-white"
              style={{ background: tokens.accent, opacity: creating ? 0.6 : 1 }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs px-3 py-1.5 rounded-md border"
              style={{ borderColor: tokens.border, color: tokens.textMuted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
