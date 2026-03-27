import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertRule {
  id: number;
  name: string;
  description: string | null;
  entity_type: string;
  metric: string;
  operator: string;
  threshold: number;
  scope_filter: Record<string, unknown> | null;
  notify_channels: Record<string, unknown>;
  severity: string;
  is_active: boolean;
  created_by: number;
  last_evaluated: string | null;
  last_triggered: string | null;
  trigger_count: number;
  created_at: string;
}

interface AlertTrigger {
  id: number;
  rule_id: number;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  metric_value: number;
  threshold: number;
  message: string;
  acknowledged: boolean;
  acknowledged_by: number | null;
  created_at: string;
}

interface PresetRule {
  name: string;
  description: string;
  entity_type: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  notify_channels: Record<string, unknown>;
}

type Tab = "rules" | "triggers" | "create";

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">", lt: "<", gte: ">=", lte: "<=", eq: "=", change_gt: "change >", change_lt: "change <",
};

const OPERATOR_OPTIONS = [
  { value: "gt", label: "> Greater than" },
  { value: "lt", label: "< Less than" },
  { value: "gte", label: ">= Greater or equal" },
  { value: "lte", label: "<= Less or equal" },
  { value: "eq", label: "= Equal to" },
];

const ENTITY_TYPES = ["member", "provider", "group", "measure", "population"];

