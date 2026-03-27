import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ProtectionLayer {
  name: string;
  status: string;
  description: string;
  metric: string;
  last_triggered: string;
  effectiveness: number;
}

interface ProtectionDashboard {
  overall_score: number;
  layers: ProtectionLayer[];
}

interface Fingerprint {
  id: number;
  source_name: string;
  fingerprint_hash: string;
  column_count: number;
  column_names: string[];
  date_formats: Record<string, string> | null;
  value_patterns: Record<string, string> | null;
  mapping_template_id: number | null;
  times_matched: number;
  created_at: string;
  updated_at: string;
}

interface DataContract {
  id: number;
  name: string;
  source_name: string | null;
  contract_rules: Record<string, any>;
  is_active: boolean;
  violations_last_30d?: number;
  last_tested?: string | null;
  created_at: string;
  updated_at: string;
}

interface GoldenRecord {
  id: number;
  member_id: number;
  field_name: string;
  value: string | null;
  source: string;
  source_priority: number;
  confidence: number;
  updated_at: string;
}

interface IngestionBatch {
  id: number;
  source_name: string | null;
  upload_job_id: number | null;
  record_count: number;
  status: string;
  rolled_back_at: string | null;
  rolled_back_by: number | null;
  rollback_reason: string | null;
  created_at: string;
}

type Tab = "overview" | "fingerprints" | "contracts" | "golden" | "batches";

