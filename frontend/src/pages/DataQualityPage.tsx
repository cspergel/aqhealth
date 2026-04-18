import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "quarantine" | "resolution" | "lineage";

interface QualityCheck {
  name: string;
  status: string;
  details: string;
  severity: string;
}

interface QualityReport {
  id: number;
  upload_job_id: number | null;
  overall_score: number;
  total_rows: number;
  valid_rows: number;
  quarantined_rows: number;
  warning_rows: number;
  checks: QualityCheck[];
  summary: string | null;
  created_at: string;
}

interface QuarantinedRecord {
  id: number;
  upload_job_id: number | null;
  source_type: string;
  row_number: number | null;
  raw_data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  status: string;
  created_at: string;
}

interface UnresolvedMatch {
  id: number;
  source_record: Record<string, unknown>;
  candidates: { id: number; member_external_id: string; first_name: string; last_name: string; date_of_birth: string; gender: string; health_plan: string; zip_code?: string; confidence: number }[];
  match_type: string;
  confidence: number;
  status: string;
}

interface LineageEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  source_system: string;
  source_file: string | null;
  source_row: number | null;
  ingestion_job_id: number | null;
  field_changes: Record<string, unknown> | null;
  created_at: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 90) return tokens.accent;
  if (score >= 70) return tokens.amber;
  return tokens.red;
}

function scoreBg(score: number): string {
  if (score >= 90) return tokens.accentSoft;
  if (score >= 70) return tokens.amberSoft;
  return tokens.redSoft;
}

function checkStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    passed: { bg: tokens.accentSoft, text: tokens.accentText, label: "Passed" },
    warned: { bg: tokens.amberSoft, text: "#92400e", label: "Warning" },
    failed: { bg: tokens.redSoft, text: "#991b1b", label: "Failed" },
    skipped: { bg: tokens.surfaceAlt, text: tokens.textMuted, label: "Skipped" },
  };
  const s = map[status] || map.skipped;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 6,
        background: s.bg,
        color: s.text,
      }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DataQualityPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [quarantined, setQuarantined] = useState<QuarantinedRecord[]>([]);
  const [unresolved, setUnresolved] = useState<UnresolvedMatch[]>([]);
  const [lineage, setLineage] = useState<LineageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQRow, setExpandedQRow] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [lineageSearch, setLineageSearch] = useState({ entity_type: "member", entity_id: "1" });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/data-quality/reports"),
      api.get("/api/data-quality/quarantine"),
      api.get("/api/data-quality/unresolved"),
      api.get("/api/data-quality/lineage?entity_type=member&entity_id=1"),
    ])
      .then(([rRes, qRes, uRes, lRes]) => {
        setReports(rRes.data || []);
        setQuarantined(qRes.data || []);
        setUnresolved(uRes.data || []);
        setLineage(lRes.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const latest = reports[0] || null;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "quarantine", label: "Quarantine", badge: quarantined.filter((r) => r.status === "pending").length },
    { key: "resolution", label: "Entity Resolution", badge: unresolved.length },
    { key: "lineage", label: "Lineage" },
  ];

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
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  // ---- OVERVIEW TAB ----
  function renderOverview() {
    if (!latest) {
      return <div style={{ color: tokens.textMuted, fontSize: 13 }}>No quality reports yet.</div>;
    }

    const passed = latest.checks.filter((c) => c.status === "passed").length;
    const warned = latest.checks.filter((c) => c.status === "warned").length;
    const failed = latest.checks.filter((c) => c.status === "failed").length;

    return (
      <div className="space-y-6">
        {/* Score hero */}
        <div className="flex items-start gap-6">
          <div
            className="rounded-2xl flex flex-col items-center justify-center"
            style={{
              width: 140,
              height: 140,
              background: scoreBg(latest.overall_score),
              border: `2px solid ${scoreColor(latest.overall_score)}`,
            }}
          >
            <div style={{ fontSize: 44, fontWeight: 700, fontFamily: fonts.code, color: scoreColor(latest.overall_score), lineHeight: 1 }}>
              {latest.overall_score}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: scoreColor(latest.overall_score), marginTop: 4 }}>
              Data Health
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Total Rows" value={latest.total_rows.toLocaleString()} />
              <MetricCard label="Valid" value={latest.valid_rows.toLocaleString()} trend={latest.total_rows > 0 ? `${((latest.valid_rows / latest.total_rows) * 100).toFixed(1)}%` : "0%"} trendDirection="up" />
              <MetricCard label="Quarantined" value={latest.quarantined_rows.toLocaleString()} trend={latest.total_rows > 0 ? `${((latest.quarantined_rows / latest.total_rows) * 100).toFixed(1)}%` : "0%"} trendDirection="down" />
              <MetricCard label="Warnings" value={latest.warning_rows.toLocaleString()} />
            </div>
          </div>
        </div>

        {/* Summary */}
        {latest.summary && (
          <div className="rounded-lg p-4" style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textMuted, marginBottom: 4 }}>AI Summary</div>
            <div style={{ fontSize: 13, color: tokens.text, lineHeight: 1.5 }}>{latest.summary}</div>
          </div>
        )}

        {/* Check counts */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
            <span style={{ fontSize: 13, color: tokens.text }}>{passed} Passed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: tokens.amber }} />
            <span style={{ fontSize: 13, color: tokens.text }}>{warned} Warnings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: tokens.red }} />
            <span style={{ fontSize: 13, color: tokens.text }}>{failed} Failed</span>
          </div>
        </div>

        {/* Checks detail */}
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${tokens.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: tokens.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Check</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: tokens.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: tokens.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: tokens.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {latest.checks.map((check, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${tokens.border}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500, color: tokens.text }}>{check.name}</td>
                  <td style={{ padding: "8px 12px" }}>{checkStatusBadge(check.status)}</td>
                  <td style={{ padding: "8px 12px", color: tokens.textSecondary }}>{check.details}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: check.severity === "high" ? tokens.red : check.severity === "medium" ? tokens.amber : tokens.textMuted,
                    }}>
                      {check.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent reports */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, marginBottom: 8 }}>Recent Reports</h3>
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-lg p-3"
                style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
              >
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    background: scoreBg(r.overall_score),
                    color: scoreColor(r.overall_score),
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: fonts.code,
                    flexShrink: 0,
                  }}
                >
                  {r.overall_score}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
                    Job #{r.upload_job_id} &mdash; {r.total_rows.toLocaleString()} rows
                  </div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.summary}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: tokens.textMuted, flexShrink: 0 }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- QUARANTINE TAB ----
  function renderQuarantine() {
    const filtered = sourceFilter === "all" ? quarantined : quarantined.filter((r) => r.source_type === sourceFilter);

    const handleDiscard = (id: number) => {
      setQuarantined((prev) => prev.map((r) => (r.id === id ? { ...r, status: "discarded" } : r)));
    };

    const handleFix = (id: number) => {
      setQuarantined((prev) => prev.map((r) => (r.id === id ? { ...r, status: "fixed" } : r)));
    };

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 500 }}>Source:</span>
          {["all", "claims", "roster", "pharmacy"].map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                fontWeight: sourceFilter === f ? 600 : 400,
                color: sourceFilter === f ? tokens.text : tokens.textMuted,
                background: sourceFilter === f ? tokens.surface : "transparent",
                border: sourceFilter === f ? `1px solid ${tokens.border}` : "1px solid transparent",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Records */}
        {filtered.length === 0 && (
          <div style={{ color: tokens.textMuted, fontSize: 13, padding: 16 }}>No quarantined records.</div>
        )}
        {filtered.map((record) => {
          const isExpanded = expandedQRow === record.id;
          const isPending = record.status === "pending";
          return (
            <div
              key={record.id}
              className="rounded-lg overflow-hidden"
              style={{ border: `1px solid ${tokens.border}`, background: tokens.surface }}
            >
              {/* Header row */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => setExpandedQRow(isExpanded ? null : record.id)}
                style={{ background: isExpanded ? tokens.surfaceAlt : "transparent" }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 6,
                    textTransform: "capitalize",
                    background: record.source_type === "claims" ? tokens.blueSoft : record.source_type === "roster" ? tokens.accentSoft : tokens.amberSoft,
                    color: record.source_type === "claims" ? "#1e40af" : record.source_type === "roster" ? tokens.accentText : "#92400e",
                  }}
                >
                  {record.source_type}
                </span>
                <span style={{ fontSize: 12, color: tokens.textMuted }}>Row {record.row_number}</span>
                <span style={{ fontSize: 12, color: tokens.textSecondary, flex: 1 }}>
                  {record.errors[0]}
                </span>
                {!isPending && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: record.status === "fixed" ? tokens.accentSoft : tokens.surfaceAlt,
                      color: record.status === "fixed" ? tokens.accentText : tokens.textMuted,
                      textTransform: "capitalize",
                    }}
                  >
                    {record.status}
                  </span>
                )}
                <span style={{ fontSize: 14, color: tokens.textMuted }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="p-4 space-y-3" style={{ borderTop: `1px solid ${tokens.border}` }}>
                  {/* Raw data */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raw Data</div>
                    <div className="rounded-md p-3" style={{ background: tokens.surfaceAlt, fontFamily: fonts.code, fontSize: 12, lineHeight: 1.6, color: tokens.text }}>
                      {Object.entries(record.raw_data).map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color: tokens.textMuted }}>{k}:</span> {String(v)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Errors */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: tokens.red, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Errors</div>
                    {record.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#991b1b", padding: "2px 0" }}>{e}</div>
                    ))}
                  </div>

                  {/* Warnings */}
                  {record.warnings && record.warnings.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: tokens.amber, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Warnings</div>
                      {record.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#92400e", padding: "2px 0" }}>{w}</div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {isPending && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleFix(record.id)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "6px 16px",
                          borderRadius: 8,
                          background: tokens.accent,
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Fix & Import
                      </button>
                      <button
                        onClick={() => handleDiscard(record.id)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "6px 16px",
                          borderRadius: 8,
                          background: tokens.surfaceAlt,
                          color: tokens.textSecondary,
                          border: `1px solid ${tokens.border}`,
                          cursor: "pointer",
                        }}
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---- ENTITY RESOLUTION TAB ----
  function renderResolution() {
    const handleConfirm = (matchId: number, _candidateId: number) => {
      setUnresolved((prev) => prev.filter((m) => m.id !== matchId));
    };

    const handleReject = (matchId: number) => {
      setUnresolved((prev) => prev.filter((m) => m.id !== matchId));
    };

    if (unresolved.length === 0) {
      return (
        <div className="rounded-lg p-8 text-center" style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: tokens.accentText, marginBottom: 4 }}>All Clear</div>
          <div style={{ fontSize: 13, color: tokens.textMuted }}>No unresolved entity matches require review.</div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 8 }}>
          {unresolved.length} ambiguous matches need human review
        </div>

        {unresolved.map((match) => (
          <div
            key={match.id}
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${tokens.border}`, background: tokens.surface }}
          >
            {/* Match header */}
            <div className="p-3 flex items-center gap-3" style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: match.confidence >= 80 ? tokens.accentSoft : match.confidence >= 60 ? tokens.amberSoft : tokens.redSoft,
                  color: match.confidence >= 80 ? tokens.accentText : match.confidence >= 60 ? "#92400e" : "#991b1b",
                }}
              >
                {match.confidence}% confidence
              </span>
              <span style={{ fontSize: 12, color: tokens.textMuted }}>Strategy: {match.match_type}</span>
            </div>

            {/* Side-by-side comparison */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Source record */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: tokens.amber, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Incoming Record
                  </div>
                  <div className="rounded-md p-3 space-y-1" style={{ background: tokens.amberSoft, fontSize: 12 }}>
                    {Object.entries(match.source_record).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: tokens.textMuted, fontWeight: 500 }}>{k}:</span>{" "}
                        <span style={{ color: tokens.text }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Best candidate */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: tokens.accentText, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {match.candidates.length > 1 ? `Best Match (of ${match.candidates.length})` : "Existing Record"}
                  </div>
                  {match.candidates.map((c, i) => (
                    <div key={c.id} className="rounded-md p-3 space-y-1" style={{ background: i === 0 ? tokens.accentSoft : tokens.surfaceAlt, fontSize: 12, marginBottom: i < match.candidates.length - 1 ? 8 : 0 }}>
                      <div>
                        <span style={{ color: tokens.textMuted, fontWeight: 500 }}>ID:</span>{" "}
                        <span style={{ color: tokens.text }}>{c.member_external_id}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: c.confidence >= 80 ? tokens.accentText : tokens.amber }}>
                          {c.confidence}%
                        </span>
                      </div>
                      <div><span style={{ color: tokens.textMuted, fontWeight: 500 }}>Name:</span> {c.first_name} {c.last_name}</div>
                      <div><span style={{ color: tokens.textMuted, fontWeight: 500 }}>DOB:</span> {c.date_of_birth}</div>
                      <div><span style={{ color: tokens.textMuted, fontWeight: 500 }}>Gender:</span> {c.gender}</div>
                      <div><span style={{ color: tokens.textMuted, fontWeight: 500 }}>Plan:</span> {c.health_plan}</div>
                      {c.zip_code && <div><span style={{ color: tokens.textMuted, fontWeight: 500 }}>ZIP:</span> {c.zip_code}</div>}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleConfirm(match.id, c.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 12px",
                            borderRadius: 6,
                            background: tokens.accent,
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Confirm Match
                        </button>
                        {i === match.candidates.length - 1 && (
                          <button
                            onClick={() => handleReject(match.id)}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 12px",
                              borderRadius: 6,
                              background: tokens.surfaceAlt,
                              color: tokens.textSecondary,
                              border: `1px solid ${tokens.border}`,
                              cursor: "pointer",
                            }}
                          >
                            Not a Match
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---- LINEAGE TAB ----
  function renderLineage() {
    return (
      <div className="space-y-4">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <select
            value={lineageSearch.entity_type}
            onChange={(e) => setLineageSearch((s) => ({ ...s, entity_type: e.target.value }))}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${tokens.border}`,
              background: tokens.surface,
              color: tokens.text,
              fontFamily: fonts.body,
            }}
          >
            <option value="member">Member</option>
            <option value="claim">Claim</option>
            <option value="provider">Provider</option>
          </select>
          <input
            type="text"
            placeholder="Entity ID"
            value={lineageSearch.entity_id}
            onChange={(e) => setLineageSearch((s) => ({ ...s, entity_id: e.target.value }))}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${tokens.border}`,
              background: tokens.surface,
              color: tokens.text,
              width: 100,
              fontFamily: fonts.code,
            }}
          />
          <button
            onClick={() => {
              api
                .get(`/api/data-quality/lineage?entity_type=${lineageSearch.entity_type}&entity_id=${lineageSearch.entity_id}`)
                .then((res) => setLineage(res.data || []))
                .catch(console.error);
            }}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: 8,
              background: tokens.accent,
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>

        {lineage.length === 0 ? (
          <div style={{ color: tokens.textMuted, fontSize: 13, padding: 16 }}>No lineage records found.</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 4 }}>
              Showing lineage for {lineageSearch.entity_type} #{lineageSearch.entity_id} &mdash; {lineage.length} events
            </div>

            {/* Timeline */}
            <div className="relative" style={{ paddingLeft: 24 }}>
              {/* Vertical line */}
              <div
                style={{
                  position: "absolute",
                  left: 7,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: tokens.border,
                }}
              />

              {lineage.map((entry) => (
                <div key={entry.id} className="relative mb-4" style={{ paddingLeft: 16 }}>
                  {/* Dot */}
                  <div
                    style={{
                      position: "absolute",
                      left: -20,
                      top: 6,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: entry.field_changes ? tokens.accent : tokens.blue,
                      border: `2px solid ${tokens.surface}`,
                    }}
                  />

                  <div className="rounded-lg p-3" style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: entry.source_system === "file_upload" ? tokens.blueSoft : entry.source_system === "hcc_engine" ? tokens.accentSoft : tokens.amberSoft,
                          color: entry.source_system === "file_upload" ? "#1e40af" : entry.source_system === "hcc_engine" ? tokens.accentText : "#92400e",
                        }}
                      >
                        {entry.source_system}
                      </span>
                      <span style={{ fontSize: 11, color: tokens.textMuted }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                      {entry.source_file && (
                        <span style={{ fontSize: 11, color: tokens.textMuted, fontFamily: fonts.code }}>
                          {entry.source_file}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 13, color: tokens.text, marginBottom: entry.field_changes ? 6 : 0 }}>
                      {entry.description || `${entry.source_system} event`}
                    </div>

                    {entry.field_changes && (
                      <div className="rounded-md p-2 mt-1" style={{ background: tokens.surfaceAlt, fontFamily: fonts.code, fontSize: 11, lineHeight: 1.6 }}>
                        {Object.entries(entry.field_changes).map(([field, change]) => {
                          const c = change as { old: number; new: number; reason: string };
                          return (
                            <div key={field}>
                              <span style={{ color: tokens.textMuted }}>{field}:</span>{" "}
                              <span style={{ color: tokens.red }}>{c.old}</span>{" "}
                              <span style={{ color: tokens.textMuted }}>-&gt;</span>{" "}
                              <span style={{ color: tokens.accentText }}>{c.new}</span>{" "}
                              <span style={{ color: tokens.textMuted }}>({c.reason})</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- RENDER ----
  if (loading) {
    return (
      <div style={{ padding: "28px 32px", color: tokens.textMuted, fontSize: 13 }}>
        Loading data quality information...
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            fontWeight: 700,
            color: tokens.text,
            marginBottom: 4,
          }}
        >
          Data Quality
        </h1>
        <p style={{ fontSize: 13, color: tokens.textSecondary }}>
          Monitor data health, review quarantined records, resolve entity matches, and trace data lineage.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 9999,
                  background: tokens.red,
                  color: "#fff",
                  lineHeight: 1,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-[10px] p-6" style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}>
        {tab === "overview" && renderOverview()}
        {tab === "quarantine" && renderQuarantine()}
        {tab === "resolution" && renderResolution()}
        {tab === "lineage" && renderLineage()}
      </div>
    </div>
  );
}
