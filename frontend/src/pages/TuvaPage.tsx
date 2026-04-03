import React, { useEffect, useState } from "react";
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
  aqsoft_confirmed_raf: number | null;
  aqsoft_projected_raf: number | null;
  capture_opportunity: number | null;
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

interface Comparison {
  member_id: string;
  name: string;
  tuva_confirmed_raf: number | null;
  aqsoft_confirmed_raf: number;
  aqsoft_projected_raf: number;
  capture_opportunity: number;
  engine_discrepancy: number | null;
  has_discrepancy: boolean;
}

interface ComparisonSummary {
  total_members: number;
  tuva_scored: number;
  total_capture_opportunity_raf: number;
  engine_discrepancies: number;
  avg_tuva_raf: number;
  avg_aqsoft_confirmed_raf: number;
  avg_aqsoft_projected_raf: number;
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

type Tab = "overview" | "comparison" | "raf" | "pmpm" | "pipeline";

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
  { member_id: "M001", payment_year: 2026, tuva_raf: 1.452, aqsoft_confirmed_raf: 1.398, aqsoft_projected_raf: 1.890, capture_opportunity: 0.492, has_discrepancy: true, raf_difference: 0.054, detail: "Tuva found HCC 85 (CHF) not in AQSoft confirmed", computed_at: "2026-04-02T10:30:00" },
  { member_id: "M002", payment_year: 2026, tuva_raf: 2.108, aqsoft_confirmed_raf: 2.108, aqsoft_projected_raf: 2.650, capture_opportunity: 0.542, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M003", payment_year: 2026, tuva_raf: 0.892, aqsoft_confirmed_raf: 0.892, aqsoft_projected_raf: 1.340, capture_opportunity: 0.448, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
  { member_id: "M004", payment_year: 2026, tuva_raf: 1.756, aqsoft_confirmed_raf: 1.682, aqsoft_projected_raf: 2.100, capture_opportunity: 0.418, has_discrepancy: true, raf_difference: 0.074, detail: "Tuva V28 interaction bonus differs", computed_at: "2026-04-02T10:30:00" },
  { member_id: "M005", payment_year: 2026, tuva_raf: 0.421, aqsoft_confirmed_raf: 0.421, aqsoft_projected_raf: 0.421, capture_opportunity: 0.0, has_discrepancy: false, raf_difference: 0.0, detail: null, computed_at: "2026-04-02T10:30:00" },
];

const DEMO_COMPARISONS: Comparison[] = [
  { member_id: "M001", name: "John Smith", tuva_confirmed_raf: 1.452, aqsoft_confirmed_raf: 1.398, aqsoft_projected_raf: 1.890, capture_opportunity: 0.492, engine_discrepancy: 0.054, has_discrepancy: true },
  { member_id: "M002", name: "Mary Johnson", tuva_confirmed_raf: 2.108, aqsoft_confirmed_raf: 2.108, aqsoft_projected_raf: 2.650, capture_opportunity: 0.542, engine_discrepancy: 0.0, has_discrepancy: false },
  { member_id: "M003", name: "Robert Williams", tuva_confirmed_raf: 0.892, aqsoft_confirmed_raf: 0.892, aqsoft_projected_raf: 1.340, capture_opportunity: 0.448, engine_discrepancy: 0.0, has_discrepancy: false },
  { member_id: "M004", name: "Patricia Brown", tuva_confirmed_raf: 1.756, aqsoft_confirmed_raf: 1.682, aqsoft_projected_raf: 2.100, capture_opportunity: 0.418, engine_discrepancy: 0.074, has_discrepancy: true },
  { member_id: "M005", name: "James Davis", tuva_confirmed_raf: 0.421, aqsoft_confirmed_raf: 0.421, aqsoft_projected_raf: 0.421, capture_opportunity: 0.0, engine_discrepancy: 0.0, has_discrepancy: false },
];

const DEMO_COMPARISON_SUMMARY: ComparisonSummary = {
  total_members: 5, tuva_scored: 5, total_capture_opportunity_raf: 1.900,
  engine_discrepancies: 2, avg_tuva_raf: 1.326, avg_aqsoft_confirmed_raf: 1.300, avg_aqsoft_projected_raf: 1.680,
};

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
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [compSummary, setCompSummary] = useState<ComparisonSummary | null>(null);
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [memberDetail, setMemberDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [showDiscrepanciesOnly]);