const METRIC_OPTIONS: Record<string, { value: string; label: string }[]> = {
  member: [
    { value: "spend_12mo", label: "12-Month Spend ($)" },
    { value: "raf_score", label: "RAF Score" },
    { value: "er_visits", label: "ER Visits" },
    { value: "admissions", label: "Inpatient Admissions" },
    { value: "days_since_visit", label: "Days Since Last Visit" },
    { value: "suspect_count", label: "Open Suspect Count" },
    { value: "gap_count", label: "Open Gap Count" },
  ],
  provider: [
    { value: "capture_rate", label: "HCC Capture Rate (%)" },
    { value: "recapture_rate", label: "Recapture Rate (%)" },
    { value: "panel_pmpm", label: "Panel PMPM ($)" },
    { value: "gap_closure", label: "Gap Closure Rate (%)" },
  ],
  group: [
    { value: "avg_capture_rate", label: "Avg Capture Rate (%)" },
    { value: "group_pmpm", label: "Group PMPM ($)" },
  ],
  measure: [
    { value: "closure_rate", label: "Closure Rate (%)" },
  ],
  population: [
    { value: "avg_raf", label: "Average RAF" },
    { value: "total_pmpm", label: "Total PMPM ($)" },
    { value: "mlr", label: "Medical Loss Ratio (%)" },
    { value: "recapture_rate", label: "Recapture Rate (%)" },
  ],
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: tokens.red,
  high: "#f97316",
  medium: tokens.amber,
  low: tokens.textMuted,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertRulesPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [triggers, setTriggers] = useState<AlertTrigger[]>([]);
  const [presets, setPresets] = useState<PresetRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formEntity, setFormEntity] = useState("member");
  const [formMetric, setFormMetric] = useState("spend_12mo");
  const [formOperator, setFormOperator] = useState("gt");
  const [formThreshold, setFormThreshold] = useState<string>("");
  const [formSeverity, setFormSeverity] = useState("medium");
  const [formDescription, setFormDescription] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/alert-rules"),
      api.get("/api/alert-rules/triggers"),
      api.get("/api/alert-rules/presets"),
    ])
      .then(([rulesRes, triggersRes, presetsRes]) => {
        setRules(Array.isArray(rulesRes.data) ? rulesRes.data : rulesRes.data?.items || []);
        setTriggers(Array.isArray(triggersRes.data) ? triggersRes.data : triggersRes.data?.items || []);
        setPresets(Array.isArray(presetsRes.data) ? presetsRes.data : presetsRes.data?.items || []);
      })
      .catch((err) => console.error("Failed to load alert rules:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleToggleRule = (ruleId: number, isActive: boolean) => {
    api.patch(`/api/alert-rules/${ruleId}`, { is_active: !isActive })
      .then(() => loadData())
      .catch((err) => console.error("Failed to toggle rule:", err));
  };

  const handleDeleteRule = (ruleId: number) => {
    if (!confirm("Delete this rule?")) return;
    api.delete(`/api/alert-rules/${ruleId}`)
      .then(() => loadData())
      .catch((err) => console.error("Failed to delete rule:", err));
  };

  const handleAcknowledge = (triggerId: number) => {
    api.patch(`/api/alert-rules/triggers/${triggerId}/acknowledge`)
      .then(() => loadData())
      .catch((err) => console.error("Failed to acknowledge trigger:", err));
  };

  const handleEvaluate = () => {
    api.post("/api/alert-rules/evaluate")
      .then(() => loadData())
      .catch((err) => console.error("Failed to evaluate rules:", err));
  };

  const handleCreateRule = () => {
    if (!formName || !formThreshold) return;
    const threshold = parseFloat(formThreshold);
    if (isNaN(threshold)) return;
    api.post("/api/alert-rules", {
      name: formName,
      description: formDescription || null,
      entity_type: formEntity,
      metric: formMetric,
      operator: formOperator,
      threshold,
      severity: formSeverity,
      notify_channels: { in_app: true },
    }).then(() => {
      setFormName(""); setFormDescription(""); setFormThreshold("");
      setTab("rules");
      loadData();
    }).catch((err) => console.error("Failed to create rule:", err));
  };

  const handleAddPreset = (preset: PresetRule) => {
    api.post("/api/alert-rules", {
      ...preset,
      notify_channels: { in_app: true },
    }).then(() => loadData())
      .catch((err) => console.error("Failed to add preset:", err));
  };

  const unacknowledgedCount = triggers.filter((t) => !t.acknowledged).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 700, color: tokens.text, margin: 0 }}>
            Alert Rules Engine
          </h1>
          <p style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
            Define automated rules that monitor your data and trigger alerts when thresholds are crossed.
          </p>
        </div>
        <button
          onClick={handleEvaluate}
          style={{
            padding: "8px 18px", fontSize: 13, fontWeight: 600,
            background: tokens.accent, color: "#fff", border: "none",
            borderRadius: 8, cursor: "pointer",
          }}
        >
          Run Evaluation Now
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 20 }}>
        {([
          { key: "rules" as Tab, label: `Active Rules (${rules.length})` },
          { key: "triggers" as Tab, label: `Triggered Alerts${unacknowledgedCount > 0 ? ` (${unacknowledgedCount})` : ""}` },
          { key: "create" as Tab, label: "Create Rule" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? tokens.accent : tokens.textMuted,
              background: "none", border: "none",
              borderBottom: tab === t.key ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer", marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: tokens.textMuted }}>Loading...</div>}

      {/* Active Rules Tab */}
      {!loading && tab === "rules" && (
        <div>
          {rules.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: tokens.textMuted }}>
              No rules defined yet. Create one or add from presets below.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    background: "#fff", border: `1px solid ${tokens.border}`,
                    borderRadius: 10, padding: "16px 20px",
                    opacity: rule.is_active ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: rule.is_active ? tokens.accent : tokens.textMuted,
                    }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: tokens.text, flex: 1 }}>
                      {rule.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                      background: `${SEVERITY_COLORS[rule.severity] || tokens.textMuted}18`,
                      color: SEVERITY_COLORS[rule.severity] || tokens.textMuted,
                      textTransform: "uppercase",
                    }}>
                      {rule.severity}
                    </span>
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.is_active)}
                      style={{
                        fontSize: 12, padding: "4px 12px", borderRadius: 6,
                        border: `1px solid ${tokens.border}`, background: tokens.surface,
                        cursor: "pointer", color: tokens.textSecondary,
                      }}
                    >
                      {rule.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      style={{
                        fontSize: 12, padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${tokens.border}`, background: tokens.surface,
                        cursor: "pointer", color: tokens.red,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {rule.description && (
                    <p style={{ fontSize: 12, color: tokens.textMuted, margin: "0 0 8px 20px" }}>
                      {rule.description}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 24, marginLeft: 20, fontSize: 12, color: tokens.textSecondary }}>
                    <span>
                      <strong>Condition:</strong> {rule.entity_type}.{rule.metric} {OPERATOR_LABELS[rule.operator] || rule.operator} {rule.threshold.toLocaleString()}
                    </span>
                    <span><strong>Triggered:</strong> {rule.trigger_count}x</span>
                    {rule.last_triggered && (
                      <span><strong>Last:</strong> {new Date(rule.last_triggered).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Presets */}
          <div style={{ marginTop: 32 }}>
            <h3 style={{ fontFamily: fonts.heading, fontSize: 15, fontWeight: 600, color: tokens.text, marginBottom: 12 }}>
              Preset Rules
            </h3>
            <p style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 12 }}>
              One-click to add common monitoring rules.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {presets.map((preset, i) => {
                const alreadyAdded = rules.some((r) => r.name === preset.name);
                return (
                  <div
                    key={i}
                    style={{
                      background: tokens.surface, border: `1px solid ${tokens.border}`,
                      borderRadius: 8, padding: "12px 16px",
                      display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: tokens.text }}>{preset.name}</div>
                      <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 2 }}>
                        {preset.entity_type}.{preset.metric} {OPERATOR_LABELS[preset.operator]} {preset.threshold.toLocaleString()}
                      </div>
                    </div>
                    <button
                      disabled={alreadyAdded}
                      onClick={() => handleAddPreset(preset)}
                      style={{
                        fontSize: 12, padding: "5px 14px", borderRadius: 6,
                        border: "none", fontWeight: 600, cursor: alreadyAdded ? "default" : "pointer",
                        background: alreadyAdded ? tokens.surface : tokens.accent,
                        color: alreadyAdded ? tokens.textMuted : "#fff",
                      }}
                    >
                      {alreadyAdded ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Triggered Alerts Tab */}
      {!loading && tab === "triggers" && (
        <div>
          {triggers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: tokens.textMuted }}>
              No triggered alerts yet. Run an evaluation to check rules.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {triggers.map((trigger) => {
                const rule = rules.find((r) => r.id === trigger.rule_id);
                return (
                  <div
                    key={trigger.id}
                    style={{
                      background: trigger.acknowledged ? tokens.surface : "#fff",
                      border: `1px solid ${trigger.acknowledged ? tokens.border : tokens.red + "40"}`,
                      borderRadius: 10, padding: "14px 20px",
                      borderLeft: `3px solid ${trigger.acknowledged ? tokens.border : (SEVERITY_COLORS[rule?.severity || "medium"] || tokens.amber)}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: tokens.text, flex: 1 }}>
                        {trigger.entity_name || `${trigger.entity_type} #${trigger.entity_id}`}
                      </span>
                      {rule && (
                        <span style={{ fontSize: 11, color: tokens.textMuted }}>
                          Rule: {rule.name}
                        </span>
                      )}
                      {trigger.acknowledged ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                          background: `${tokens.accent}18`, color: tokens.accent,
                        }}>
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAcknowledge(trigger.id)}
                          style={{
                            fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 6,
                            border: "none", background: tokens.accent, color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 4 }}>
                      {trigger.message}
                    </div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12, color: tokens.textMuted }}>
                      <span>Value: <strong>{trigger.metric_value.toLocaleString()}</strong></span>
                      <span>Threshold: <strong>{trigger.threshold.toLocaleString()}</strong></span>
                      <span>{new Date(trigger.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Rule Tab */}
      {!loading && tab === "create" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{
            background: "#fff", border: `1px solid ${tokens.border}`,
            borderRadius: 10, padding: "24px 28px",
          }}>
            <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, marginBottom: 20, color: tokens.text }}>
              New Alert Rule
            </h3>

            {/* Name */}
            <label style={labelStyle}>Rule Name</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., High-cost member alert"
              style={inputStyle}
            />

            {/* Description */}
            <label style={labelStyle}>Description (optional)</label>
            <input
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Describe what this rule monitors"
              style={inputStyle}
            />

            {/* Entity Type */}
            <label style={labelStyle}>Entity Type</label>
            <select
              value={formEntity}
              onChange={(e) => {
                setFormEntity(e.target.value);
                const metrics = METRIC_OPTIONS[e.target.value] || [];
                setFormMetric(metrics[0]?.value || "");
              }}
              style={inputStyle}
            >
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>

            {/* Metric */}
            <label style={labelStyle}>Metric</label>
            <select
              value={formMetric}
              onChange={(e) => setFormMetric(e.target.value)}
              style={inputStyle}
            >
              {(METRIC_OPTIONS[formEntity] || []).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {/* Operator */}
            <label style={labelStyle}>Operator</label>
            <select
              value={formOperator}
              onChange={(e) => setFormOperator(e.target.value)}
              style={inputStyle}
            >
              {OPERATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Threshold */}
            <label style={labelStyle}>Threshold</label>
            <input
              type="number"
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              placeholder="e.g., 100000"
              style={inputStyle}
            />

            {/* Severity */}
            <label style={labelStyle}>Severity</label>
            <select
              value={formSeverity}
              onChange={(e) => setFormSeverity(e.target.value)}
              style={inputStyle}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Submit */}
            <button
              onClick={handleCreateRule}
              disabled={!formName || !formThreshold}
              style={{
                marginTop: 20, width: "100%", padding: "10px 0",
                fontSize: 14, fontWeight: 600, borderRadius: 8,
                border: "none", cursor: formName && formThreshold ? "pointer" : "default",
                background: formName && formThreshold ? tokens.accent : tokens.border,
                color: formName && formThreshold ? "#fff" : tokens.textMuted,
              }}
            >
              Create Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: tokens.textSecondary,
  marginBottom: 4,
  marginTop: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  border: `1px solid ${tokens.border}`,
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};