/* ------------------------------------------------------------------ */
/* Helper components                                                   */
/* ------------------------------------------------------------------ */

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#166534" },
    blue: { bg: "#dbeafe", fg: "#1e40af" },
    red: { bg: "#fee2e2", fg: "#991b1b" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    gray: { bg: "#f1f5f9", fg: "#475569" },
    purple: { bg: "#f3e8ff", fg: "#6b21a8" },
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {children}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 90 ? "#22c55e" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3 }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 30 }}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export function DataProtectionPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<ProtectionDashboard | null>(null);
  const [fingerprints, setFingerprints] = useState<Fingerprint[]>([]);
  const [contracts, setContracts] = useState<DataContract[]>([]);
  const [goldenRecords, setGoldenRecords] = useState<GoldenRecord[]>([]);
  const [batches, setBatches] = useState<IngestionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("1001");
  const [rollbackTarget, setRollbackTarget] = useState<IngestionBatch | null>(null);
  const [showContractForm, setShowContractForm] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get("/api/data-protection/dashboard");
      setDashboard(res.data);
    } catch { /* empty */ }
  }, []);

  const fetchFingerprints = useCallback(async () => {
    try {
      const res = await api.get("/api/data-protection/fingerprints");
      setFingerprints(res.data);
    } catch { /* empty */ }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await api.get("/api/data-protection/contracts");
      setContracts(res.data);
    } catch { /* empty */ }
  }, []);

  const fetchGoldenRecords = useCallback(async (memberId: string) => {
    try {
      const res = await api.get("/api/data-protection/golden-records", { params: { member_id: memberId } });
      setGoldenRecords(res.data);
    } catch { /* empty */ }
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await api.get("/api/data-protection/batches");
      setBatches(res.data);
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDashboard(), fetchFingerprints(), fetchContracts(), fetchGoldenRecords("1001"), fetchBatches()]).finally(() => setLoading(false));
  }, [fetchDashboard, fetchFingerprints, fetchContracts, fetchGoldenRecords, fetchBatches]);

  const handleRollback = async (batch: IngestionBatch) => {
    try {
      await api.post(`/api/data-protection/rollback/${batch.id}`, { reason: "Manual rollback from Data Protection page" });
      await fetchBatches();
      setRollbackTarget(null);
    } catch { /* empty */ }
  };

  const handleSearchGolden = () => {
    if (memberSearch.trim()) {
      fetchGoldenRecords(memberSearch.trim());
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "fingerprints", label: "Fingerprints" },
    { key: "contracts", label: "Contracts" },
    { key: "golden", label: "Golden Records" },
    { key: "batches", label: "Batches" },
  ];

  if (loading) {
    return (
      <div style={{ padding: 32, color: tokens.textMuted, fontFamily: fonts.body }}>
        Loading data protection...
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", fontFamily: fonts.body, color: tokens.text }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, margin: 0 }}>
          Data Protection
        </h1>
        <p style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
          8 layers of defense against bad data across the ingestion pipeline
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 24 }}>
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

      {/* Tab content */}
      {tab === "overview" && <OverviewTab dashboard={dashboard} />}
      {tab === "fingerprints" && <FingerprintsTab fingerprints={fingerprints} />}
      {tab === "contracts" && (
        <ContractsTab
          contracts={contracts}
          showForm={showContractForm}
          onToggleForm={() => setShowContractForm(!showContractForm)}
          onCreated={() => { setShowContractForm(false); fetchContracts(); }}
        />
      )}
      {tab === "golden" && (
        <GoldenRecordsTab
          records={goldenRecords}
          memberSearch={memberSearch}
          onSearchChange={setMemberSearch}
          onSearch={handleSearchGolden}
        />
      )}
      {tab === "batches" && (
        <BatchesTab
          batches={batches}
          rollbackTarget={rollbackTarget}
          onRollbackClick={setRollbackTarget}
          onRollbackConfirm={handleRollback}
          onRollbackCancel={() => setRollbackTarget(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview Tab                                                        */
/* ------------------------------------------------------------------ */

function OverviewTab({ dashboard }: { dashboard: ProtectionDashboard | null }) {
  if (!dashboard) return null;

  const scoreColor =
    dashboard.overall_score >= 90
      ? "#22c55e"
      : dashboard.overall_score >= 70
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div>
      {/* Overall score */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: 20,
          background: "#ffffff",
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: `4px solid ${scoreColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 700, color: scoreColor }}>
            {dashboard.overall_score}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Overall Data Protection Score</div>
          <div style={{ fontSize: 13, color: tokens.textMuted, marginTop: 2 }}>
            All 8 protection layers are active and monitoring your data pipeline
          </div>
        </div>
      </div>

      {/* Layer cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {dashboard.layers.map((layer, i) => (
          <div
            key={i}
            style={{
              padding: 20,
              background: "#ffffff",
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {i + 1}. {layer.name}
              </div>
              <Badge color="green">{layer.status}</Badge>
            </div>
            <p style={{ fontSize: 12, color: tokens.textMuted, margin: "0 0 12px" }}>
              {layer.description}
            </p>
            <div style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 8 }}>
              {layer.metric}
            </div>
            <div style={{ marginBottom: 4 }}>
              <ConfidenceBar value={layer.effectiveness} />
            </div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>
              Last triggered: {layer.last_triggered}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fingerprints Tab                                                    */
/* ------------------------------------------------------------------ */

function FingerprintsTab({ fingerprints }: { fingerprints: Fingerprint[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        Known Source Fingerprints ({fingerprints.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {fingerprints.map((fp) => (
          <div
            key={fp.id}
            style={{
              padding: 20,
              background: "#ffffff",
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === fp.id ? null : fp.id)}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fp.source_name}</div>
                <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 2 }}>
                  {fp.column_count} columns &middot; Matched {fp.times_matched} times &middot; Last seen{" "}
                  {new Date(fp.updated_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge color="blue">{fp.times_matched} matches</Badge>
                <span style={{ fontSize: 14, color: tokens.textMuted }}>{expanded === fp.id ? "\u25B2" : "\u25BC"}</span>
              </div>
            </div>

            {expanded === fp.id && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${tokens.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Columns</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                  {fp.column_names.map((col) => (
                    <span
                      key={col}
                      style={{
                        padding: "2px 8px",
                        background: "#f1f5f9",
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: tokens.textSecondary,
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>

                {fp.date_formats && Object.keys(fp.date_formats).length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Date Formats</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {Object.entries(fp.date_formats).map(([col, fmt]) => (
                        <span key={col} style={{ fontSize: 11, color: tokens.textSecondary }}>
                          <strong>{col}:</strong> {fmt}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {fp.value_patterns && Object.keys(fp.value_patterns).length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Value Patterns</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Object.entries(fp.value_patterns).map(([col, pat]) => (
                        <span key={col} style={{ fontSize: 11, color: tokens.textSecondary }}>
                          <strong>{col}:</strong> {pat}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ marginTop: 12, fontSize: 11, color: tokens.textMuted }}>
                  Hash: <span style={{ fontFamily: "monospace" }}>{fp.fingerprint_hash.substring(0, 16)}...</span>
                  {fp.mapping_template_id && <span> &middot; Linked to mapping template #{fp.mapping_template_id}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contracts Tab                                                       */
/* ------------------------------------------------------------------ */

function ContractsTab({
  contracts,
  showForm,
  onToggleForm,
  onCreated,
}: {
  contracts: DataContract[];
  showForm: boolean;
  onToggleForm: () => void;
  onCreated: () => void;
}) {
  const [formName, setFormName] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formRules, setFormRules] = useState('{\n  "required_columns": [],\n  "column_types": {},\n  "row_count_range": { "min": 0, "max": 100000 }\n}');

  const handleCreate = async () => {
    try {
      let rules: Record<string, any> = {};
      try {
        rules = JSON.parse(formRules);
      } catch {
        return;
      }
      await api.post("/api/data-protection/contracts", {
        name: formName,
        source_name: formSource || null,
        contract_rules: rules,
      });
      setFormName("");
      setFormSource("");
      onCreated();
    } catch { /* empty */ }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Active Data Contracts ({contracts.length})</div>
        <button
          onClick={onToggleForm}
          style={{
            padding: "6px 16px",
            fontSize: 12,
            fontWeight: 600,
            color: "#ffffff",
            background: tokens.accent,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ New Contract"}
        </button>
      </div>

      {showForm && (
        <div
          style={{
            padding: 20,
            background: "#ffffff",
            borderRadius: 10,
            border: `1px solid ${tokens.accent}`,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Create Data Contract</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Contract Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Monthly Roster Contract"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 13,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Source Name (optional)</label>
              <input
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="e.g. Acme Health Plan"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 13,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Contract Rules (JSON)</label>
            <textarea
              value={formRules}
              onChange={(e) => setFormRules(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 12,
                fontFamily: "monospace",
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!formName.trim()}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#ffffff",
              background: formName.trim() ? tokens.accent : "#94a3b8",
              border: "none",
              borderRadius: 6,
              cursor: formName.trim() ? "pointer" : "default",
            }}
          >
            Create Contract
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {contracts.map((c) => {
          const ruleCount = Object.keys(c.contract_rules).length;
          const reqCols = (c.contract_rules.required_columns || []).length;
          return (
            <div
              key={c.id}
              style={{
                padding: 20,
                background: "#ffffff",
                borderRadius: 10,
                border: `1px solid ${tokens.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  {c.source_name && (
                    <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 2 }}>
                      Source: {c.source_name}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge color={c.is_active ? "green" : "gray"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  {c.violations_last_30d !== undefined && c.violations_last_30d > 0 && (
                    <Badge color="amber">{c.violations_last_30d} violations</Badge>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: tokens.textSecondary }}>
                {ruleCount} rule categories &middot; {reqCols} required columns
                {c.contract_rules.row_count_range && (
                  <span>
                    {" "}&middot; Row range: {c.contract_rules.row_count_range.min?.toLocaleString()}
                    {" "}- {c.contract_rules.row_count_range.max?.toLocaleString()}
                  </span>
                )}
              </div>
              {c.last_tested && (
                <div style={{ marginTop: 4, fontSize: 11, color: tokens.textMuted }}>
                  Last tested: {new Date(c.last_tested).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Golden Records Tab                                                  */
/* ------------------------------------------------------------------ */

function GoldenRecordsTab({
  records,
  memberSearch,
  onSearchChange,
  onSearch,
}: {
  records: GoldenRecord[];
  memberSearch: string;
  onSearchChange: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Member ID:</label>
        <input
          value={memberSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Enter member ID"
          style={{
            padding: "8px 12px",
            fontSize: 13,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            width: 200,
          }}
        />
        <button
          onClick={onSearch}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            color: "#ffffff",
            background: tokens.accent,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </div>

      {records.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: tokens.textMuted, fontSize: 13 }}>
          No golden records found for this member
        </div>
      ) : (
        <div
          style={{
            background: "#ffffff",
            borderRadius: 10,
            border: `1px solid ${tokens.border}`,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${tokens.border}`, fontSize: 14, fontWeight: 600 }}>
            Golden Record for Member #{records[0]?.member_id}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Value</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Priority</th>
                <th style={{ ...thStyle, width: 120 }}>Confidence</th>
                <th style={thStyle}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500 }}>{formatFieldName(r.field_name)}</span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{r.value || "--"}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: tokens.textSecondary }}>{r.source}</td>
                  <td style={tdStyle}>
                    <Badge color={r.source_priority >= 80 ? "blue" : "gray"}>{r.source_priority}</Badge>
                  </td>
                  <td style={tdStyle}>
                    <ConfidenceBar value={r.confidence} />
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: tokens.textMuted }}>
                    {new Date(r.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batches Tab                                                         */
/* ------------------------------------------------------------------ */

function BatchesTab({
  batches,
  rollbackTarget,
  onRollbackClick,
  onRollbackConfirm,
  onRollbackCancel,
}: {
  batches: IngestionBatch[];
  rollbackTarget: IngestionBatch | null;
  onRollbackClick: (b: IngestionBatch) => void;
  onRollbackConfirm: (b: IngestionBatch) => void;
  onRollbackCancel: () => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        Ingestion Batches ({batches.length})
      </div>

      {/* Rollback confirmation dialog */}
      {rollbackTarget && (
        <div
          style={{
            padding: 20,
            background: "#fef2f2",
            borderRadius: 10,
            border: "1px solid #fca5a5",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#991b1b", marginBottom: 8 }}>
            Confirm Rollback
          </div>
          <p style={{ fontSize: 13, color: "#7f1d1d", margin: "0 0 12px" }}>
            Are you sure you want to rollback batch #{rollbackTarget.id} from{" "}
            <strong>{rollbackTarget.source_name}</strong>? This will undo{" "}
            <strong>{rollbackTarget.record_count.toLocaleString()}</strong> records.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onRollbackConfirm(rollbackTarget)}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#ffffff",
                background: "#dc2626",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Yes, Rollback
            </button>
            <button
              onClick={onRollbackCancel}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: tokens.textSecondary,
                background: "#ffffff",
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          background: "#ffffff",
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              <th style={thStyle}>Batch</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Records</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600 }}>#{b.id}</span>
                  {b.upload_job_id && (
                    <span style={{ fontSize: 11, color: tokens.textMuted, marginLeft: 6 }}>
                      (Job #{b.upload_job_id})
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{b.source_name || "--"}</td>
                <td style={tdStyle}>{b.record_count.toLocaleString()}</td>
                <td style={tdStyle}>
                  <Badge color={b.status === "active" ? "green" : "red"}>{b.status}</Badge>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: tokens.textMuted }}>
                  {new Date(b.created_at).toLocaleString()}
                </td>
                <td style={tdStyle}>
                  {b.status === "active" ? (
                    <button
                      onClick={() => onRollbackClick(b)}
                      style={{
                        padding: "4px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fee2e2",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Rollback
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>
                      Rolled back {b.rolled_back_at ? new Date(b.rolled_back_at).toLocaleDateString() : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show rollback reason for rolled-back batches */}
      {batches
        .filter((b) => b.status === "rolled_back" && b.rollback_reason)
        .map((b) => (
          <div
            key={`reason-${b.id}`}
            style={{
              marginTop: 12,
              padding: 16,
              background: "#fef2f2",
              borderRadius: 8,
              border: "1px solid #fecaca",
              fontSize: 12,
            }}
          >
            <strong>Batch #{b.id} rollback reason:</strong> {b.rollback_reason}
          </div>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared styles                                                       */
/* ------------------------------------------------------------------ */

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
};

function formatFieldName(field: string): string {
  return field
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
