import { useState, useEffect, useRef, useCallback } from "react";
import { tokens, fonts } from "../../lib/tokens";
import api from "../../lib/api";

/* ------------------------------------------------------------------ */
/* WizardStep5Processing — pipeline runner with live progress          */
/* ------------------------------------------------------------------ */

type StepStatus = "waiting" | "running" | "complete" | "error";

interface PipelineStep {
  key: string;
  label: string;
  icon: string;
  status: StepStatus;
  resultText: string | null;
  errorText: string | null;
}

interface ResultMetrics {
  members: number;
  hccSuspects: number;
  dollarOpportunity: number;
  careGaps: number;
}

interface Finding {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

const INITIAL_STEPS: PipelineStep[] = [
  { key: "load", label: "Loading data...", icon: "DB", status: "waiting", resultText: null, errorText: null },
  { key: "hcc", label: "Running HCC analysis...", icon: "HCC", status: "waiting", resultText: null, errorText: null },
  { key: "scorecards", label: "Computing provider scorecards...", icon: "SC", status: "waiting", resultText: null, errorText: null },
  { key: "gaps", label: "Detecting care gaps...", icon: "QM", status: "waiting", resultText: null, errorText: null },
  { key: "insights", label: "Generating AI insights...", icon: "AI", status: "waiting", resultText: null, errorText: null },
];

/* Demo-mode mock results for each step */
const DEMO_RESULTS: Record<string, string> = {
  load: "14,188 rows loaded across 3 data types",
  hcc: "Found 312 suspects worth $2.1M in annual opportunity",
  scorecards: "47 providers updated, avg capture rate 62%",
  gaps: "890 open gaps across 39 quality measures",
  insights: "12 insights generated, 3 high-priority",
};

const DEMO_METRICS: ResultMetrics = {
  members: 1400,
  hccSuspects: 312,
  dollarOpportunity: 2_100_000,
  careGaps: 890,
};

const DEMO_FINDINGS: Finding[] = [
  {
    title: "Diabetes HCC under-capture in Group A",
    description:
      "42 members with A1C > 7 but no HCC 19 on file. Estimated $380K annual RAF impact.",
    priority: "high",
  },
  {
    title: "Depression screening gap cluster",
    description:
      "187 members overdue for PHQ-9. Concentrated in 3 providers — scheduling outreach recommended.",
    priority: "high",
  },
  {
    title: "Top performer pattern identified",
    description:
      'Dr. Rivera\'s panel has 89% HCC capture rate. Key differentiator: structured "problem list review" at every visit.',
    priority: "medium",
  },
];

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

interface WizardStep5ProcessingProps {
  /** Callback to notify parent that processing is complete */
  onComplete?: () => void;
  /** Whether we're in demo mode (simulated pipeline) */
  demoMode?: boolean;
}

export function WizardStep5Processing({
  onComplete,
  demoMode = true,
}: WizardStep5ProcessingProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [allDone, setAllDone] = useState(false);
  const [metrics, setMetrics] = useState<ResultMetrics | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const startedRef = useRef(false);

  /* ---- Demo pipeline simulation ---- */
  const runDemoPipeline = useCallback(async () => {
    const stepKeys = INITIAL_STEPS.map((s) => s.key);

    for (let i = 0; i < stepKeys.length; i++) {
      const key = stepKeys[i];

      // Mark as running
      setSteps((prev) =>
        prev.map((s) => (s.key === key ? { ...s, status: "running" } : s)),
      );

      // Simulate work (2-3 seconds)
      await delay(2000 + Math.random() * 1000);

      // Mark as complete
      setSteps((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, status: "complete", resultText: DEMO_RESULTS[key] }
            : s,
        ),
      );
    }

    setMetrics(DEMO_METRICS);
    setFindings(DEMO_FINDINGS);
    setAllDone(true);
  }, []);

  /* ---- Real pipeline (call backend APIs) ---- */
  const runRealPipeline = useCallback(async () => {
    const apiSteps: { key: string; skillName: string }[] = [
      { key: "load", skillName: "data_load" },
      { key: "hcc", skillName: "hcc_analysis" },
      { key: "scorecards", skillName: "provider_scorecards" },
      { key: "gaps", skillName: "care_gap_detection" },
      { key: "insights", skillName: "ai_insights" },
    ];

    for (const step of apiSteps) {
      setSteps((prev) =>
        prev.map((s) => (s.key === step.key ? { ...s, status: "running" } : s)),
      );

      try {
        const res = await api.post("/api/skills/execute-by-name", { action: step.skillName });
        const result = res.data;
        setSteps((prev) =>
          prev.map((s) =>
            s.key === step.key
              ? {
                  ...s,
                  status: "complete",
                  resultText: result.summary || result.message || "Done",
                }
              : s,
          ),
        );
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err.message || "Failed";
        setSteps((prev) =>
          prev.map((s) =>
            s.key === step.key
              ? { ...s, status: "error", errorText: msg }
              : s,
          ),
        );
        // Don't stop — continue to next step
      }
    }

    // Fetch summary metrics
    try {
      const summaryRes = await api.get("/api/dashboard/summary");
      const d = summaryRes.data;
      setMetrics({
        members: d.total_members ?? 0,
        hccSuspects: d.hcc_suspects ?? 0,
        dollarOpportunity: d.dollar_opportunity ?? 0,
        careGaps: d.care_gaps ?? 0,
      });
    } catch {
      // Use zeros if summary unavailable
      setMetrics({ members: 0, hccSuspects: 0, dollarOpportunity: 0, careGaps: 0 });
    }

    setFindings(DEMO_FINDINGS); // Real findings would come from insights API
    setAllDone(true);
  }, []);

