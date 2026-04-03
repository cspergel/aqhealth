import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RafBaseline {
  member_id: string;
  payment_year: number;
  tuva_raf: number | null;
  aqsoft_raf: number | null;
  has_discrepancy: boolean;
  raf_difference: number | null;
  detail: string | null;
  computed_at: string | null;
}

interface RafSummary {
  total_baselines: number;
  discrepancies: number;
  agreement_rate: number;
  avg_discrepancy_raf: number;
}

interface PmpmBaseline {
  period: string;
  service_category: string | null;
  tuva_pmpm: number | null;
  aqsoft_pmpm: number | null;
  has_discrepancy: boolean;
  member_months: number | null;
  computed_at: string | null;
}

interface PipelineStatus {
  status: string;
  message: string;
}

type Tab = "overview" | "raf" | "pmpm" | "pipeline";

// ---------------------------------------------------------------------------
// Synthetic demo data — used when no backend is running
// ---------------------------------------------------------------------------

const DEMO_SUMMARY: RafSummary = {
  total_baselines: 247,
  discrepancies: 12,
  agreement_rate: 95.1,
  avg_discrepancy_raf: 0.089,
};

const DEMO_RAF_BASELINES: RafBaseline[] = [
  { member_id: "M001", payment_year: 2026, tuva_raf: 1.452, aqsoft_raf: 1.398, has_discrepancy: true, raf_difference: 0.054, detail: "Tuva found HCC 85 (Congestive Heart Failure) not in AQSoft", computed_at: "2026-04-02T10:30:00" },
  { member_id: "M002", payment_year: 2026, tuva_raf: 2.108, aqsoft_raf: 2.108, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M003", payment_year: 2026, tuva_raf: 0.892, aqsoft_raf: 0.892, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M004", payment_year: 2026, tuva_raf: 1.756, aqsoft_raf: 1.682, has_discrepancy: true, raf_difference: 0.074, detail: "Tuva V28 interaction bonus (CHF+COPD) differs", computed_at: "2026-04-02T10:30:00" },
  { member_id: "M005", payment_year: 2026, tuva_raf: 0.421, aqsoft_raf: 0.421, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M006", payment_year: 2026, tuva_raf: 3.214, aqsoft_raf: 3.214, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M007", payment_year: 2026, tuva_raf: 1.105, aqsoft_raf: 1.032, has_discrepancy: true, raf_difference: 0.073, detail: "AQSoft missing CKD stage mapping", computed_at: "2026-04-02T10:30:00" },
  { member_id: "M008", payment_year: 2026, tuva_raf: 0.562, aqsoft_raf: 0.562, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M009", payment_year: 2026, tuva_raf: 1.890, aqsoft_raf: 1.890, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M010", payment_year: 2026, tuva_raf: 2.445, aqsoft_raf: 2.445, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
];

const DEMO_PMPM_BASELINES: PmpmBaseline[] = [
  { period: "2026-01", service_category: "inpatient", tuva_pmpm: 482.30, aqsoft_pmpm: 478.15, has_discrepancy: false, member_months: 1247, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-01", service_category: "professional", tuva_pmpm: 215.60, aqsoft_pmpm: 218.40, has_discrepancy: false, member_months: 1247, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-01", service_category: "pharmacy", tuva_pmpm: 342.10, aqsoft_pmpm: 339.85, has_discrepancy: false, member_months: 1247, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-01", service_category: "ed_observation", tuva_pmpm: 67.45, aqsoft_pmpm: 71.20, has_discrepancy: false, member_months: 1247, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-01", service_category: "snf_postacute", tuva_pmpm: 128.90, aqsoft_pmpm: 125.60, has_discrepancy: false, member_months: 1247, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-02", service_category: "inpatient", tuva_pmpm: 495.10, aqsoft_pmpm: 490.30, has_discrepancy: false, member_months: 1252, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-02", service_category: "professional", tuva_pmpm: 220.15, aqsoft_pmpm: 222.80, has_discrepancy: false, member_months: 1252, computed_at: "2026-04-02T10:30:00" },
  { period: "2026-02", service_category: "pharmacy", tuva_pmpm: 348.60, aqsoft_pmpm: 345.90, has_discrepancy: false, member_months: 1252, computed_at: "2026-04-02T10:30:00" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TuvaPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<RafSummary | null>(null);
  const [rafBaselines, setRafBaselines] = useState<RafBaseline[]>([]);
  const [pmpmBaselines, setPmpmBaselines] = useState<PmpmBaseline[]>([]);
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  useEffect(() => {
    loadData();
  }, [showDiscrepanciesOnly]);

  async function loadData() {
    try {
      const [summaryRes, rafRes, pmpmRes] = await Promise.all([
        api.get("/api/tuva/raf-baselines/summary"),
        api.get("/api/tuva/raf-baselines", {
          params: { discrepancies_only: showDiscrepanciesOnly, limit: 50 },
        }),
        api.get("/api/tuva/pmpm-baselines", { params: { limit: 50 } }),
      ]);
      setSummary(summaryRes.data);
      setRafBaselines(rafRes.data.items);
      setPmpmBaselines(pmpmRes.data.items);
      setUseDemo(false);
    } catch {
      // Backend not running — use demo data
      setUseDemo(true);
      setSummary(DEMO_SUMMARY);
      setRafBaselines(
        showDiscrepanciesOnly
          ? DEMO_RAF_BASELINES.filter((b) => b.has_discrepancy)
          : DEMO_RAF_BASELINES
      );
      setPmpmBaselines(DEMO_PMPM_BASELINES);
    }
  }

  async function triggerPipeline() {
    setPipelineRunning(true);
    setPipelineResult(null);
    try {
      const res = await api.post<PipelineStatus>("/api/tuva/run");
      setPipelineResult(res.data.message);
    } catch {
      setPipelineResult("Pipeline trigger failed — is the backend running?");
    }
    setPipelineRunning(false);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "raf", label: "RAF Baselines" },
    { key: "pmpm", label: "PMPM Baselines" },
    { key: "pipeline", label: "Pipeline" },
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
          Tuva Health Integration
        </h1>
        <p
          style={{
            fontSize: 13,
            color: tokens.textSecondary,
            marginTop: 4,
          }}
        >
          Community-validated analytics baseline — compare Tuva's calculations
          against AQSoft's engines
          {useDemo && (
            <span
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                borderRadius: 4,
                background: tokens.blueSoft,
                color: tokens.blue,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              DEMO DATA
            </span>
          )}
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
              color: tab === t.key ? tokens.accent : tokens.textSecondary,
              background: "transparent",
              border: "none",
              borderBottom:
                tab === t.key ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && summary && <OverviewTab summary={summary} />}
      {tab === "raf" && (
        <RafTab
          baselines={rafBaselines}
          showDiscrepanciesOnly={showDiscrepanciesOnly}
          onToggleFilter={() => setShowDiscrepanciesOnly((v) => !v)}
        />
      )}
      {tab === "pmpm" && <PmpmTab baselines={pmpmBaselines} />}
      {tab === "pipeline" && (
        <PipelineTab
          running={pipelineRunning}
          result={pipelineResult}
          onTrigger={triggerPipeline}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ summary }: { summary: RafSummary }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <MetricCard label="Total Baselines" value={summary.total_baselines.toLocaleString()} />
        <MetricCard
          label="Agreement Rate"
          value={`${summary.agreement_rate}%`}
          trend={summary.agreement_rate >= 95 ? "Excellent" : summary.agreement_rate >= 90 ? "Good" : "Review needed"}
          trendDirection={summary.agreement_rate >= 95 ? "up" : summary.agreement_rate >= 90 ? "flat" : "down"}
        />
        <MetricCard
          label="Discrepancies"
          value={summary.discrepancies.toString()}
          trend={summary.discrepancies === 0 ? "None found" : `${summary.discrepancies} members differ`}
          trendDirection={summary.discrepancies === 0 ? "up" : "down"}
        />
        <MetricCard
          label="Avg RAF Difference"
          value={summary.avg_discrepancy_raf.toFixed(3)}
          trend="Among discrepant members"
        />
      </div>

      {/* Explanation */}
      <div
        style={{
          padding: 20,
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          background: tokens.surface,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 8px" }}>
          How This Works
        </h3>
        <p style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.6, margin: 0 }}>
          Tuva Health is an open-source, community-validated healthcare analytics framework
          (Apache 2.0). It runs CMS-HCC V28 risk adjustment, HEDIS quality measures, PMPM
          financial analytics, and more using dbt on DuckDB.
        </p>
        <p style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.6, margin: "8px 0 0" }}>
          <strong>Tuva is the calculator, AQSoft is the brain.</strong> Tuva produces trusted
          baseline numbers. AQSoft's engines produce the same calculations independently. When
          they agree, you have high confidence. When they disagree, discrepancies are flagged
          for review — both values are preserved, nothing is silently overwritten.
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <StatusItem label="dbt + DuckDB" status="installed" />
          <StatusItem label="Tuva Package" status="v0.17.2" />
          <StatusItem label="CMS-HCC Model" status="V28 (2026)" />
          <StatusItem label="Pipeline" status="Ready" />
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tokens.accent,
        }}
      />
      <span style={{ fontSize: 12, color: tokens.textSecondary }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: tokens.text, fontFamily: fonts.code }}>
        {status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RAF Baselines Tab
// ---------------------------------------------------------------------------

function RafTab({
  baselines,
  showDiscrepanciesOnly,
  onToggleFilter,
}: {
  baselines: RafBaseline[];
  showDiscrepanciesOnly: boolean;
  onToggleFilter: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: 0 }}>
          RAF Score Comparison — Tuva vs AQSoft
        </h3>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: tokens.textSecondary,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showDiscrepanciesOnly}
            onChange={onToggleFilter}
            style={{ accentColor: tokens.accent }}
          />
          Discrepancies only
        </label>
      </div>

      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              <Th>Member</Th>
              <Th align="right">Tuva RAF</Th>
              <Th align="right">AQSoft RAF</Th>
              <Th align="right">Difference</Th>
              <Th>Status</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {baselines.map((b, i) => (
              <tr
                key={`${b.member_id}-${i}`}
                style={{
                  borderTop: `1px solid ${tokens.borderSoft}`,
                  background: b.has_discrepancy ? tokens.amberSoft : "transparent",
                }}
              >
                <Td style={{ fontFamily: fonts.code, fontWeight: 600 }}>{b.member_id}</Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {b.tuva_raf?.toFixed(3) ?? "—"}
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {b.aqsoft_raf?.toFixed(3) ?? "—"}
                </Td>
                <Td
                  align="right"
                  style={{
                    fontFamily: fonts.code,
                    color: b.has_discrepancy ? tokens.amber : tokens.textMuted,
                    fontWeight: b.has_discrepancy ? 600 : 400,
                  }}
                >
                  {b.raf_difference != null ? (b.raf_difference === 0 ? "—" : `+${b.raf_difference.toFixed(3)}`) : "—"}
                </Td>
                <Td>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: b.has_discrepancy ? tokens.amberSoft : tokens.accentSoft,
                      color: b.has_discrepancy ? tokens.amber : tokens.accentText,
                    }}
                  >
                    {b.has_discrepancy ? "Discrepancy" : "Match"}
                  </span>
                </Td>
                <Td style={{ fontSize: 11, color: tokens.textSecondary, maxWidth: 280 }}>
                  {b.detail || "—"}
                </Td>
              </tr>
            ))}
            {baselines.length === 0 && (
              <tr>
                <Td colSpan={6} style={{ textAlign: "center", color: tokens.textMuted, padding: 32 }}>
                  No baselines yet — run the Tuva pipeline to generate comparisons
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PMPM Baselines Tab
// ---------------------------------------------------------------------------

function PmpmTab({ baselines }: { baselines: PmpmBaseline[] }) {
  const CATEGORY_LABELS: Record<string, string> = {
    inpatient: "Inpatient",
    professional: "Professional",
    pharmacy: "Pharmacy",
    ed_observation: "ED / Observation",
    snf_postacute: "SNF / Post-Acute",
    home_health: "Home Health",
    dme: "DME",
    other: "Other",
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 16px" }}>
        PMPM Comparison — Tuva vs AQSoft
      </h3>

      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              <Th>Period</Th>
              <Th>Category</Th>
              <Th align="right">Tuva PMPM</Th>
              <Th align="right">AQSoft PMPM</Th>
              <Th align="right">Member Months</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {baselines.map((b, i) => (
              <tr key={`${b.period}-${b.service_category}-${i}`} style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
                <Td style={{ fontFamily: fonts.code }}>{b.period}</Td>
                <Td>{CATEGORY_LABELS[b.service_category ?? ""] || b.service_category || "—"}</Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {b.tuva_pmpm != null ? `$${b.tuva_pmpm.toFixed(2)}` : "—"}
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {b.aqsoft_pmpm != null ? `$${b.aqsoft_pmpm.toFixed(2)}` : "—"}
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {b.member_months?.toLocaleString() ?? "—"}
                </Td>
                <Td>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: b.has_discrepancy ? tokens.amberSoft : tokens.accentSoft,
                      color: b.has_discrepancy ? tokens.amber : tokens.accentText,
                    }}
                  >
                    {b.has_discrepancy ? "Discrepancy" : "Match"}
                  </span>
                </Td>
              </tr>
            ))}
            {baselines.length === 0 && (
              <tr>
                <Td colSpan={6} style={{ textAlign: "center", color: tokens.textMuted, padding: 32 }}>
                  No PMPM baselines yet — run the Tuva pipeline to generate comparisons
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Tab
// ---------------------------------------------------------------------------

function PipelineTab({
  running,
  result,
  onTrigger,
}: {
  running: boolean;
  result: string | null;
  onTrigger: () => void;
}) {
  const steps = [
    { label: "Export", desc: "PostgreSQL → DuckDB (claims, members)" },
    { label: "Seed", desc: "Load Tuva terminology tables (ICD-10, HCC, SNOMED)" },
    { label: "Transform", desc: "Run Tuva dbt models (CMS-HCC, PMPM, Quality Measures)" },
    { label: "Sync", desc: "Compare Tuva outputs against AQSoft, flag discrepancies" },
  ];

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 8px" }}>
        Tuva Pipeline
      </h3>
      <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "0 0 24px" }}>
        Run the full Tuva analytics pipeline. This exports your data to DuckDB, runs Tuva's
        dbt transformations, and syncs results back for comparison.
      </p>

      {/* Pipeline steps */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {steps.map((s, i) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              padding: 16,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              background: tokens.surface,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: tokens.accentSoft,
                  color: tokens.accentText,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 12, color: tokens.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {s.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={onTrigger}
        disabled={running}
        style={{
          padding: "10px 24px",
          fontSize: 13,
          fontWeight: 600,
          color: "#fff",
          background: running ? tokens.textMuted : tokens.accent,
          border: "none",
          borderRadius: 8,
          cursor: running ? "not-allowed" : "pointer",
          transition: "background 150ms",
        }}
      >
        {running ? "Running..." : "Run Tuva Pipeline"}
      </button>

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: tokens.surfaceAlt,
            border: `1px solid ${tokens.border}`,
            fontSize: 13,
            color: tokens.textSecondary,
            fontFamily: fonts.code,
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
        color: tokens.textMuted,
        textAlign: align,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
  style = {},
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "10px 12px",
        textAlign: align,
        color: tokens.text,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