  async function loadData() {
    // Use raw fetch to bypass auth interceptor — Tuva endpoints don't require auth
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8090";
    try {
      const [summaryRes, rafRes, pmpmRes, compRes] = await Promise.all([
        fetch(`${baseUrl}/api/tuva/raf-baselines/summary`).then(r => r.json()),
        fetch(`${baseUrl}/api/tuva/raf-baselines?discrepancies_only=${showDiscrepanciesOnly}&limit=50`).then(r => r.json()),
        fetch(`${baseUrl}/api/tuva/pmpm-baselines?limit=50`).then(r => r.json()),
        fetch(`${baseUrl}/api/tuva/comparison`).then(r => r.json()),
      ]);
      setSummary(summaryRes);
      setRafBaselines(rafRes.items || []);
      setPmpmBaselines(pmpmRes.items || []);
      setComparisons(compRes.items || []);
      setCompSummary(compRes.summary || null);
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
      setComparisons(DEMO_COMPARISONS);
      setCompSummary(DEMO_COMPARISON_SUMMARY);
    }
  }

  async function openMemberDetail(memberId: string) {
    setSelectedMember(memberId);
    setDetailLoading(true);
    try {
      // Use raw fetch to bypass auth interceptor — Tuva endpoints don't require auth
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8090";
      const res = await fetch(`${baseUrl}/api/tuva/member/${memberId}`);
      if (res.ok) {
        setMemberDetail(await res.json());
      } else {
        setMemberDetail(null);
      }
    } catch {
      setMemberDetail(null);
    }
    setDetailLoading(false);
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
    { key: "comparison", label: "3-Tier Comparison" },
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
      {tab === "overview" && summary && <OverviewTab summary={summary} compSummary={compSummary} />}
      {tab === "comparison" && (
        <ComparisonTab comparisons={comparisons} summary={compSummary} onMemberClick={openMemberDetail} />
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          detail={memberDetail}
          loading={detailLoading}
          onClose={() => { setSelectedMember(null); setMemberDetail(null); }}
        />
      )}
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

function OverviewTab({ summary, compSummary }: { summary: RafSummary; compSummary: ComparisonSummary | null }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <MetricCard label="Members Scored" value={compSummary?.total_members.toLocaleString() ?? summary.total_baselines.toLocaleString()} />
        <MetricCard
          label="Tuva Avg RAF"
          value={compSummary?.avg_tuva_raf.toFixed(3) ?? "—"}
          trend="Claims-validated baseline"
        />
        <MetricCard
          label="AQSoft Confirmed Avg"
          value={compSummary?.avg_aqsoft_confirmed_raf.toFixed(3) ?? "—"}
          trend="Claims-based engine RAF"
        />
        <MetricCard
          label="AQSoft Projected Avg"
          value={compSummary?.avg_aqsoft_projected_raf.toFixed(3) ?? "—"}
          trend="With suspect HCCs"
          trendDirection="up"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <MetricCard
          label="Total Capture Opportunity"
          value={`+${compSummary?.total_capture_opportunity_raf.toFixed(3) ?? "0.000"} RAF`}
          trend="Projected - Confirmed across all members"
          trendDirection="up"
        />
        <MetricCard
          label="Engine Discrepancies"
          value={compSummary?.engine_discrepancies.toString() ?? summary.discrepancies.toString()}
          trend="Tuva vs AQSoft confirmed differ >0.05"
          trendDirection={(compSummary?.engine_discrepancies ?? 0) === 0 ? "up" : "down"}
        />
        <MetricCard
          label="Agreement Rate"
          value={`${summary.agreement_rate}%`}
          trend={summary.agreement_rate >= 95 ? "Excellent" : "Review needed"}
          trendDirection={summary.agreement_rate >= 95 ? "up" : "flat"}
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
// 3-Tier Comparison Tab
// ---------------------------------------------------------------------------

function ComparisonTab({
  comparisons,
  summary,
  onMemberClick,
}: {
  comparisons: Comparison[];
  summary: ComparisonSummary | null;
  onMemberClick: (memberId: string) => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, margin: "0 0 4px" }}>
          Tuva Confirmed vs AQSoft Confirmed vs AQSoft Projected
        </h3>
        <p style={{ fontSize: 12, color: tokens.textSecondary, margin: 0 }}>
          Sorted by capture opportunity (projected - confirmed). The gap is your revenue upside.
        </p>
      </div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <MetricCard label="Total Capture Opportunity" value={`+${summary.total_capture_opportunity_raf.toFixed(3)} RAF`} trendDirection="up" trend="Projected - Confirmed" />
          <MetricCard label="Avg Tuva Confirmed" value={summary.avg_tuva_raf.toFixed(3)} trend="Community-validated" />
          <MetricCard label="Avg AQSoft Confirmed" value={summary.avg_aqsoft_confirmed_raf.toFixed(3)} trend="Engine claims-based" />
          <MetricCard label="Avg AQSoft Projected" value={summary.avg_aqsoft_projected_raf.toFixed(3)} trend="With suspects" trendDirection="up" />
        </div>
      )}