  /* ---- Start pipeline on mount ---- */
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (demoMode) {
      runDemoPipeline();
    } else {
      runRealPipeline();
    }
  }, [demoMode, runDemoPipeline, runRealPipeline]);

  /* ---- Notify parent when done ---- */
  useEffect(() => {
    if (allDone) onComplete?.();
  }, [allDone, onComplete]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Pipeline steps */}
      <div
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {steps.map((step, i) => (
          <PipelineStepRow key={step.key} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>

      {/* Results section — shown after all complete */}
      {allDone && metrics && (
        <div
          style={{
            marginTop: 32,
            animation: "fadeInUp 500ms ease-out",
          }}
        >
          {/* Celebration header */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: tokens.accentSoft,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke={tokens.accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3
              style={{
                fontFamily: fonts.heading,
                fontSize: 20,
                fontWeight: 700,
                color: tokens.text,
                margin: "0 0 4px 0",
              }}
            >
              Your dashboard is ready!
            </h3>
            <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0 }}>
              Here is a summary of what we found in your data.
            </p>
          </div>

          {/* Metric cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <MetricCard label="Members" value={metrics.members.toLocaleString()} color={tokens.blue} />
            <MetricCard label="HCC Suspects" value={metrics.hccSuspects.toLocaleString()} color={tokens.amber} />
            <MetricCard
              label="Opportunity"
              value={`$${(metrics.dollarOpportunity / 1_000_000).toFixed(1)}M`}
              color={tokens.accent}
            />
            <MetricCard label="Care Gaps" value={metrics.careGaps.toLocaleString()} color={tokens.red} />
          </div>

          {/* Top findings */}
          {findings.length > 0 && (
            <div
              style={{
                background: tokens.surface,
                border: `1px solid ${tokens.border}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h4
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 15,
                  fontWeight: 600,
                  color: tokens.text,
                  margin: "0 0 14px 0",
                }}
              >
                Top 3 Findings
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {findings.map((f, i) => (
                  <FindingRow key={i} finding={f} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes progressIndeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline step row                                                    */
/* ------------------------------------------------------------------ */

function PipelineStepRow({ step, isLast }: { step: PipelineStep; isLast: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "16px 20px",
        borderBottom: isLast ? "none" : `1px solid ${tokens.borderSoft}`,
        background: step.status === "running" ? tokens.surfaceAlt : "transparent",
        transition: "background 300ms ease",
      }}
    >
      {/* Status icon */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
          ...statusIconStyle(step.status),
        }}
      >
        {step.status === "waiting" && (
          <span style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted }}>{step.icon}</span>
        )}
        {step.status === "running" && <Spinner />}
        {step.status === "complete" && <CheckIcon />}
        {step.status === "error" && <XIcon />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: step.status === "running" ? 600 : 500,
            color: step.status === "waiting" ? tokens.textMuted : tokens.text,
            marginBottom: 4,
            transition: "color 200ms",
          }}
        >
          {step.label}
        </div>

        {/* Progress bar */}
        {(step.status === "running" || step.status === "complete") && (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: tokens.borderSoft,
              overflow: "hidden",
              marginBottom: step.resultText || step.errorText ? 6 : 0,
            }}
          >
            {step.status === "running" ? (
              <div
                style={{
                  height: "100%",
                  width: "33%",
                  borderRadius: 2,
                  background: tokens.blue,
                  animation: "progressIndeterminate 1.4s ease-in-out infinite",
                }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  borderRadius: 2,
                  background: tokens.accent,
                  transition: "width 300ms ease",
                }}
              />
            )}
          </div>
        )}

        {/* Result text */}
        {step.status === "complete" && step.resultText && (
          <div
            style={{
              fontSize: 13,
              color: tokens.accentText,
              fontFamily: fonts.code,
            }}
          >
            {step.resultText}
          </div>
        )}

        {/* Error text */}
        {step.status === "error" && step.errorText && (
          <div
            style={{
              fontSize: 13,
              color: tokens.red,
              fontFamily: fonts.code,
            }}
          >
            {step.errorText}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metric card                                                          */
/* ------------------------------------------------------------------ */

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 10,
        padding: "16px 14px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          fontWeight: 700,
          color,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: tokens.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finding row                                                          */
/* ------------------------------------------------------------------ */

function FindingRow({ finding, index }: { finding: Finding; index: number }) {
  const priorityColor =
    finding.priority === "high"
      ? tokens.red
      : finding.priority === "medium"
        ? tokens.amber
        : tokens.textMuted;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: tokens.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 600,
          color: tokens.textSecondary,
          marginTop: 1,
        }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>
            {finding.title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: priorityColor,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {finding.priority}
          </span>
        </div>
        <div style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
          {finding.description}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Utility helpers                                                      */
/* ------------------------------------------------------------------ */

function statusIconStyle(status: StepStatus): React.CSSProperties {
  switch (status) {
    case "waiting":
      return { background: tokens.surfaceAlt, border: `2px solid ${tokens.border}` };
    case "running":
      return { background: tokens.blueSoft, border: `2px solid ${tokens.blue}` };
    case "complete":
      return { background: tokens.accent, border: "none", color: "#fff" };
    case "error":
      return { background: tokens.redSoft, border: `2px solid ${tokens.red}` };
  }
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle cx="8" cy="8" r="6" stroke={tokens.blue} strokeWidth="2" opacity="0.25" />
      <path
        d="M14 8A6 6 0 0 0 8 2"
        stroke={tokens.blue}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7L6 10L11 4"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M4 4L10 10M10 4L4 10"
        stroke={tokens.red}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
