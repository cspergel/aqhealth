import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { ActionCard, type ActionItemData } from "../components/actions/ActionCard";

type StatusFilter = "all" | "open" | "in_progress" | "completed" | "cancelled";
type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";

interface ActionStats {
  total: number;
  open: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  completion_rate: number;
}

export function ActionsPage() {
  const [actions, setActions] = useState<ActionItemData[]>([]);
  const [stats, setStats] = useState<ActionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [showCreate, setShowCreate] = useState(false);

  const loadData = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter !== "all") params.status = statusFilter;
    if (priorityFilter !== "all") params.priority = priorityFilter;
    const qs = new URLSearchParams(params).toString();

    Promise.all([
      api.get(`/api/actions${qs ? `?${qs}` : ""}`),
      api.get("/api/actions/stats"),
    ])
      .then(([aRes, sRes]) => {
        setActions(Array.isArray(aRes.data) ? aRes.data : aRes.data?.items || []);
        setStats(sRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter]);

  const handleUpdate = (id: number, updates: Record<string, any>) => {
    api
      .patch(`/api/actions/${id}`, updates)
      .then(() => loadData())
      .catch(console.error);
  };

  const handleCreate = (data: Record<string, any>) => {
    api
      .post("/api/actions", data)
      .then(() => {
        setShowCreate(false);
        loadData();
      })
      .catch(console.error);
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13,
    padding: "6px 14px",
    borderRadius: 8,
    fontWeight: active ? 600 : 400,
    color: active ? tokens.text : tokens.textMuted,
    background: active ? tokens.surface : "transparent",
    border: active ? `1px solid ${tokens.border}` : "1px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: fonts.body,
  });

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: 22,
              fontWeight: 700,
              color: tokens.text,
              marginBottom: 4,
            }}
          >
            Actions
          </h1>
          <p style={{ fontSize: 13, color: tokens.textSecondary }}>
            Track actions from insights, alerts, and manual entries. Close the loop from insight to outcome.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs px-4 py-2 rounded-lg font-medium text-white"
          style={{ background: tokens.accent }}
        >
          Create Action
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <MetricCard
            label="Open"
            value={String(stats.open)}
            trend={stats.overdue > 0 ? `${stats.overdue} overdue` : undefined}
            trendDirection={stats.overdue > 0 ? "down" : undefined}
          />
          <MetricCard label="In Progress" value={String(stats.in_progress)} />
          <MetricCard label="Completed" value={String(stats.completed)} trendDirection="up" />
          <MetricCard label="Completion Rate" value={`${stats.completion_rate}%`} />
          <MetricCard
            label="Overdue"
            value={String(stats.overdue)}
            trendDirection={stats.overdue > 0 ? "down" : "flat"}
          />
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateActionForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center gap-1 mr-4">
          {(["all", "open", "in_progress", "completed", "cancelled"] as StatusFilter[]).map((s) => (
            <button key={s} style={tabStyle(statusFilter === s)} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <select
          className="text-xs px-2 py-1.5 rounded-md border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary, fontFamily: fonts.body }}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Action list */}
      {loading && actions.length === 0 ? (
        <div className="text-sm" style={{ color: tokens.textMuted }}>Loading...</div>
      ) : actions.length === 0 ? (
        <div
          className="rounded-[10px] border p-8 text-center"
          style={{ borderColor: tokens.border, background: tokens.surface }}
        >
          <div className="text-sm" style={{ color: tokens.textMuted }}>
            No actions found matching your filters.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateActionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [actionType, setActionType] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [assignedToName, setAssignedToName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title,
      description: description || null,
      action_type: actionType,
      priority,
      assigned_to_name: assignedToName || null,
      due_date: dueDate || null,
      expected_impact: expectedImpact || null,
      source_type: "manual",
    });
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    color: tokens.text,
    fontFamily: fonts.body,
    width: "100%",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[10px] border bg-white p-5 mb-5"
      style={{ borderColor: tokens.border }}
    >
      <div className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>
        Create New Action
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Title *</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Action title..." />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Assigned To</label>
          <input style={inputStyle} value={assignedToName} onChange={(e) => setAssignedToName(e.target.value)} placeholder="Assignee name..." />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the action..."
        />
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Type</label>
          <select style={inputStyle} value={actionType} onChange={(e) => setActionType(e.target.value)}>
            <option value="outreach">Outreach</option>
            <option value="scheduling">Scheduling</option>
            <option value="coding_education">Coding Education</option>
            <option value="referral">Referral</option>
            <option value="care_plan">Care Plan</option>
            <option value="investigation">Investigation</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Priority</label>
          <select style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Due Date</label>
          <input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase" style={{ color: tokens.textMuted }}>Expected Impact</label>
          <input style={inputStyle} value={expectedImpact} onChange={(e) => setExpectedImpact(e.target.value)} placeholder="e.g. $50K savings" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="text-xs px-4 py-2 rounded-lg font-medium text-white"
          style={{ background: tokens.accent }}
        >
          Create Action
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-4 py-2 rounded-lg font-medium border"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
