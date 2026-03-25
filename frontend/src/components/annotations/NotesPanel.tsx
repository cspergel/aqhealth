import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { FollowUpBadge } from "./FollowUpBadge";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Annotation {
  id: number;
  entity_type: string;
  entity_id: number;
  content: string;
  note_type: string;
  author_id: number;
  author_name: string;
  requires_follow_up: boolean;
  follow_up_date: string | null;
  follow_up_completed: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

const NOTE_TYPES = [
  { value: "general", label: "General" },
  { value: "call_log", label: "Call Log" },
  { value: "outreach", label: "Outreach" },
  { value: "clinical", label: "Clinical" },
  { value: "care_plan", label: "Care Plan" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "internal", label: "Internal" },
];

const NOTE_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  general: { color: tokens.textSecondary, bg: tokens.surfaceAlt },
  call_log: { color: tokens.blue, bg: tokens.blueSoft },
  outreach: { color: tokens.amber, bg: tokens.amberSoft },
  clinical: { color: tokens.accentText, bg: tokens.accentSoft },
  care_plan: { color: "#7c3aed", bg: "#f3e8ff" },
  follow_up: { color: tokens.amber, bg: tokens.amberSoft },
  internal: { color: tokens.textMuted, bg: tokens.surfaceAlt },
};

/* ------------------------------------------------------------------ */
/* Time-ago helper                                                     */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* NotesPanel                                                          */
/* ------------------------------------------------------------------ */

interface NotesPanelProps {
  entityType: string;
  entityId: number;
}

export function NotesPanel({ entityType, entityId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Add note form state
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [followUpDate, setFollowUpDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadNotes = () => {
    setLoading(true);
    api
      .get("/api/annotations", { params: { entity_type: entityType, entity_id: entityId } })
      .then((res) => setNotes(res.data))
      .catch((err) => console.error("Failed to load notes:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotes();
  }, [entityType, entityId]);

  const handleAddNote = () => {
    if (!content.trim()) return;
    setSubmitting(true);
    api
      .post("/api/annotations", {
        entity_type: entityType,
        entity_id: entityId,
        content: content.trim(),
        note_type: noteType,
        follow_up_date: followUpDate || null,
      })
      .then(() => {
        setContent("");
        setNoteType("general");
        setFollowUpDate("");
        loadNotes();
      })
      .catch((err) => console.error("Failed to add note:", err))
      .finally(() => setSubmitting(false));
  };

  const handlePin = (id: number, currentlyPinned: boolean) => {
    api
      .patch(`/api/annotations/${id}`, { is_pinned: !currentlyPinned })
      .then(() => loadNotes())
      .catch((err) => console.error("Failed to pin:", err));
  };

  const handleCompleteFollowUp = (id: number) => {
    api
      .patch(`/api/annotations/${id}`, { follow_up_completed: true })
      .then(() => loadNotes())
      .catch((err) => console.error("Failed to complete follow-up:", err));
  };

  const handleDelete = (id: number) => {
    api
      .delete(`/api/annotations/${id}`)
      .then(() => loadNotes())
      .catch((err) => console.error("Failed to delete:", err));
  };

  const noteCount = notes.length;

  return (
    <div
      style={{
        border: `1px solid ${tokens.border}`,
        borderRadius: 10,
        background: tokens.surface,
        overflow: "hidden",
      }}
    >
      {/* Header / collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: fonts.body,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>
            Notes
          </span>
          {noteCount > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                padding: "2px 7px",
                borderRadius: 9999,
                background: tokens.surfaceAlt,
                color: tokens.textSecondary,
              }}
            >
              {noteCount}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            transition: "transform 200ms",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
          {/* Add note form */}
          <div
            style={{
              padding: "12px 16px",
              background: "#fffbf0",
              borderBottom: `1px solid ${tokens.borderSoft}`,
            }}
          >
            <textarea
              placeholder="Add a note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: "100%",
                minHeight: 60,
                padding: "8px 10px",
                fontSize: 12,
                fontFamily: fonts.body,
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                resize: "vertical",
                background: tokens.surface,
                color: tokens.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 4,
                  background: tokens.surface,
                  color: tokens.text,
                  fontFamily: fonts.body,
                  cursor: "pointer",
                }}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                placeholder="Follow-up date"
                title="Follow-up date (optional)"
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 4,
                  background: tokens.surface,
                  color: followUpDate ? tokens.text : tokens.textMuted,
                  fontFamily: fonts.body,
                }}
              />

              <button
                onClick={handleAddNote}
                disabled={!content.trim() || submitting}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: content.trim() ? tokens.accent : tokens.surfaceAlt,
                  color: content.trim() ? "#fff" : tokens.textMuted,
                  cursor: content.trim() ? "pointer" : "default",
                  fontFamily: fonts.body,
                }}
              >
                {submitting ? "Saving..." : "Add Note"}
              </button>
            </div>
          </div>

          {/* Notes list */}
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: 16, fontSize: 12, color: tokens.textMuted, textAlign: "center" }}>
                Loading notes...
              </div>
            )}
            {!loading && notes.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: tokens.textMuted, textAlign: "center" }}>
                No notes yet. Add the first one above.
              </div>
            )}
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                onPin={() => handlePin(note.id, note.is_pinned)}
                onCompleteFollowUp={() => handleCompleteFollowUp(note.id)}
                onDelete={() => handleDelete(note.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual note item                                                */
/* ------------------------------------------------------------------ */

function NoteItem({
  note,
  onPin,
  onCompleteFollowUp,
  onDelete,
}: {
  note: Annotation;
  onPin: () => void;
  onCompleteFollowUp: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const typeStyle = NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.general;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 16px",
        borderBottom: `1px solid ${tokens.borderSoft}`,
        background: note.is_pinned ? "#fefce8" : "transparent",
        transition: "background 150ms",
      }}
    >
      {/* Header row: author, time, type badge, pin */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        {note.is_pinned && (
          <span style={{ fontSize: 10, color: tokens.amber }} title="Pinned">
            &#x1F4CC;
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tokens.text,
          }}
        >
          {note.author_name}
        </span>
        <span style={{ fontSize: 10, color: tokens.textMuted }}>
          {timeAgo(note.created_at)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 4,
            color: typeStyle.color,
            background: typeStyle.bg,
            lineHeight: 1.4,
          }}
        >
          {NOTE_TYPES.find((t) => t.value === note.note_type)?.label || note.note_type}
        </span>
        {note.requires_follow_up && (
          <FollowUpBadge
            followUpDate={note.follow_up_date}
            followUpCompleted={note.follow_up_completed}
          />
        )}

        {/* Actions (shown on hover) */}
        {hovered && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <ActionBtn
              label={note.is_pinned ? "Unpin" : "Pin"}
              onClick={onPin}
            />
            {note.requires_follow_up && !note.follow_up_completed && (
              <ActionBtn
                label="Complete"
                onClick={onCompleteFollowUp}
              />
            )}
            <ActionBtn label="Delete" onClick={onDelete} danger />
          </div>
        )}
      </div>

      {/* Content */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: tokens.textSecondary,
          whiteSpace: "pre-wrap",
        }}
      >
        {note.content}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiny action button                                                  */
/* ------------------------------------------------------------------ */

function ActionBtn({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        fontSize: 10,
        padding: "2px 6px",
        borderRadius: 4,
        border: `1px solid ${danger ? tokens.redSoft : tokens.border}`,
        background: "transparent",
        color: danger ? tokens.red : tokens.textSecondary,
        cursor: "pointer",
        fontFamily: fonts.body,
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  );
}
