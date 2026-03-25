import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { AlertCard, type CareAlertData } from "../components/alerts/AlertCard";

type StatusFilter = "open" | "acknowledged" | "in_progress" | "resolved" | "all";
type PriorityFilter = "critical" | "high" | "medium" | "low" | "all";

export function AlertsPage() {
  const [alerts, setAlerts] = useState<CareAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");

  const loadAlerts = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter !== "all") params.status = statusFilter;
    if (priorityFilter !== "all") params.priority = priorityFilter;
    if (typeFilter) params.alert_type = typeFilter;

    const qs = new URLSearchParams(params).toString();
    api
      .get(`/api/adt/alerts${qs ? `?${qs}` : ""}`)
      .then((res) => setAlerts(res.data))
      .catch((err) => console.error("Failed to load alerts:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, priorityFilter, typeFilter]);

  const handleAcknowledge = (id: number) => {
    api
      .patch(`/api/adt/alerts/${id}`, { action: "acknowledge" })
      .then(() => loadAlerts())
      .catch((err) => console.error("Failed to acknowledge:", err));
  };

  const handleResolve = (id: number, notes: string) => {
    api
      .patch(`/api/adt/alerts/${id}`, { action: "resolve", resolution_notes: notes })
      .then(() => loadAlerts())
      .catch((err) => console.error("Failed to resolve:", err));
  };

  const handleAssign = (id: number, userId: number) => {
    api
      .patch(`/api/adt/alerts/${id}`, { action: "assign", assigned_to: userId })
      .then(() => loadAlerts())
      .catch((err) => console.error("Failed to assign:", err));
  };

  // Count by priority (from all displayed alerts)
  const criticalCount = alerts.filter((a) => a.priority === "critical").length;
  const highCount = alerts.filter((a) => a.priority === "high").length;
  const mediumCount = alerts.filter((a) => a.priority === "medium").length;
  const lowCount = alerts.filter((a) => a.priority === "low").length;

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

  const selectStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.surface,
    color: tokens.text,
    fontFamily: fonts.body,
  };

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Care Alerts
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            ADT-triggered alerts for care management follow-up
          </p>
        </div>
        <button
          className="text-xs px-3 py-1.5 rounded-md border font-medium transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          onClick={loadAlerts}
        >
          Refresh
        </button>
      </div>

      {/* Priority summary pills */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: tokens.redSoft, border: `1px solid #fecaca` }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.red }} />
          <span className="text-xs font-semibold" style={{ color: "#991b1b" }}>
            {criticalCount} Critical
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: tokens.amberSoft, border: `1px solid #fde68a` }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.amber }} />
          <span className="text-xs font-semibold" style={{ color: "#92400e" }}>
            {highCount} High
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: tokens.blueSoft, border: `1px solid #bfdbfe` }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.blue }} />
          <span className="text-xs font-semibold" style={{ color: "#1e40af" }}>
            {mediumCount} Medium
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: tokens.textMuted }} />
          <span className="text-xs font-semibold" style={{ color: tokens.textSecondary }}>
            {lowCount} Low
          </span>
        </div>
        <span className="text-xs ml-2" style={{ color: tokens.textMuted }}>
          {alerts.length} total
        </span>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(["open", "acknowledged", "in_progress", "resolved", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            style={tabStyle(statusFilter === s)}
            onClick={() => setStatusFilter(s)}
          >
            {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}

        <div className="flex-1" />

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          style={selectStyle}
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Types</option>
          <option value="admission">Admission</option>
          <option value="er_visit">ER Visit</option>
          <option value="discharge_planning">Discharge</option>
          <option value="readmission_risk">Readmission</option>
          <option value="snf_placement">SNF Placement</option>
          <option value="hcc_opportunity">HCC Opportunity</option>
        </select>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="text-sm py-12 text-center" style={{ color: tokens.textMuted }}>
          Loading alerts...
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-sm py-12 text-center" style={{ color: tokens.textMuted }}>
          No alerts match the current filters.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
              onAssign={handleAssign}
            />
          ))}
        </div>
      )}
    </div>
  );
}
