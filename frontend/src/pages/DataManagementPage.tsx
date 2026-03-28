import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { tokens, fonts } from "../lib/tokens";
import { Tag } from "../components/ui/Tag";
import { DataRequirementsChecklist } from "../components/onboarding/DataRequirementsChecklist";
import { FileUpload } from "../components/ingestion/FileUpload";

/* ------------------------------------------------------------------ */
/* Collapsible section state — persisted to localStorage               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "aqsoft_data_mgmt_sections";

type SectionKey =
  | "organization"
  | "dataStatus"
  | "upload"
  | "analysis"
  | "payers";

const DEFAULT_EXPANDED: Record<SectionKey, boolean> = {
  organization: true,
  dataStatus: true,
  upload: false,
  analysis: true,
  payers: false,
};

function loadSectionState(): Record<SectionKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_EXPANDED, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_EXPANDED };
}

function saveSectionState(state: Record<SectionKey, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full */
  }
}

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

interface OrgNode {
  id: number;
  name: string;
  tin?: string;
  type: "mso" | "office" | "provider";
  npi?: string;
  specialty?: string;
  relationship?: "owned" | "affiliated";
  children?: OrgNode[];
}

const MOCK_ORG_TREE: OrgNode = {
  id: 0,
  name: "Southeast Medicare Partners",
  type: "mso",
  children: [
    {
      id: 1,
      name: "Palm Beach Internal Medicine",
      tin: "59-1234567",
      type: "office",
      relationship: "owned",
      children: [
        { id: 10, name: "Dr. Sarah Chen", npi: "1234567890", type: "provider", specialty: "Internal Medicine" },
        { id: 11, name: "Dr. Michael Rivera", npi: "2345678901", type: "provider", specialty: "Internal Medicine" },
        { id: 12, name: "Dr. Emily Park", npi: "3456789012", type: "provider", specialty: "Geriatrics" },
      ],
    },
    {
      id: 2,
      name: "Broward Family Health",
      tin: "59-2345678",
      type: "office",
      relationship: "owned",
      children: [
        { id: 20, name: "Dr. James Wilson", npi: "4567890123", type: "provider", specialty: "Family Medicine" },
        { id: 21, name: "Dr. Lisa Thompson", npi: "5678901234", type: "provider", specialty: "Family Medicine" },
      ],
    },
    {
      id: 3,
      name: "Coral Springs Cardiology",
      tin: "59-3456789",
      type: "office",
      relationship: "affiliated",
      children: [
        { id: 30, name: "Dr. Robert Martinez", npi: "6789012345", type: "provider", specialty: "Cardiology" },
      ],
    },
  ],
};

const MOCK_AI_PENDING = [
  { npi: "7890123456", name: "Dr. Amanda Foster", specialty: "Endocrinology", source: "March claims upload" },
  { npi: "8901234567", name: "Dr. Kevin Patel", specialty: "Pulmonology", source: "March claims upload" },
];

interface DataUploadRecord {
  type: string;
  label: string;
  lastUpload: string | null;
  rowCount: number | null;
  daysOld: number | null;
}

const MOCK_DATA_STATUS: DataUploadRecord[] = [
  { type: "medical_claims", label: "Medical Claims", lastUpload: "2026-03-15", rowCount: 45280, daysOld: 12 },
  { type: "pharmacy_claims", label: "Pharmacy Claims", lastUpload: "2026-03-10", rowCount: 22140, daysOld: 17 },
  { type: "roster", label: "Member Roster", lastUpload: "2026-03-01", rowCount: 3420, daysOld: 26 },
  { type: "provider_roster", label: "Provider Roster", lastUpload: "2026-02-15", rowCount: 48, daysOld: 40 },
  { type: "risk_scores", label: "Risk Scores / RAF", lastUpload: "2026-02-01", rowCount: 3200, daysOld: 54 },
  { type: "care_gaps", label: "Care Gaps", lastUpload: null, rowCount: null, daysOld: null },
  { type: "lab_results", label: "Lab Results", lastUpload: null, rowCount: null, daysOld: null },
];

interface AnalysisRun {
  key: string;
  label: string;
  lastRun: string | null;
  summary: string | null;
  autoRun: boolean;
}

