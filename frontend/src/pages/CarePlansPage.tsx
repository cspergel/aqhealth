import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Intervention {
  id: number;
  goal_id: number;
  description: string;
  intervention_type: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_date: string | null;
  status: string;
  notes: string | null;
}

interface Goal {
  id: number;
  care_plan_id: number;
  description: string;
  target_metric: string | null;
  target_value: string | null;
  baseline_value: string | null;
  current_value: string | null;
  status: string;
  target_date: string | null;
  interventions: Intervention[];
}

interface CarePlan {
  id: number;
  member_id: number;
  title: string;
  status: string;
  created_by: number;
  care_manager_id: number | null;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
  goals_count: number;
  goals_met: number;
  completion_pct: number;
}

interface CarePlanDetail extends CarePlan {
  goals: Goal[];
}

interface Summary {
  active_plans: number;
  total_goals: number;
  met_goals: number;
  past_due_goals: number;
  overall_completion_pct: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f5f5f4", text: "#78716c" },
  active: { bg: tokens.blueSoft, text: tokens.blue },
  completed: { bg: tokens.accentSoft, text: tokens.accentText },
  discontinued: { bg: tokens.redSoft, text: tokens.red },
  in_progress: { bg: tokens.blueSoft, text: tokens.blue },
  met: { bg: tokens.accentSoft, text: tokens.accentText },
  not_met: { bg: tokens.redSoft, text: tokens.red },
  not_started: { bg: "#f5f5f4", text: "#78716c" },
  deferred: { bg: tokens.amberSoft, text: tokens.amber },
  pending: { bg: tokens.amberSoft, text: tokens.amber },
  cancelled: { bg: "#f5f5f4", text: "#78716c" },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || { bg: "#f5f5f4", text: "#78716c" };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CarePlansPage() {
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<CarePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, summaryRes] = await Promise.all([
        api.get("/api/care-plans"),
        api.get("/api/care-plans/summary"),
      ]);
      setPlans(plansRes.data);
      setSummary(summaryRes.data);
      setError(null);
    } catch {
      setError("Failed to load care plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = useCallback(async (planId: number) => {
    try {
      const res = await api.get(`/api/care-plans/${planId}`);
      setSelectedPlan(res.data);
    } catch {
      setError("Failed to load care plan detail.");
    }
  }, []);

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.textMuted }}>Loading care plans...</div>
      </div>
    );
  }

  if (error && !plans.length) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.red }}>{error}</div>
      </div>
    );
  }

  // Detail view
  if (selectedPlan) {
    return (
      <div className="p-7 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedPlan(null)}
            className="text-[13px] px-3 py-1.5 rounded-md border hover:bg-stone-50 transition-colors"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Back to Plans
          </button>
          <StatusBadge status={selectedPlan.status} />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            {selectedPlan.title}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Member #{selectedPlan.member_id} | Started {selectedPlan.start_date}
            {selectedPlan.target_end_date ? ` | Target: ${selectedPlan.target_end_date}` : ""}
          </p>
          {selectedPlan.notes && (
            <p className="text-[13px] mt-2" style={{ color: tokens.textSecondary }}>{selectedPlan.notes}</p>
          )}
        </div>

        {/* Progress bar */}
        <div className="rounded-[10px] border bg-white p-4" style={{ borderColor: tokens.border }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium" style={{ color: tokens.text }}>
              Overall Completion
            </span>
            <span className="text-[13px] font-semibold" style={{ color: tokens.accentText, fontFamily: fonts.code }}>
              {selectedPlan.completion_pct}%
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: tokens.surfaceAlt }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${Math.min(selectedPlan.completion_pct, 100)}%`, background: tokens.accent }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>
              {selectedPlan.goals_met} of {selectedPlan.goals_count} goals met
            </span>
          </div>
        </div>

        {/* Goals */}
        {selectedPlan.goals.map((goal) => (
          <div key={goal.id} className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: tokens.text, fontFamily: fonts.heading }}>
                  {goal.description}
                </h3>
                {goal.target_metric && (
                  <div className="flex gap-4 mt-1 text-[12px]" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                    <span>Baseline: {goal.baseline_value || "N/A"}</span>
                    <span>Current: {goal.current_value || "N/A"}</span>
                    <span>Target: {goal.target_value || "N/A"}</span>
                  </div>
                )}
                {goal.target_date && (
                  <span className="text-[11px]" style={{ color: tokens.textMuted }}>Due: {goal.target_date}</span>
                )}
              </div>
              <StatusBadge status={goal.status} />
            </div>

            {/* Interventions as checklist */}
            <div className="flex flex-col gap-2 mt-3">
              {goal.interventions.map((intervention) => (
                <div
                  key={intervention.id}
                  className="flex items-start gap-3 p-2.5 rounded-md"
                  style={{ background: tokens.surfaceAlt }}
                >
                  <div
                    className="w-4 h-4 rounded-sm border flex items-center justify-center mt-0.5 flex-shrink-0"
                    style={{
                      borderColor: intervention.status === "completed" ? tokens.accent : tokens.border,
                      background: intervention.status === "completed" ? tokens.accent : "transparent",
                    }}
                  >
                    {intervention.status === "completed" && (
                      <span className="text-white text-[10px] leading-none font-bold">&#10003;</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[13px]"
                        style={{
                          color: intervention.status === "completed" ? tokens.textMuted : tokens.text,
                          textDecoration: intervention.status === "completed" ? "line-through" : "none",
                        }}
                      >
                        {intervention.description}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold"
                        style={{
                          background: STATUS_COLORS[intervention.status]?.bg || "#f5f5f4",
                          color: STATUS_COLORS[intervention.status]?.text || "#78716c",
                        }}
                      >
                        {intervention.intervention_type}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px]" style={{ color: tokens.textMuted }}>
                      {intervention.assigned_to && <span>Assigned: {intervention.assigned_to}</span>}
                      {intervention.due_date && <span>Due: {intervention.due_date}</span>}
                      {intervention.completed_date && <span>Done: {intervention.completed_date}</span>}
                    </div>
                    {intervention.notes && (
                      <p className="text-[11px] mt-1" style={{ color: tokens.textSecondary }}>{intervention.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // List view
  return (
    <div className="p-7 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
          Care Plans
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: tokens.textMuted }}>
          Build and manage individualized care plans with goals and interventions.
        </p>
      </div>

      {/* Summary metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Active Plans" value={String(summary.active_plans)} />
          <MetricCard label="Total Goals" value={String(summary.total_goals)} />
          <MetricCard label="Goals Met" value={String(summary.met_goals)} />
          <MetricCard
            label="Past Due"
            value={String(summary.past_due_goals)}
            trendDirection={summary.past_due_goals > 0 ? "down" : "up"}
          />
          <MetricCard label="Completion" value={`${summary.overall_completion_pct}%`} />
        </div>
      )}

      {/* Plans table */}
      <div className="rounded-[10px] border bg-white" style={{ borderColor: tokens.border }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left font-medium p-3 text-[11px]">Plan</th>
              <th className="text-left font-medium p-3 text-[11px]">Status</th>
              <th className="text-right font-medium p-3 text-[11px]">Goals</th>
              <th className="text-right font-medium p-3 text-[11px]">Completion</th>
              <th className="text-left font-medium p-3 text-[11px]">Start Date</th>
              <th className="text-left font-medium p-3 text-[11px]">Target End</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-t cursor-pointer hover:bg-stone-50 transition-colors"
                style={{ borderColor: tokens.borderSoft }}
                onClick={() => openDetail(plan.id)}
              >
                <td className="p-3">
                  <div className="font-medium" style={{ color: tokens.text }}>{plan.title}</div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>Member #{plan.member_id}</div>
                </td>
                <td className="p-3">
                  <StatusBadge status={plan.status} />
                </td>
                <td className="text-right p-3" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                  {plan.goals_met}/{plan.goals_count}
                </td>
                <td className="text-right p-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ background: tokens.surfaceAlt }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${Math.min(plan.completion_pct, 100)}%`, background: tokens.accent }}
                      />
                    </div>
                    <span style={{ fontFamily: fonts.code, color: tokens.textSecondary, fontSize: 12 }}>
                      {plan.completion_pct}%
                    </span>
                  </div>
                </td>
                <td className="p-3" style={{ color: tokens.textSecondary }}>{plan.start_date}</td>
                <td className="p-3" style={{ color: tokens.textSecondary }}>{plan.target_end_date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