      <div style={{ borderRadius: 10, border: `1px solid ${tokens.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              <Th>Member</Th>
              <Th>Name</Th>
              <Th align="right">Tuva Confirmed</Th>
              <Th align="right">AQSoft Confirmed</Th>
              <Th align="right">AQSoft Projected</Th>
              <Th align="right">Capture Opportunity</Th>
              <Th>Validation</Th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c, i) => (
              <tr
                key={`${c.member_id}-${i}`}
                style={{
                  borderTop: `1px solid ${tokens.borderSoft}`,
                  background: c.capture_opportunity > 0.1 ? tokens.accentSoft : "transparent",
                }}
              >
                <Td style={{ fontFamily: fonts.code, fontWeight: 600, fontSize: 11 }}>{c.member_id}</Td>
                <Td>
                  <button
                    onClick={() => onMemberClick(c.member_id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: tokens.blue,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 13,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {c.name}
                  </button>
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {c.tuva_confirmed_raf?.toFixed(3) ?? "—"}
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code }}>
                  {c.aqsoft_confirmed_raf.toFixed(3)}
                </Td>
                <Td align="right" style={{ fontFamily: fonts.code, fontWeight: 600 }}>
                  {c.aqsoft_projected_raf.toFixed(3)}
                </Td>
                <Td
                  align="right"
                  style={{
                    fontFamily: fonts.code,
                    fontWeight: 700,
                    color: c.capture_opportunity > 0 ? tokens.accentText : tokens.textMuted,
                  }}
                >
                  {c.capture_opportunity > 0 ? `+${c.capture_opportunity.toFixed(3)}` : "—"}
                </Td>
                <Td>
                  {c.has_discrepancy ? (
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: tokens.amberSoft, color: tokens.amber }}>
                      Engines differ
                    </span>
                  ) : (
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: tokens.accentSoft, color: tokens.accentText }}>
                      Validated
                    </span>
                  )}
                </Td>
              </tr>
            ))}
            {comparisons.length === 0 && (
              <tr>
                <Td colSpan={7} style={{ textAlign: "center", color: tokens.textMuted, padding: 32 }}>
                  Run the Tuva pipeline to see the 3-tier comparison
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
// Member Detail Modal
// ---------------------------------------------------------------------------

function MemberDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: any;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.surface,
          borderRadius: 12,
          width: "90%",
          maxWidth: 900,
          maxHeight: "85vh",
          overflow: "auto",
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {loading && <p style={{ color: tokens.textMuted }}>Loading member detail...</p>}
        {!loading && !detail && <p style={{ color: tokens.red }}>Could not load member detail.</p>}
        {!loading && detail && (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: 0 }}>
                  {detail.name}
                </h2>
                <p style={{ fontSize: 12, color: tokens.textSecondary, margin: "4px 0 0" }}>
                  {detail.member_id} | {detail.gender === "M" ? "Male" : "Female"} | DOB: {detail.date_of_birth}
                </p>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: tokens.textMuted }}>&times;</button>
            </div>

            {/* Score cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <MetricCard label="Tuva Confirmed" value={detail.scores.tuva_v28?.toFixed(3) ?? "N/A"} trend="Community-validated" />
              <MetricCard label="AQSoft Confirmed" value={detail.scores.aqsoft_confirmed.toFixed(3)} trend="Claims-based" />
              <MetricCard label="AQSoft Projected" value={detail.scores.aqsoft_projected.toFixed(3)} trend="With suspects" trendDirection="up" />
              <MetricCard
                label="Capture Opportunity"
                value={`+${detail.opportunity_raf} RAF`}
                trend={`${detail.opportunity_count} open suspects`}
                trendDirection={detail.opportunity_count > 0 ? "up" : "flat"}
              />
            </div>

            {/* Two columns: Tuva HCCs vs AQSoft HCCs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {/* Tuva HCCs */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.text, margin: "0 0 8px" }}>
                  Tuva Confirmed HCCs
                  <span style={{ fontWeight: 400, color: tokens.textMuted, marginLeft: 6 }}>
                    ({detail.tuva_hccs.length})
                  </span>
                </h3>
                {detail.tuva_hccs.length === 0 ? (
                  <p style={{ fontSize: 12, color: tokens.textMuted }}>No HCCs found by Tuva</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {detail.tuva_hccs.map((h: any, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: tokens.surfaceAlt, border: `1px solid ${tokens.borderSoft}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.text }}>{h.description}</div>
                        <div style={{ fontSize: 11, color: tokens.textSecondary, fontFamily: fonts.code }}>
                          {h.model} | coeff: {h.coefficient}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AQSoft Confirmed HCCs */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.text, margin: "0 0 8px" }}>
                  AQSoft Confirmed HCCs
                  <span style={{ fontWeight: 400, color: tokens.textMuted, marginLeft: 6 }}>
                    ({detail.aqsoft_confirmed_hccs.length})
                  </span>
                </h3>
                {detail.aqsoft_confirmed_hccs.length === 0 ? (
                  <p style={{ fontSize: 12, color: tokens.textMuted }}>No HCCs found by AQSoft</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {detail.aqsoft_confirmed_hccs.map((h: any, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: tokens.surfaceAlt, border: `1px solid ${tokens.borderSoft}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.text }}>HCC {h.hcc_code}: {h.description}</div>
                        <div style={{ fontSize: 11, color: tokens.textSecondary, fontFamily: fonts.code }}>
                          {h.icd10_code} | RAF: {h.raf_weight} | {h.found_in_claims} claim{h.found_in_claims !== 1 ? "s" : ""}
                        </div>
                        {h.latest_claim && (
                          <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 2 }}>
                            Source: {h.latest_claim.claim_type} claim {h.latest_claim.claim_id || ""} on {h.latest_claim.service_date}
                            {h.latest_claim.facility ? ` at ${h.latest_claim.facility}` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Opportunities / Suspects */}
            {detail.opportunities.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.accentText, margin: "0 0 8px" }}>
                  Capture Opportunities ({detail.opportunities.length}) — +{detail.opportunity_raf} RAF potential
                </h3>
                <p style={{ fontSize: 11, color: tokens.textSecondary, margin: "0 0 8px" }}>
                  These HCCs are suspected but not yet confirmed in claims. Capture them at the next encounter.
                </p>
                <div style={{ borderRadius: 8, border: `1px solid ${tokens.border}`, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: tokens.accentSoft }}>
                        <Th>HCC</Th>
                        <Th>Type</Th>
                        <Th>ICD-10</Th>
                        <Th align="right">RAF Value</Th>
                        <Th align="right">Confidence</Th>
                        <Th>Evidence</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.opportunities.map((s: any, i: number) => (
                        <React.Fragment key={i}>
                          <tr style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
                            <Td style={{ fontWeight: 600 }}>HCC {s.hcc_code}: {s.hcc_label}</Td>
                            <Td>
                              <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: tokens.blueSoft, color: tokens.blue }}>
                                {s.suspect_type}
                              </span>
                            </Td>
                            <Td style={{ fontFamily: fonts.code }}>{s.icd10_code || "—"}</Td>
                            <Td align="right" style={{ fontFamily: fonts.code, fontWeight: 600, color: tokens.accentText }}>+{s.raf_value.toFixed(3)}</Td>
                            <Td align="right">{s.confidence}%</Td>
                            <Td style={{ fontSize: 11, color: tokens.textSecondary, maxWidth: 200 }}>{s.evidence || "—"}</Td>
                          </tr>
                          {/* Code Ladder — suggested codes for this opportunity */}
                          {s.code_ladder && s.code_ladder.length > 0 && (
                            <tr>
                              <Td colSpan={6} style={{ padding: "4px 12px 12px" }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: tokens.textSecondary, marginBottom: 4 }}>
                                  Coding Options (select the most specific code the evidence supports):
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {s.code_ladder.map((c: any) => (
                                    <div
                                      key={c.icd10_code}
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontFamily: fonts.code,
                                        border: `1px solid ${c.is_current ? tokens.accent : c.hcc_code ? tokens.border : tokens.redSoft}`,
                                        background: c.is_current ? tokens.accentSoft : c.hcc_code ? tokens.surface : tokens.redSoft,
                                      }}
                                    >
                                      <span style={{ fontWeight: 600 }}>{c.icd10_code}</span>
                                      {c.hcc_code ? (
                                        <span style={{ color: tokens.accentText }}> HCC {c.hcc_code} RAF {c.raf_weight.toFixed(3)}</span>
                                      ) : (
                                        <span style={{ color: tokens.red }}> no HCC</span>
                                      )}
                                      <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 1 }}>{c.description}</div>
                                    </div>
                                  ))}
                                </div>
                              </Td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Watch Items — no evidence, monitor only */}
            {detail.watch_items && detail.watch_items.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.amber, margin: "0 0 4px" }}>
                  Watch Items ({detail.watch_items.length}) — No Evidence Yet
                </h3>
                <p style={{ fontSize: 11, color: tokens.textSecondary, margin: "0 0 8px" }}>
                  These interaction bonuses would apply IF the condition is eventually diagnosed.
                  No supporting evidence in current claims or medications. Monitor for future data.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detail.watch_items.map((w: any, i: number) => (
                    <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: tokens.amberSoft, border: `1px solid ${tokens.border}` }}>
                      <div style={{ fontSize: 12, color: tokens.text }}>
                        <span style={{ fontWeight: 600 }}>HCC {w.hcc_code}</span>: {w.hcc_label}
                        <span style={{ marginLeft: 8, fontFamily: fonts.code, fontSize: 11, color: tokens.amber }}>
                          potential +{w.raf_value.toFixed(3)} RAF
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 2 }}>{w.evidence}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All diagnosis codes */}
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.text, margin: "0 0 8px" }}>
                All Diagnosis Codes ({detail.diagnosis_codes.length})
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {detail.diagnosis_codes.map((code: string) => (
                  <span
                    key={code}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: fonts.code,
                      background: tokens.surfaceAlt,
                      border: `1px solid ${tokens.borderSoft}`,
                      color: tokens.text,
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
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
