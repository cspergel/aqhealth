import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Tab = "dashboard" | "rules" | "history";

interface PipelineDashboard {
  total_processed: number;
  auto_clean_rate: number;
  ai_accuracy: number;
  rules_learned: number;
  auto_clean_rate_trend: { month: string; rate: number }[];
  processing_trend: { week: string; records: number }[];
  top_issues: { issue: string; percentage: number; count: number }[];
}

interface TransformationRule {
  id: number;
  source_name: string | null;
  data_type: string | null;
  field: string;
  rule_type: string;
  condition: Record<string, any>;
  transformation: Record<string, any>;
  created_from: string;
  times_applied: number;
  times_overridden: number;
  accuracy: number | null;
  is_active: boolean;
  created_at: string;
}

interface PipelineRun {
  id: number;
  source_name: string | null;
  interface_id: number | null;
  format_detected: string | null;
  data_type_detected: string | null;
  total_records: number;
  clean_records: number;
  quarantined_records: number;
  ai_cleaned: number;
  rules_applied: number;
  rules_created: number;
  entities_matched: number;
  processing_time_ms: number | null;
  errors: Record<string, any> | null;
  created_at: string;
  changes?: { field: string; original: any; cleaned: any; reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const RULE_TYPE_LABELS: Record<string, string> = {
  value_map: "Value Map",
  format_convert: "Format Convert",
  default_fill: "Default Fill",
  regex_transform: "Regex Transform",
  code_correction: "Code Correction",
};

const FORMAT_LABELS: Record<string, string> = {
  x12_837: "X12 837",
  x12_835: "X12 835",
  x12_834: "X12 834",
  hl7v2: "HL7v2",
  fhir: "FHIR R4",
  csv: "CSV",
  json: "JSON",
  cda: "CDA/CCDA",
  xml: "XML",
};

const CREATED_FROM_COLORS: Record<string, { bg: string; text: string }> = {
  human: { bg: "#dbeafe", text: "#1d4ed8" },
  ai: { bg: "#f3e8ff", text: "#7c3aed" },
  pattern: { bg: "#dcfce7", text: "#15803d" },
};

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export function AIPipelinePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<PipelineDashboard | null>(null);
  const [rules, setRules] = useState<TransformationRule[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [showTeachModal, setShowTeachModal] = useState(false);

  useEffect(() => {
    api.get("/api/pipeline/dashboard").then((r) => setDashboard(r.data));
    api.get("/api/pipeline/rules").then((r) => setRules(r.data));
    api.get("/api/pipeline/runs").then((r) => setRuns(r.data));
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "rules", label: "Learned Rules" },
    { key: "history", label: "Processing History" },
  ];

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: fonts.heading,
            color: tokens.text,
            margin: 0,
          }}
        >
          AI Pipeline
        </h1>
        <p style={{ fontSize: 13, color: tokens.textMuted, margin: "4px 0 0" }}>
          Self-learning data transformation engine. Detects formats, cleans data,
          resolves entities, and improves with every file processed.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${tokens.border}`,
          marginBottom: 24,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? tokens.accent : tokens.textMuted,
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

      {/* Tab Content */}
      {tab === "dashboard" && dashboard && (
        <DashboardTab dashboard={dashboard} runs={runs} />
      )}
      {tab === "rules" && (
        <RulesTab
          rules={rules}
          showTeachModal={showTeachModal}
          setShowTeachModal={setShowTeachModal}
        />
      )}
      {tab === "history" && (
        <HistoryTab
          runs={runs}
          selectedRun={selectedRun}
          setSelectedRun={setSelectedRun}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard Tab                                                       */
/* ------------------------------------------------------------------ */

function DashboardTab({
  dashboard,
  runs,
}: {
  dashboard: PipelineDashboard;
  runs: PipelineRun[];
}) {
  const maxRecords = Math.max(...dashboard.processing_trend.map((d) => d.records));
  const maxIssueCount = Math.max(...dashboard.top_issues.map((d) => d.count));

  return (
    <div>
      {/* Big Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <MetricCard
          label="Total Records Processed"
          value={fmtNum(dashboard.total_processed)}
          trend="Lifetime"
        />
        <MetricCard
          label="Auto-Clean Rate"
          value={fmtPct(dashboard.auto_clean_rate)}
          trend={`Up from 87.0% in Oct`}
          trendDirection="up"
        />
        <MetricCard
          label="AI Accuracy"
          value={fmtPct(dashboard.ai_accuracy)}
          trend="Corrections accepted"
          trendDirection="up"
        />
        <MetricCard
          label="Rules Learned"
          value={fmtNum(dashboard.rules_learned)}
          trend="Auto-created from patterns"
        />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Processing Trend */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 16px" }}>
            Records Processed per Week
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
            {dashboard.processing_trend.map((d) => (
              <div
                key={d.week}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                <span
                  style={{ fontSize: 10, fontWeight: 600, color: tokens.text, marginBottom: 4 }}
                >
                  {fmtNum(d.records)}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${(d.records / maxRecords) * 100}px`,
                    background: tokens.accent,
                    borderRadius: "4px 4px 0 0",
                    opacity: 0.8,
                    minHeight: 8,
                  }}
                />
                <span
                  style={{ fontSize: 10, color: tokens.textMuted, marginTop: 4, whiteSpace: "nowrap" }}
                >
                  {d.week}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Clean Rate Trend */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 16px" }}>
            Auto-Clean Rate Improvement
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 140 }}>
            {dashboard.auto_clean_rate_trend.map((d) => {
              const barHeight = ((d.rate - 80) / 20) * 120;
              return (
                <div
                  key={d.month}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
                >
                  <span
                    style={{ fontSize: 10, fontWeight: 600, color: "#15803d", marginBottom: 4 }}
                  >
                    {d.rate}%
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: Math.max(barHeight, 8),
                      background: "#22c55e",
                      borderRadius: "4px 4px 0 0",
                      opacity: 0.7,
                    }}
                  />
                  <span
                    style={{ fontSize: 9, color: tokens.textMuted, marginTop: 4, whiteSpace: "nowrap" }}
                  >
                    {d.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Issues */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 16px" }}>
            Top Data Quality Issues
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dashboard.top_issues.map((issue) => (
              <div key={issue.issue}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: tokens.text, fontWeight: 500 }}>{issue.issue}</span>
                  <span style={{ color: tokens.textMuted }}>
                    {issue.percentage}% ({fmtNum(issue.count)})
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: tokens.surfaceAlt,
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(issue.count / maxIssueCount) * 100}%`,
                      height: "100%",
                      background: tokens.accent,
                      borderRadius: 3,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Runs */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 16px" }}>
            Recent Processing Runs
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: tokens.textMuted, fontWeight: 500 }}>Source</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: tokens.textMuted, fontWeight: 500 }}>Records</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: tokens.textMuted, fontWeight: 500 }}>Clean %</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: tokens.textMuted, fontWeight: 500 }}>When</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 6).map((run) => {
                const cleanPct = run.total_records > 0
                  ? ((run.clean_records / run.total_records) * 100).toFixed(1)
                  : "0.0";
                return (
                  <tr key={run.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "8px 8px", color: tokens.text, fontWeight: 500 }}>
                      {run.source_name || "Unknown"}
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: fonts.code }}>
                      {fmtNum(run.total_records)}
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>
                      <span
                        style={{
                          fontFamily: fonts.code,
                          fontWeight: 600,
                          color: Number(cleanPct) >= 95 ? "#15803d" : Number(cleanPct) >= 90 ? "#b45309" : tokens.red,
                        }}
                      >
                        {cleanPct}%
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "8px 8px",
                        textAlign: "right",
                        color: tokens.textMuted,
                      }}
                    >
                      {timeAgo(run.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rules Tab                                                           */
/* ------------------------------------------------------------------ */

function RulesTab({
  rules,
  showTeachModal,
  setShowTeachModal,
}: {
  rules: TransformationRule[];
  showTeachModal: boolean;
  setShowTeachModal: (v: boolean) => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = rules.filter((r) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (r.source_name || "universal").toLowerCase().includes(q) ||
      r.field.toLowerCase().includes(q) ||
      r.rule_type.toLowerCase().includes(q)
    );
  });

  // Group by source
  const grouped: Record<string, TransformationRule[]> = {};
  for (const r of filtered) {
    const key = r.source_name || "Universal (All Sources)";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="text"
          placeholder="Filter rules by source, field, or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            fontSize: 13,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            width: 320,
            outline: "none",
          }}
        />
        <button
          onClick={() => setShowTeachModal(true)}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: tokens.accent,
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          + Teach Rule
        </button>
      </div>

      {/* Summary */}
      <div
        style={{
          fontSize: 12,
          color: tokens.textMuted,
          marginBottom: 16,
        }}
      >
        {filtered.length} rules total across {Object.keys(grouped).length} sources
      </div>

      {/* Grouped Rules */}
      {Object.entries(grouped).map(([source, sourceRules]) => (
        <div
          key={source}
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            marginBottom: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${tokens.border}`,
              background: tokens.surfaceAlt,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>
              {source}
            </span>
            <span style={{ fontSize: 12, color: tokens.textMuted, marginLeft: 8 }}>
              ({sourceRules.length} rules)
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Field</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Type</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Condition</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Transform</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Origin</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Applied</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Accuracy</th>
                <th style={{ textAlign: "center", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {sourceRules.map((rule) => {
                const condStr = Object.entries(rule.condition)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ");
                const transStr = Object.entries(rule.transformation)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ");
                const origin = CREATED_FROM_COLORS[rule.created_from] || { bg: "#f1f5f9", text: "#475569" };

                return (
                  <tr
                    key={rule.id}
                    style={{
                      borderBottom: `1px solid ${tokens.border}`,
                      opacity: rule.is_active ? 1 : 0.5,
                    }}
                  >
                    <td style={{ padding: "8px 12px", fontWeight: 500, color: tokens.text }}>
                      {rule.field}
                    </td>
                    <td style={{ padding: "8px 12px", color: tokens.textSecondary }}>
                      {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: fonts.code, fontSize: 11, color: tokens.textSecondary }}>
                      {condStr}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: fonts.code, fontSize: 11, color: tokens.text }}>
                      {transStr}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: origin.bg,
                          color: origin.text,
                        }}
                      >
                        {rule.created_from}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                        fontWeight: 600,
                      }}
                    >
                      {fmtNum(rule.times_applied)}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                        fontWeight: 600,
                        color: (rule.accuracy ?? 0) >= 99 ? "#15803d" : (rule.accuracy ?? 0) >= 95 ? "#b45309" : tokens.red,
                      }}
                    >
                      {rule.accuracy != null ? `${rule.accuracy}%` : "--"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div
                        style={{
                          width: 32,
                          height: 18,
                          borderRadius: 9,
                          background: rule.is_active ? "#22c55e" : "#d1d5db",
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "0 2px",
                          cursor: "pointer",
                          transition: "background 200ms",
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: "#fff",
                            transform: rule.is_active ? "translateX(14px)" : "translateX(0)",
                            transition: "transform 200ms",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Teach Rule Modal */}
      {showTeachModal && (
        <TeachRuleModal onClose={() => setShowTeachModal(false)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Teach Rule Modal                                                    */
/* ------------------------------------------------------------------ */

function TeachRuleModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    source_name: "",
    field: "",
    original_value: "",
    corrected_value: "",
    rule_type: "value_map",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 440,
          maxWidth: "90vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: tokens.text }}>
          Teach a New Rule
        </h3>
        <p style={{ fontSize: 12, color: tokens.textMuted, margin: "0 0 16px" }}>
          Manually define a transformation rule. The pipeline will apply it
          automatically whenever the same pattern appears.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: tokens.text }}>
            Source (leave blank for universal)
            <input
              value={form.source_name}
              onChange={(e) => setForm({ ...form, source_name: e.target.value })}
              placeholder="e.g. Humana Claims Feed"
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                fontSize: 13,
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </label>

          <label style={{ fontSize: 12, fontWeight: 500, color: tokens.text }}>
            Field *
            <input
              value={form.field}
              onChange={(e) => setForm({ ...form, field: e.target.value })}
              placeholder="e.g. gender, date_of_birth"
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                fontSize: 13,
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: tokens.text }}>
              When value is *
              <input
                value={form.original_value}
                onChange={(e) => setForm({ ...form, original_value: e.target.value })}
                placeholder="e.g. 1"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  fontSize: 13,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 6,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </label>

            <label style={{ fontSize: 12, fontWeight: 500, color: tokens.text }}>
              Change to *
              <input
                value={form.corrected_value}
                onChange={(e) => setForm({ ...form, corrected_value: e.target.value })}
                placeholder="e.g. M"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 10px",
                  fontSize: 13,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 6,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </label>
          </div>

          <label style={{ fontSize: 12, fontWeight: 500, color: tokens.text }}>
            Rule Type
            <select
              value={form.rule_type}
              onChange={(e) => setForm({ ...form, rule_type: e.target.value })}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                fontSize: 13,
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                outline: "none",
                boxSizing: "border-box",
              }}
            >
              <option value="value_map">Value Map</option>
              <option value="format_convert">Format Convert</option>
              <option value="regex_transform">Regex Transform</option>
              <option value="code_correction">Code Correction</option>
              <option value="default_fill">Default Fill</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              color: tokens.textSecondary,
              background: "transparent",
              border: `1px solid ${tokens.border}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: tokens.accent,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Processing History Tab                                              */
/* ------------------------------------------------------------------ */

function HistoryTab({
  runs,
  selectedRun,
  setSelectedRun,
}: {
  runs: PipelineRun[];
  selectedRun: PipelineRun | null;
  setSelectedRun: (r: PipelineRun | null) => void;
}) {
  return (
    <div>
      {selectedRun ? (
        <RunDetail run={selectedRun} onBack={() => setSelectedRun(null)} />
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}`, background: tokens.surfaceAlt }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Source</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Format</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Type</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Records</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Clean %</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>AI Fixed</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Rules</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Entities</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>Time</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: tokens.textMuted, fontWeight: 500 }}>When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const cleanPct = run.total_records > 0
                  ? ((run.clean_records / run.total_records) * 100).toFixed(1)
                  : "0.0";
                return (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: `1px solid ${tokens.border}`,
                      cursor: "pointer",
                      transition: "background 150ms",
                    }}
                    onClick={() => setSelectedRun(run)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = tokens.surfaceAlt;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 500, color: tokens.text }}>
                      {run.source_name || "Unknown"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: "#f0f9ff",
                          color: "#0369a1",
                        }}
                      >
                        {FORMAT_LABELS[run.format_detected || ""] || run.format_detected}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: tokens.textSecondary }}>
                      {run.data_type_detected || "--"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                        fontWeight: 600,
                      }}
                    >
                      {fmtNum(run.total_records)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <span
                        style={{
                          fontFamily: fonts.code,
                          fontWeight: 600,
                          color: Number(cleanPct) >= 95 ? "#15803d" : Number(cleanPct) >= 90 ? "#b45309" : tokens.red,
                        }}
                      >
                        {cleanPct}%
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                      }}
                    >
                      {run.ai_cleaned}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                      }}
                    >
                      {run.rules_applied}
                      {run.rules_created > 0 && (
                        <span style={{ color: "#15803d", marginLeft: 4 }}>
                          (+{run.rules_created})
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                      }}
                    >
                      {run.entities_matched}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: fonts.code,
                        color: tokens.textMuted,
                      }}
                    >
                      {fmtMs(run.processing_time_ms)}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: tokens.textMuted,
                      }}
                    >
                      {timeAgo(run.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Run Detail View                                                     */
/* ------------------------------------------------------------------ */

function RunDetail({ run, onBack }: { run: PipelineRun; onBack: () => void }) {
  const cleanPct = run.total_records > 0
    ? ((run.clean_records / run.total_records) * 100).toFixed(1)
    : "0.0";

  return (
    <div>
      {/* Back button + header */}
      <button
        onClick={onBack}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          color: tokens.textSecondary,
          background: "transparent",
          border: `1px solid ${tokens.border}`,
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        Back to History
      </button>

      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: tokens.text,
            margin: "0 0 4px",
          }}
        >
          {run.source_name || "Unknown Source"}
        </h3>
        <p style={{ fontSize: 12, color: tokens.textMuted, margin: "0 0 16px" }}>
          {new Date(run.created_at).toLocaleString()} | Format: {FORMAT_LABELS[run.format_detected || ""] || run.format_detected} | Type: {run.data_type_detected}
        </p>

        {/* Summary Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.code, color: tokens.text }}>
              {fmtNum(run.total_records)}
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Total Records</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: fonts.code,
                color: Number(cleanPct) >= 95 ? "#15803d" : "#b45309",
              }}
            >
              {cleanPct}%
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Clean Rate</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.code, color: "#7c3aed" }}>
              {run.ai_cleaned}
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>AI Fixed</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.code, color: tokens.accent }}>
              {run.entities_matched}
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Entities Matched</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fonts.code, color: tokens.textSecondary }}>
              {fmtMs(run.processing_time_ms)}
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Processing Time</div>
          </div>
        </div>

        {/* Progress bar showing clean vs quarantined */}
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: tokens.surfaceAlt }}>
          <div
            style={{
              width: `${(run.clean_records / run.total_records) * 100}%`,
              background: "#22c55e",
            }}
          />
          <div
            style={{
              width: `${(run.quarantined_records / run.total_records) * 100}%`,
              background: tokens.red,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tokens.textMuted, marginTop: 4 }}>
          <span>{run.clean_records} clean</span>
          <span>{run.quarantined_records} quarantined</span>
        </div>
      </div>

      {/* Changes Made */}
      {run.changes && run.changes.length > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${tokens.border}`,
              background: tokens.surfaceAlt,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>
              Changes Made
            </span>
            <span style={{ fontSize: 12, color: tokens.textMuted, marginLeft: 8 }}>
              (sample of transformations applied)
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Field</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Original</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Cleaned</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: tokens.textMuted, fontWeight: 500 }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {run.changes.map((change, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500, color: tokens.text }}>
                    {change.field}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: fonts.code,
                      fontSize: 11,
                      color: tokens.red,
                    }}
                  >
                    {typeof change.original === "object" ? JSON.stringify(change.original) : String(change.original)}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: fonts.code,
                      fontSize: 11,
                      color: "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {typeof change.cleaned === "object" ? JSON.stringify(change.cleaned) : String(change.cleaned)}
                  </td>
                  <td style={{ padding: "8px 12px", color: tokens.textSecondary }}>
                    {change.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Errors if any */}
      {run.errors && (
        <div
          style={{
            background: "#fef2f2",
            borderRadius: 10,
            border: "1px solid #fecaca",
            padding: 16,
            marginTop: 16,
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", margin: "0 0 8px" }}>
            Errors
          </h4>
          <pre
            style={{
              fontSize: 11,
              fontFamily: fonts.code,
              color: "#991b1b",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(run.errors, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
