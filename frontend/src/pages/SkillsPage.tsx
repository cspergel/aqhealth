import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SkillStep {
  order: number;
  action: string;
  params: Record<string, any>;
  description: string;
}

interface Skill {
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, any> | null;
  steps: SkillStep[];
  created_by: number | null;
  created_from: string;
  is_active: boolean;
  times_executed: number;
  last_executed: string | null;
  avg_duration_seconds: number | null;
  scope: string;
  created_at: string;
  updated_at: string;
}

interface SkillExecution {
  id: number;
  skill_id: number;
  skill_name?: string;
  triggered_by: string;
  status: string;
  steps_completed: number;
  steps_total: number;
  results: any[] | null;
  error: string | null;
  duration_seconds: number | null;
  executed_by: number | null;
  created_at: string;
}

interface SkillPreset {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  steps: SkillStep[];
  created_from: string;
  scope: string;
  expected_outcome: string;
}

interface SkillSuggestion {
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  steps: SkillStep[];
  reason: string;
}

interface SkillAction {
  action: string;
  label: string;
  description: string;
  category: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  schedule: "Schedule",
  event: "Event",
  condition: "Condition",
};

const TRIGGER_COLORS: Record<string, { bg: string; text: string }> = {
  manual: { bg: "#e2e8f0", text: "#475569" },
  schedule: { bg: "#dbeafe", text: "#1d4ed8" },
  event: { bg: "#fae8ff", text: "#9333ea" },
  condition: { bg: "#fef3c7", text: "#b45309" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  running: { bg: "#dbeafe", text: "#1d4ed8" },
  completed: { bg: "#dcfce7", text: "#15803d" },
  failed: { bg: "#fee2e2", text: "#dc2626" },
  cancelled: { bg: "#e2e8f0", text: "#475569" },
};

const ACTION_LABELS: Record<string, string> = {
  run_hcc_engine: "Run HCC Engine",
  generate_chase_list: "Generate Chase List",
  detect_care_gaps: "Detect Care Gaps",
  generate_insights: "Generate Insights",
  run_discovery: "Run Discovery",
  create_action_items: "Create Action Items",
  send_notification: "Send Notification",
  generate_report: "Generate Report",
  evaluate_alert_rules: "Evaluate Alert Rules",
  refresh_dashboard: "Refresh Dashboard",
  run_quality_checks: "Run Quality Checks",
  calculate_stars: "Calculate Stars",
};

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

type TabKey = "skills" | "presets" | "history" | "create" | "suggestions";

const TABS: { key: TabKey; label: string }[] = [
  { key: "skills", label: "My Skills" },
  { key: "presets", label: "Preset Library" },
  { key: "history", label: "Execution History" },
  { key: "create", label: "Create Skill" },
  { key: "suggestions", label: "AI Suggestions" },
];

/* ------------------------------------------------------------------ */
/* Helper Components                                                   */
/* ------------------------------------------------------------------ */

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color: text,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export function SkillsPage() {
  const [tab, setTab] = useState<TabKey>("skills");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [presets, setPresets] = useState<SkillPreset[]>([]);
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [actions, setActions] = useState<SkillAction[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTrigger, setNewTrigger] = useState("manual");
  const [newSteps, setNewSteps] = useState<SkillStep[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsRes, execRes, presetsRes, suggestRes, actionsRes] = await Promise.all([
        api.get("/api/skills"),
        api.get("/api/skills/executions"),
        api.get("/api/skills/presets"),
        api.get("/api/skills/suggest"),
        api.get("/api/skills/actions"),
      ]);
      setSkills(skillsRes.data || []);
      setExecutions(execRes.data || []);
      setPresets(presetsRes.data || []);
      setSuggestions(suggestRes.data || []);
      setActions(actionsRes.data || []);
    } catch {
      // mock mode handles this
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleSkillActive = useCallback(async (skill: Skill) => {
    try {
      await api.patch(`/api/skills/${skill.id}`, { is_active: !skill.is_active });
      setSkills((prev) => prev.map((s) => s.id === skill.id ? { ...s, is_active: !s.is_active } : s));
    } catch { /* ignore */ }
  }, []);

  const runSkill = useCallback(async (skillId: number) => {
    try {
      const res = await api.post(`/api/skills/${skillId}/execute`, { triggered_by: "manual" });
      if (res.data) {
        setExecutions((prev) => [res.data, ...prev]);
        setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, times_executed: s.times_executed + 1, last_executed: new Date().toISOString() } : s));
      }
    } catch { /* ignore */ }
  }, []);

  const deployPreset = useCallback(async (preset: SkillPreset) => {
    try {
      const res = await api.post("/api/skills", {
        name: preset.name,
        description: preset.description,
        trigger_type: preset.trigger_type,
        trigger_config: preset.trigger_config,
        steps: preset.steps,
        created_from: "preset",
      });
      if (res.data) {
        setSkills((prev) => [...prev, res.data]);
        setTab("skills");
      }
    } catch { /* ignore */ }
  }, []);

  const createSuggested = useCallback(async (suggestion: SkillSuggestion) => {
    try {
      const res = await api.post("/api/skills", {
        name: suggestion.name,
        description: suggestion.description,
        trigger_type: suggestion.trigger_type,
        trigger_config: suggestion.trigger_config,
        steps: suggestion.steps,
        created_from: "suggested",
      });
      if (res.data) {
        setSkills((prev) => [...prev, res.data]);
        setTab("skills");
      }
    } catch { /* ignore */ }
  }, []);

  const deleteSkill = useCallback(async (skillId: number) => {
    try {
      await api.delete(`/api/skills/${skillId}`);
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
      if (selectedSkill?.id === skillId) setSelectedSkill(null);
    } catch { /* ignore */ }
  }, [selectedSkill]);

  const createSkill = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post("/api/skills", {
        name: newName,
        description: newDescription,
        trigger_type: newTrigger,
        trigger_config: {},
        steps: newSteps,
      });
      if (res.data) {
        setSkills((prev) => [...prev, res.data]);
        setNewName("");
        setNewDescription("");
        setNewTrigger("manual");
        setNewSteps([]);
        setTab("skills");
      }
    } catch { /* ignore */ }
  }, [newName, newDescription, newTrigger, newSteps]);

  const addStep = useCallback((action: string) => {
    setNewSteps((prev) => [
      ...prev,
      {
        order: prev.length + 1,
        action,
        params: {},
        description: ACTION_LABELS[action] || action,
      },
    ]);
  }, []);

  const removeStep = useCallback((order: number) => {
    setNewSteps((prev) =>
      prev.filter((s) => s.order !== order).map((s, i) => ({ ...s, order: i + 1 }))
    );
  }, []);

  // Summary metrics
  const activeCount = skills.filter((s) => s.is_active).length;
  const totalRuns = skills.reduce((sum, s) => sum + s.times_executed, 0);
  const recentFailures = executions.filter((e) => e.status === "failed").length;

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 700, color: tokens.text, margin: 0 }}>
          Automation
        </h1>
        <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "4px 0 0" }}>
          Self-learning workflow skills that automate repetitive tasks and respond to events.
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Active Skills", value: activeCount, color: tokens.accent },
          { label: "Total Runs", value: totalRuns, color: tokens.blue },
          { label: "Presets Available", value: presets.length, color: "#9333ea" },
          { label: "Recent Failures", value: recentFailures, color: recentFailures > 0 ? tokens.red : tokens.accent },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: 10,
              padding: "16px 20px",
            }}
          >
            <div style={{ fontSize: 11, color: tokens.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, fontFamily: fonts.heading, marginTop: 4 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedSkill(null); }}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? tokens.accent : tokens.textSecondary,
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: tokens.textMuted, padding: 60, fontSize: 13 }}>
          Loading...
        </div>
      ) : (
        <>
          {/* My Skills Tab */}
          {tab === "skills" && !selectedSkill && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    background: tokens.surface,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 10,
                    padding: "20px 24px",
                    cursor: "pointer",
                    transition: "box-shadow 150ms",
                    opacity: skill.is_active ? 1 : 0.6,
                  }}
                  onClick={() => setSelectedSkill(skill)}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: tokens.text, margin: 0 }}>{skill.name}</h3>
                    <Badge
                      label={TRIGGER_LABELS[skill.trigger_type] || skill.trigger_type}
                      bg={TRIGGER_COLORS[skill.trigger_type]?.bg || "#e2e8f0"}
                      text={TRIGGER_COLORS[skill.trigger_type]?.text || "#475569"}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: tokens.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
                    {skill.description}
                  </p>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: tokens.textMuted }}>
                    <span>{skill.steps.length} steps</span>
                    <span>{skill.times_executed} runs</span>
                    <span>Last: {formatDate(skill.last_executed)}</span>
                    <span>Avg: {formatDuration(skill.avg_duration_seconds)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); runSkill(skill.id); }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        background: tokens.accent,
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Run Now
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSkillActive(skill); }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 500,
                        color: skill.is_active ? tokens.red : tokens.accent,
                        background: skill.is_active ? tokens.redSoft : tokens.accentSoft,
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {skill.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSkill(skill.id); }}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 500,
                        color: tokens.textMuted,
                        background: "transparent",
                        border: `1px solid ${tokens.border}`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {skills.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 60, color: tokens.textMuted, fontSize: 13 }}>
                  No skills created yet. Deploy a preset or create your own.
                </div>
              )}
            </div>
          )}

          {/* Skill Detail View */}
          {tab === "skills" && selectedSkill && (
            <div>
              <button
                onClick={() => setSelectedSkill(null)}
                style={{
                  marginBottom: 16,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: tokens.textSecondary,
                  background: "transparent",
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Back to Skills
              </button>

              <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "24px 28px", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: tokens.text, margin: 0 }}>{selectedSkill.name}</h2>
                  <Badge
                    label={TRIGGER_LABELS[selectedSkill.trigger_type] || selectedSkill.trigger_type}
                    bg={TRIGGER_COLORS[selectedSkill.trigger_type]?.bg || "#e2e8f0"}
                    text={TRIGGER_COLORS[selectedSkill.trigger_type]?.text || "#475569"}
                  />
                  <Badge
                    label={selectedSkill.is_active ? "Active" : "Inactive"}
                    bg={selectedSkill.is_active ? tokens.accentSoft : "#e2e8f0"}
                    text={selectedSkill.is_active ? tokens.accentText : "#475569"}
                  />
                </div>
                <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "0 0 16px" }}>{selectedSkill.description}</p>

                <div style={{ display: "flex", gap: 24, fontSize: 12, color: tokens.textMuted, marginBottom: 20 }}>
                  <span>Runs: <strong style={{ color: tokens.text }}>{selectedSkill.times_executed}</strong></span>
                  <span>Last Run: <strong style={{ color: tokens.text }}>{formatDate(selectedSkill.last_executed)}</strong></span>
                  <span>Avg Duration: <strong style={{ color: tokens.text }}>{formatDuration(selectedSkill.avg_duration_seconds)}</strong></span>
                  <span>Created: <strong style={{ color: tokens.text }}>{selectedSkill.created_from}</strong></span>
                </div>

                <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 12px" }}>Steps</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedSkill.steps.map((step) => (
                    <div
                      key={step.order}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 16px",
                        background: tokens.surfaceAlt,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <span style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: tokens.accent,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {step.order}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: tokens.text }}>{ACTION_LABELS[step.action] || step.action}</div>
                        <div style={{ fontSize: 11, color: tokens.textMuted }}>{step.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Execution History for this skill */}
              <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 12px" }}>Recent Executions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {executions.filter((e) => e.skill_id === selectedSkill.id).map((exec) => (
                  <ExecutionRow key={exec.id} execution={exec} />
                ))}
                {executions.filter((e) => e.skill_id === selectedSkill.id).length === 0 && (
                  <div style={{ textAlign: "center", padding: 40, color: tokens.textMuted, fontSize: 12 }}>
                    No executions yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preset Library Tab */}
          {tab === "presets" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {presets.map((preset) => {
                const alreadyDeployed = skills.some((s) => s.name === preset.name);
                return (
                  <div
                    key={preset.id}
                    style={{
                      background: tokens.surface,
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 10,
                      padding: "20px 24px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: tokens.text, margin: 0 }}>{preset.name}</h3>
                      <Badge
                        label={TRIGGER_LABELS[preset.trigger_type] || preset.trigger_type}
                        bg={TRIGGER_COLORS[preset.trigger_type]?.bg || "#e2e8f0"}
                        text={TRIGGER_COLORS[preset.trigger_type]?.text || "#475569"}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: tokens.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                      {preset.description}
                    </p>
                    <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 10 }}>
                      {preset.steps.length} steps
                    </div>

                    {/* Steps preview */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                      {preset.steps.map((s) => (
                        <span key={s.order} style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: tokens.surfaceAlt,
                          borderRadius: 4,
                          color: tokens.textSecondary,
                        }}>
                          {s.order}. {ACTION_LABELS[s.action] || s.action}
                        </span>
                      ))}
                    </div>

                    <div style={{
                      fontSize: 11,
                      color: tokens.accentText,
                      background: tokens.accentSoft,
                      borderRadius: 6,
                      padding: "8px 12px",
                      marginBottom: 14,
                    }}>
                      Expected: {preset.expected_outcome}
                    </div>

                    <button
                      onClick={() => deployPreset(preset)}
                      disabled={alreadyDeployed}
                      style={{
                        padding: "8px 18px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: alreadyDeployed ? tokens.textMuted : "#fff",
                        background: alreadyDeployed ? tokens.surfaceAlt : tokens.accent,
                        border: "none",
                        borderRadius: 6,
                        cursor: alreadyDeployed ? "default" : "pointer",
                      }}
                    >
                      {alreadyDeployed ? "Already Deployed" : "Deploy"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Execution History Tab */}
          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {executions.map((exec) => (
                <ExecutionRow key={exec.id} execution={exec} showSkillName />
              ))}
              {executions.length === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: tokens.textMuted, fontSize: 13 }}>
                  No execution history yet.
                </div>
              )}
            </div>
          )}

          {/* Create Skill Tab */}
          {tab === "create" && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "24px 28px" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: tokens.text, margin: "0 0 20px" }}>Create New Skill</h3>

                {/* Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: tokens.textSecondary, marginBottom: 4 }}>Name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Weekly Quality Review"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 6,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: tokens.textSecondary, marginBottom: 4 }}>Description</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="What does this automation do?"
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 6,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: fonts.body,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Trigger */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: tokens.textSecondary, marginBottom: 6 }}>Trigger</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["manual", "schedule", "event", "condition"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewTrigger(t)}
                        style={{
                          padding: "6px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: newTrigger === t ? TRIGGER_COLORS[t]?.text : tokens.textMuted,
                          background: newTrigger === t ? TRIGGER_COLORS[t]?.bg : "transparent",
                          border: `1px solid ${newTrigger === t ? "transparent" : tokens.border}`,
                          borderRadius: 6,
                          cursor: "pointer",
                        }}
                      >
                        {TRIGGER_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Steps */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: tokens.textSecondary, marginBottom: 8 }}>Steps</label>

                  {/* Current steps */}
                  {newSteps.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                      {newSteps.map((step) => (
                        <div
                          key={step.order}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 14px",
                            background: tokens.surfaceAlt,
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        >
                          <span style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: tokens.accent,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {step.order}
                          </span>
                          <span style={{ flex: 1, fontWeight: 500, color: tokens.text }}>
                            {ACTION_LABELS[step.action] || step.action}
                          </span>
                          <button
                            onClick={() => removeStep(step.order)}
                            style={{
                              fontSize: 11,
                              color: tokens.red,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add step buttons */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(actions.length > 0 ? actions : Object.entries(ACTION_LABELS).map(([action, label]) => ({ action, label, description: "", category: "" }))).map((a) => (
                      <button
                        key={a.action}
                        onClick={() => addStep(a.action)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          color: tokens.blue,
                          background: tokens.blueSoft,
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        + {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={createSkill}
                  disabled={!newName.trim() || newSteps.length === 0}
                  style={{
                    padding: "10px 24px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    background: !newName.trim() || newSteps.length === 0 ? tokens.textMuted : tokens.accent,
                    border: "none",
                    borderRadius: 8,
                    cursor: !newName.trim() || newSteps.length === 0 ? "default" : "pointer",
                  }}
                >
                  Save & Activate
                </button>
              </div>
            </div>
          )}

          {/* AI Suggestions Tab */}
          {tab === "suggestions" && (
            <div>
              <div style={{
                background: tokens.blueSoft,
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 20,
                fontSize: 13,
                color: tokens.blue,
              }}>
                Based on your usage patterns, we suggest these automations:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
                {suggestions.map((suggestion, i) => (
                  <div
                    key={i}
                    style={{
                      background: tokens.surface,
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 10,
                      padding: "20px 24px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: tokens.text, margin: 0 }}>{suggestion.name}</h3>
                      <Badge
                        label={TRIGGER_LABELS[suggestion.trigger_type] || suggestion.trigger_type}
                        bg={TRIGGER_COLORS[suggestion.trigger_type]?.bg || "#e2e8f0"}
                        text={TRIGGER_COLORS[suggestion.trigger_type]?.text || "#475569"}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: tokens.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                      {suggestion.description}
                    </p>

                    {/* Steps */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                      {suggestion.steps.map((s) => (
                        <span key={s.order} style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: tokens.surfaceAlt,
                          borderRadius: 4,
                          color: tokens.textSecondary,
                        }}>
                          {s.order}. {ACTION_LABELS[s.action] || s.action}
                        </span>
                      ))}
                    </div>

                    {/* Reason */}
                    <div style={{
                      fontSize: 11,
                      color: tokens.amber,
                      background: tokens.amberSoft,
                      borderRadius: 6,
                      padding: "8px 12px",
                      marginBottom: 14,
                    }}>
                      {suggestion.reason}
                    </div>

                    <button
                      onClick={() => createSuggested(suggestion)}
                      style={{
                        padding: "8px 18px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        background: tokens.accent,
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Create This Skill
                    </button>
                  </div>
                ))}
                {suggestions.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 60, color: tokens.textMuted, fontSize: 13 }}>
                    No suggestions available yet. Use the platform more and we will identify automation opportunities.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Execution Row Component                                             */
/* ------------------------------------------------------------------ */

function ExecutionRow({ execution, showSkillName }: { execution: SkillExecution; showSkillName?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[execution.status] || STATUS_COLORS.cancelled;

  return (
    <div style={{
      background: tokens.surface,
      border: `1px solid ${tokens.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 20px",
          cursor: "pointer",
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {showSkillName && (
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text, minWidth: 160 }}>
            {execution.skill_name || `Skill #${execution.skill_id}`}
          </span>
        )}
        <Badge
          label={execution.status}
          bg={statusColor.bg}
          text={statusColor.text}
        />
        <Badge
          label={execution.triggered_by}
          bg={TRIGGER_COLORS[execution.triggered_by]?.bg || "#e2e8f0"}
          text={TRIGGER_COLORS[execution.triggered_by]?.text || "#475569"}
        />
        <span style={{ fontSize: 12, color: tokens.textSecondary }}>
          {execution.steps_completed}/{execution.steps_total} steps
        </span>
        <span style={{ fontSize: 12, color: tokens.textMuted }}>
          {formatDuration(execution.duration_seconds)}
        </span>
        <span style={{ fontSize: 12, color: tokens.textMuted, marginLeft: "auto" }}>
          {formatDate(execution.created_at)}
        </span>
        <span style={{ fontSize: 10, color: tokens.textMuted, transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms" }}>
          {"\u25B8"}
        </span>
      </div>

      {expanded && execution.results && (
        <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${tokens.borderSoft}` }}>
          {execution.results.map((r: any, i: number) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom: i < execution.results!.length - 1 ? `1px solid ${tokens.borderSoft}` : "none",
                fontSize: 12,
              }}
            >
              <span style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: r.status === "completed" ? tokens.accent : r.status === "failed" ? tokens.red : tokens.textMuted,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {r.status === "completed" ? "\u2713" : r.status === "failed" ? "\u2717" : r.step}
              </span>
              <span style={{ fontWeight: 500, color: tokens.text }}>{ACTION_LABELS[r.action] || r.action}</span>
              <span style={{ color: tokens.textMuted }}>
                {r.status === "completed" && r.output?.message ? r.output.message : ""}
                {r.status === "failed" ? r.error || "Failed" : ""}
              </span>
            </div>
          ))}
          {execution.error && (
            <div style={{ marginTop: 8, fontSize: 11, color: tokens.red, background: tokens.redSoft, padding: "6px 10px", borderRadius: 4 }}>
              {execution.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