const MOCK_ANALYSIS: AnalysisRun[] = [
  { key: "hcc", label: "HCC Analysis", lastRun: "2026-03-27T12:34:00Z", summary: "3 new suspects found", autoRun: true },
  { key: "scorecards", label: "Provider Scorecards", lastRun: "2026-03-27T12:34:00Z", summary: "42 providers scored", autoRun: true },
  { key: "care_gaps", label: "Care Gap Detection", lastRun: "2026-03-27T12:34:00Z", summary: "128 open gaps", autoRun: true },
  { key: "insights", label: "AI Insights", lastRun: "2026-03-26T09:15:00Z", summary: "5 new insights generated", autoRun: false },
];

interface PayerConnection {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
  memberCount: number | null;
}

const MOCK_PAYERS: PayerConnection[] = [
  { id: "humana", name: "Humana MA", status: "connected", lastSync: "2026-03-27T08:00:00Z", memberCount: 2180 },
  { id: "uhc", name: "UnitedHealthcare MA", status: "connected", lastSync: "2026-03-26T22:00:00Z", memberCount: 1240 },
  { id: "aetna", name: "Aetna Medicare", status: "error", lastSync: "2026-03-20T14:00:00Z", memberCount: 890 },
  { id: "cigna", name: "Cigna Medicare", status: "disconnected", lastSync: null, memberCount: null },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function freshnessVariant(daysOld: number | null): "green" | "amber" | "red" {
  if (daysOld === null) return "red";
  if (daysOld <= 14) return "green";
  if (daysOld <= 30) return "amber";
  return "red";
}

/* ------------------------------------------------------------------ */
/* Collapsible Panel wrapper                                           */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  subtitle,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[10px] mb-4"
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            {title}
          </span>
          {badge}
          {subtitle && (
            <span className="text-xs" style={{ color: tokens.textMuted }}>
              {subtitle}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
            display: "inline-block",
          }}
        >
          {"\u25BC"}
        </span>
      </button>
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Organization Tree renderer                                          */
/* ------------------------------------------------------------------ */

function OrgTreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 20;

  const typeColors: Record<string, { bg: string; text: string }> = {
    mso: { bg: tokens.blueSoft, text: "#1e40af" },
    office: { bg: tokens.accentSoft, text: tokens.accentText },
    provider: { bg: tokens.surfaceAlt, text: tokens.textSecondary },
  };

  const style = typeColors[node.type] || typeColors.provider;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 rounded-lg px-2 group"
        style={{ marginLeft: indent }}
        onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surfaceAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              color: tokens.textMuted,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 150ms",
              width: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {"\u25B8"}
          </button>
        ) : (
          <span style={{ width: 14, display: "inline-block" }} />
        )}

        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ background: style.bg, color: style.text }}
        >
          {node.type === "mso" ? "MSO" : node.type === "office" ? "Office" : "Provider"}
        </span>

        <span className="text-xs font-medium" style={{ color: tokens.text }}>
          {node.name}
        </span>

        {node.tin && (
          <span
            className="text-[10px]"
            style={{ color: tokens.textMuted, fontFamily: fonts.code }}
          >
            TIN: {node.tin}
          </span>
        )}

        {node.npi && (
          <span
            className="text-[10px]"
            style={{ color: tokens.textMuted, fontFamily: fonts.code }}
          >
            NPI: {node.npi}
          </span>
        )}

        {node.specialty && (
          <span className="text-[10px]" style={{ color: tokens.textMuted }}>
            {node.specialty}
          </span>
        )}

        {node.relationship && (
          <Tag variant={node.relationship === "owned" ? "green" : "blue"}>
            {node.relationship}
          </Tag>
        )}
      </div>
      {expanded && hasChildren && node.children!.map((child) => (
        <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export function DataManagementPage() {
  const navigate = useNavigate();
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(loadSectionState);
  const [analysisState, setAnalysisState] = useState<AnalysisRun[]>(MOCK_ANALYSIS);
  const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());
  const [pendingNpis, setPendingNpis] = useState(MOCK_AI_PENDING);
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  useEffect(() => {
    saveSectionState(sections);
  }, [sections]);

  const toggleSection = useCallback((key: SectionKey) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleRunAnalysis = useCallback((key: string) => {
    setRunningKeys((prev) => new Set([...prev, key]));
    // Simulate a run
    setTimeout(() => {
      setRunningKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setAnalysisState((prev) =>
        prev.map((a) =>
          a.key === key ? { ...a, lastRun: new Date().toISOString() } : a,
        ),
      );
    }, 2000);
  }, []);

  const handleToggleAutoRun = useCallback((key: string) => {
    setAnalysisState((prev) =>
      prev.map((a) =>
        a.key === key ? { ...a, autoRun: !a.autoRun } : a,
      ),
    );
  }, []);

  const handleApproveNpi = useCallback((npi: string) => {
    setPendingNpis((prev) => prev.filter((p) => p.npi !== npi));
  }, []);

  const handleDismissNpi = useCallback((npi: string) => {
    setPendingNpis((prev) => prev.filter((p) => p.npi !== npi));
  }, []);

  // Collect all offices for group pre-selector
  const officeOptions = MOCK_ORG_TREE.children?.filter((c) => c.type === "office") || [];

  return (
    <div className="px-8 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ fontFamily: fonts.heading, color: tokens.text, margin: 0 }}
          >
            Data Management
          </h1>
          <p className="text-xs mt-1" style={{ color: tokens.textMuted }}>
            Organization structure, data uploads, analysis pipelines, and payer connections.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/onboarding")}
            className="text-xs px-4 py-2 rounded-lg font-medium"
            style={{
              color: tokens.textSecondary,
              border: `1px solid ${tokens.border}`,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Setup Wizard
          </button>
          <button
            onClick={() => navigate("/data-quality")}
            className="text-xs px-4 py-2 rounded-lg font-medium"
            style={{
              color: tokens.textSecondary,
              border: `1px solid ${tokens.border}`,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Data Quality
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. Organization Panel                                         */}
      {/* ============================================================ */}
      <Panel
        title="Organization Structure"
        subtitle={`${officeOptions.length} offices`}
        badge={
          pendingNpis.length > 0 ? (
            <Tag variant="amber">{pendingNpis.length} pending NPIs</Tag>
          ) : undefined
        }
        expanded={sections.organization}
        onToggle={() => toggleSection("organization")}
      >
        <div className="pt-3">
          {/* AI Pending Queue */}
          {pendingNpis.length > 0 && (
            <div
              className="rounded-lg p-3 mb-4"
              style={{ background: tokens.amberSoft, border: `1px solid #fde68a` }}
            >
              <div
                className="text-xs font-semibold mb-2"
                style={{ color: "#92400e" }}
              >
                AI Discovery: {pendingNpis.length} new NPI{pendingNpis.length !== 1 ? "s" : ""} found in latest upload
              </div>
              {pendingNpis.map((p) => (
                <div
                  key={p.npi}
                  className="flex items-center justify-between py-2"
                  style={{ borderTop: `1px solid #fde68a` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium" style={{ color: "#92400e" }}>
                      {p.name}
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: "#92400e", fontFamily: fonts.code }}
                    >
                      NPI: {p.npi}
                    </span>
                    <span className="text-[10px]" style={{ color: "#92400e", opacity: 0.7 }}>
                      {p.specialty}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveNpi(p.npi)}
                      className="text-[11px] px-3 py-1 rounded font-medium"
                      style={{
                        background: tokens.accent,
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => handleDismissNpi(p.npi)}
                      className="text-[11px] px-3 py-1 rounded font-medium"
                      style={{
                        background: "transparent",
                        color: "#92400e",
                        border: `1px solid #fde68a`,
                        cursor: "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Org Tree */}
          <div className="mb-3">
            <OrgTreeNode node={MOCK_ORG_TREE} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
            <button
              className="text-xs px-4 py-2 rounded-lg font-medium"
              style={{
                background: tokens.accent,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Add Office
            </button>
            <button
              className="text-xs px-4 py-2 rounded-lg font-medium"
              style={{
                background: "transparent",
                color: tokens.textSecondary,
                border: `1px solid ${tokens.border}`,
                cursor: "pointer",
              }}
            >
              Add Provider
            </button>
          </div>
        </div>
      </Panel>

      {/* ============================================================ */}
      {/* 2. Data Status Panel                                          */}
      {/* ============================================================ */}
      <Panel
        title="Data Status"
        badge={
          <Tag variant={MOCK_DATA_STATUS.some((d) => (d.daysOld ?? 999) > 30) ? "amber" : "green"}>
            {MOCK_DATA_STATUS.filter((d) => d.lastUpload).length}/{MOCK_DATA_STATUS.length} loaded
          </Tag>
        }
        expanded={sections.dataStatus}
        onToggle={() => toggleSection("dataStatus")}
      >
        <div className="pt-3">
          {/* Freshness table */}
          <div
            className="rounded-lg overflow-hidden mb-4"
            style={{ border: `1px solid ${tokens.borderSoft}` }}
          >
            <table className="w-full text-xs" style={{ color: tokens.text }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: tokens.textMuted }}>
                    Data Type
                  </th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: tokens.textMuted }}>
                    Last Upload
                  </th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: tokens.textMuted }}>
                    Rows
                  </th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: tokens.textMuted }}>
                    Freshness
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_DATA_STATUS.map((d) => (
                  <tr
                    key={d.type}
                    style={{ borderTop: `1px solid ${tokens.borderSoft}` }}
                  >
                    <td className="px-3 py-2 font-medium">{d.label}</td>
                    <td className="px-3 py-2" style={{ color: tokens.textSecondary }}>
                      {d.lastUpload || "--"}
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      style={{ color: tokens.textSecondary, fontFamily: fonts.code }}
                    >
                      {d.rowCount?.toLocaleString() || "--"}
                    </td>
                    <td className="px-3 py-2">
                      {d.daysOld !== null ? (
                        <Tag variant={freshnessVariant(d.daysOld)}>
                          {d.daysOld} days
                        </Tag>
                      ) : (
                        <Tag variant="red">Not uploaded</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Freshness alerts */}
          {MOCK_DATA_STATUS.filter((d) => (d.daysOld ?? 999) > 30).map((d) => (
            <div
              key={d.type}
              className="flex items-center gap-2 text-xs py-1.5"
              style={{ color: tokens.amber }}
            >
              <span style={{ fontSize: 14 }}>{"!"}</span>
              <span>
                <strong>{d.label}</strong> is {d.daysOld} days old — consider refreshing.
              </span>
            </div>
          ))}
          {MOCK_DATA_STATUS.filter((d) => !d.lastUpload).map((d) => (
            <div
              key={d.type}
              className="flex items-center gap-2 text-xs py-1.5"
              style={{ color: tokens.red }}
            >
              <span style={{ fontSize: 14 }}>{"!"}</span>
              <span>
                <strong>{d.label}</strong> has never been uploaded.
              </span>
            </div>
          ))}

          {/* Data Requirements Checklist — reused component */}
          <div className="mt-4">
            <DataRequirementsChecklist />
          </div>
        </div>
      </Panel>

      {/* ============================================================ */}
      {/* 3. Upload Zone                                                */}
      {/* ============================================================ */}
      <Panel
        title="Upload Data"
        subtitle="CSV or Excel"
        expanded={sections.upload}
        onToggle={() => toggleSection("upload")}
      >
        <div className="pt-3">
          {/* Practice group pre-selector */}
          <div className="mb-4">
            <label
              className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: tokens.textMuted }}
            >
              Pre-assign to Practice Group (optional)
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg outline-none w-full max-w-xs"
              style={{
                border: `1px solid ${tokens.border}`,
                color: tokens.text,
                background: tokens.surface,
              }}
            >
              <option value="">Auto-detect from file</option>
              {officeOptions.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name} {o.tin ? `(${o.tin})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Smart mapping prompt (mock) */}
          <div
            className="rounded-lg p-3 mb-4 flex items-center justify-between"
            style={{ background: tokens.blueSoft, border: `1px solid #bfdbfe` }}
          >
            <div className="text-xs" style={{ color: "#1e40af" }}>
              Same format as last month? This looks like your Humana claims layout.
              <strong> Use same mapping?</strong>
            </div>
            <div className="flex gap-2 ml-4 flex-shrink-0">
              <button
                className="text-[11px] px-3 py-1 rounded font-medium"
                style={{
                  background: tokens.blue,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Yes, reuse
              </button>
              <button
                className="text-[11px] px-3 py-1 rounded font-medium"
                style={{
                  background: "transparent",
                  color: "#1e40af",
                  border: `1px solid #bfdbfe`,
                  cursor: "pointer",
                }}
              >
                New mapping
              </button>
            </div>
          </div>

          {/* FileUpload component — reused */}
          <FileUpload
            onUploadComplete={(result) => {
              // In a real app, navigate to column mapper or process
              console.log("Upload complete:", result);
              navigate(`/ingestion?job=${result.job_id}`);
            }}
          />
        </div>
      </Panel>

      {/* ============================================================ */}
      {/* 4. Analysis Status Panel                                      */}
      {/* ============================================================ */}
      <Panel
        title="Analysis Pipelines"
        badge={
          analysisState[0]?.lastRun ? (
            <Tag variant="green">Last run {formatRelativeTime(analysisState[0].lastRun)}</Tag>
          ) : undefined
        }
        expanded={sections.analysis}
        onToggle={() => toggleSection("analysis")}
      >
        <div className="pt-3">
          {/* Summary */}
          <div
            className="rounded-lg p-3 mb-4 text-xs"
            style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}
          >
            Last full analysis completed {analysisState[0]?.lastRun ? formatRelativeTime(analysisState[0].lastRun) : "never"}.
            {" "}{analysisState[0]?.summary || ""}
          </div>

          {/* Analysis rows */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${tokens.borderSoft}` }}
          >
            {analysisState.map((a, i) => (
              <div
                key={a.key}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : "none",
                }}
              >
                <div className="flex-1">
                  <div className="text-xs font-medium" style={{ color: tokens.text }}>
                    {a.label}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: tokens.textMuted }}>
                    {a.lastRun ? `Last run: ${formatRelativeTime(a.lastRun)}` : "Never run"}
                    {a.summary && ` \u00B7 ${a.summary}`}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Auto-run toggle */}
                  <label
                    className="flex items-center gap-1.5 cursor-pointer"
                    title={a.autoRun ? "Auto-run enabled" : "Auto-run disabled"}
                  >
                    <span className="text-[10px]" style={{ color: tokens.textMuted }}>
                      Auto
                    </span>
                    <div
                      onClick={() => handleToggleAutoRun(a.key)}
                      style={{
                        width: 28,
                        height: 16,
                        borderRadius: 8,
                        background: a.autoRun ? tokens.accent : tokens.border,
                        position: "relative",
                        cursor: "pointer",
                        transition: "background 200ms",
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: "#fff",
                          position: "absolute",
                          top: 2,
                          left: a.autoRun ? 14 : 2,
                          transition: "left 200ms",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                        }}
                      />
                    </div>
                  </label>

                  {/* Run Now button */}
                  <button
                    onClick={() => handleRunAnalysis(a.key)}
                    disabled={runningKeys.has(a.key)}
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-50"
                    style={{
                      background: tokens.accent,
                      color: "#fff",
                      border: "none",
                      cursor: runningKeys.has(a.key) ? "not-allowed" : "pointer",
                    }}
                  >
                    {runningKeys.has(a.key) ? "Running..." : "Run Now"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ============================================================ */}
      {/* 5. Connected Payers Panel                                     */}
      {/* ============================================================ */}
      <Panel
        title="Connected Payers"
        badge={
          <Tag variant={MOCK_PAYERS.some((p) => p.status === "error") ? "amber" : "green"}>
            {MOCK_PAYERS.filter((p) => p.status === "connected").length}/{MOCK_PAYERS.length} connected
          </Tag>
        }
        expanded={sections.payers}
        onToggle={() => toggleSection("payers")}
      >
        <div className="pt-3">
          <div
            className="rounded-lg overflow-hidden mb-4"
            style={{ border: `1px solid ${tokens.borderSoft}` }}
          >
            {MOCK_PAYERS.map((payer, i) => {
              const statusVariant: Record<string, "green" | "red" | "amber"> = {
                connected: "green",
                disconnected: "red",
                error: "amber",
              };
              return (
                <div
                  key={payer.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : "none",
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: tokens.text }}>
                        {payer.name}
                      </span>
                      <Tag variant={statusVariant[payer.status] || "default"}>
                        {payer.status}
                      </Tag>
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: tokens.textMuted }}>
                      {payer.lastSync ? `Last sync: ${formatRelativeTime(payer.lastSync)}` : "Never synced"}
                      {payer.memberCount != null && ` \u00B7 ${payer.memberCount.toLocaleString()} members`}
                    </div>
                  </div>

                  <button
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium"
                    style={{
                      background: payer.status === "connected" ? "transparent" : tokens.accent,
                      color: payer.status === "connected" ? tokens.textSecondary : "#fff",
                      border: payer.status === "connected" ? `1px solid ${tokens.border}` : "none",
                      cursor: "pointer",
                    }}
                  >
                    {payer.status === "connected" ? "Sync Now" : payer.status === "error" ? "Reconnect" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate("/onboarding?step=payers")}
            className="text-xs px-4 py-2 rounded-lg font-medium"
            style={{
              background: "transparent",
              color: tokens.accent,
              border: `1px solid ${tokens.accent}`,
              cursor: "pointer",
            }}
          >
            Connect New Payer
          </button>
        </div>
      </Panel>
    </div>
  );
}
