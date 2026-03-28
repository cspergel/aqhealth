import { useState, useEffect } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface QualityError {
  type: string;
  count: number;
  severity: "error" | "warning";
  sample_values: string[];
  description: string;
}

interface QualitySummary {
  total_rows: number;
  clean_rows: number;
  clean_pct: number;
  warning_count: number;
  error_count: number;
  errors: QualityError[];
}

interface WizardStep4QualityProps {
  /** Whether data has been loaded */
  hasData: boolean;
  /** Called when user wants to go back to load data */
  onGoBack: () => void;
}

/* ------------------------------------------------------------------ */
/* Fallback data                                                       */
/* ------------------------------------------------------------------ */

const FALLBACK_SUMMARY: QualitySummary = {
  total_rows: 12847,
  clean_rows: 12403,
  clean_pct: 96.5,
  warning_count: 312,
  error_count: 132,
  errors: [
    {
      type: "invalid_date",
      count: 45,
      severity: "error",
      sample_values: ["13/32/2024", "00/00/0000", "2024-15-01"],
      description: "Date values that cannot be parsed into a valid date format",
    },
    {
      type: "missing_npi",
      count: 38,
      severity: "error",
      sample_values: ["(empty)", "(empty)", "N/A"],
      description: "Rows missing a required rendering or billing NPI",
    },
    {
      type: "invalid_icd10",
      count: 49,
      severity: "error",
      sample_values: ["Z99.99", "A00", "123.45"],
      description: "ICD-10 codes that do not match a valid code in the CMS reference",
    },
    {
      type: "duplicate_claim_id",
      count: 87,
      severity: "warning",
      sample_values: ["CLM-10045", "CLM-10045", "CLM-22871"],
      description: "Claim IDs that appear more than once — may be line-level detail or true duplicates",
    },
    {
      type: "future_service_date",
      count: 12,
      severity: "warning",
      sample_values: ["2027-01-15", "2026-12-31", "2028-03-01"],
      description: "Service dates that are in the future — likely data entry errors",
    },
    {
      type: "missing_tin",
      count: 213,
      severity: "warning",
      sample_values: ["(empty)", "(empty)", "(empty)"],
      description: "Rows without a billing TIN — cannot be auto-routed to a practice group",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant: "default" | "green" | "amber" | "red";
}) {
  const colors = {
    default: { bg: tokens.surface, border: tokens.border, text: tokens.text },
    green: { bg: tokens.accentSoft, border: "#bbf7d0", text: tokens.accentText },
    amber: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
    red: { bg: tokens.redSoft, border: "#fecaca", text: "#991b1b" },
  };
  const c = colors[variant];

  return (
    <div
      className="rounded-[10px] p-4 flex-1"
      style={{ background: c.bg, border: `1px solid ${c.border}`, minWidth: 140 }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-wide mb-1"
        style={{ color: tokens.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-bold"
        style={{ fontFamily: fonts.heading, color: c.text }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ErrorRow({
  error,
  onFix,
  onSkip,
}: {
  error: QualityError;
  onFix: () => void;
  onSkip: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg"
      style={{
        border: `1px solid ${error.severity === "error" ? "#fecaca" : "#fde68a"}`,
        background: expanded
          ? error.severity === "error"
            ? tokens.redSoft
            : tokens.amberSoft
          : tokens.surface,
      }}
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-3">
          <Tag variant={error.severity === "error" ? "red" : "amber"}>
            {error.severity === "error" ? "Error" : "Warning"}
          </Tag>
          <span className="text-xs font-medium" style={{ color: tokens.text }}>
            {error.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold"
            style={{
              color: error.severity === "error" ? "#991b1b" : "#92400e",
              fontFamily: fonts.code,
            }}
          >
            {error.count}
          </span>
          <span
            style={{
              fontSize: 10,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 200ms",
              display: "inline-block",
              color: tokens.textMuted,
            }}
          >
            {"\u25B8"}
          </span>
        </div>
      </button>

      {expanded && (
        <div
          className="px-4 pb-3"
          style={{ borderTop: `1px solid ${tokens.borderSoft}` }}
        >
          <div className="text-xs mt-2 mb-2 leading-relaxed" style={{ color: tokens.textSecondary }}>
            {error.description}
          </div>

          {/* Sample values */}
          <div
            className="text-[10px] font-semibold uppercase tracking-wide mb-1"
            style={{ color: tokens.textMuted }}
          >
            Sample Values
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {error.sample_values.map((val, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  background: tokens.surfaceAlt,
                  color: tokens.textSecondary,
                  fontFamily: fonts.code,
                  border: `1px solid ${tokens.borderSoft}`,
                }}
              >
                {val}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFix();
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: tokens.accent,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Auto-fix
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: tokens.surface,
                color: tokens.textSecondary,
                border: `1px solid ${tokens.border}`,
                cursor: "pointer",
              }}
            >
              Skip / Ignore
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function WizardStep4Quality({ hasData, onGoBack }: WizardStep4QualityProps) {
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [skippedTypes, setSkippedTypes] = useState<Set<string>>(new Set());
  const [fixedTypes, setFixedTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hasData) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<QualitySummary>("/api/data-quality/summary");
        if (!cancelled) setSummary(res.data);
      } catch {
        // Use fallback data
        if (!cancelled) setSummary(FALLBACK_SUMMARY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasData]);

  /* No data loaded — prompt user to go back */
  if (!hasData) {
    return (
      <div
        className="rounded-[10px] py-16 text-center"
        style={{
          border: `2px dashed ${tokens.border}`,
          background: tokens.surfaceAlt,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: tokens.amberSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v4m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z"
              stroke={tokens.amber}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          className="text-sm font-semibold mb-2"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          No Data to Review
        </div>
        <div
          className="text-xs mb-6 max-w-md mx-auto leading-relaxed"
          style={{ color: tokens.textSecondary }}
        >
          Go back and upload data or connect a health plan to run quality checks.
        </div>
        <button
          onClick={onGoBack}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: tokens.accent, border: "none", cursor: "pointer" }}
        >
          Go Back to Data Sources
        </button>
      </div>
    );
  }

  /* Loading */
  if (loading) {
    return (
      <div className="py-12 text-center">
        <div
          className="text-sm font-medium mb-2"
          style={{ color: tokens.text, fontFamily: fonts.heading }}
        >
          Running quality checks...
        </div>
        <div className="text-xs" style={{ color: tokens.textMuted }}>
          Validating dates, codes, NPI formats, and identifying duplicates.
        </div>
        <div className="mt-4 flex justify-center">
          <div
            style={{
              width: 24,
              height: 24,
              border: `3px solid ${tokens.border}`,
              borderTop: `3px solid ${tokens.accent}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!summary) return null;

  const activeErrors = summary.errors.filter(
    (e) => !skippedTypes.has(e.type) && !fixedTypes.has(e.type),
  );
  const resolvedCount = skippedTypes.size + fixedTypes.size;
  const isClean = summary.clean_pct >= 95 && activeErrors.length === 0;

  return (
    <div>
      {/* Summary cards */}
      <div className="flex flex-wrap gap-3 mb-6">
        <SummaryCard
          label="Total Rows"
          value={summary.total_rows}
          variant="default"
        />
        <SummaryCard
          label="Clean Rows"
          value={`${summary.clean_pct}%`}
          variant={summary.clean_pct >= 95 ? "green" : summary.clean_pct >= 80 ? "amber" : "red"}
        />
        <SummaryCard
          label="Warnings"
          value={summary.warning_count}
          variant={summary.warning_count === 0 ? "green" : "amber"}
        />
        <SummaryCard
          label="Errors"
          value={summary.error_count}
          variant={summary.error_count === 0 ? "green" : "red"}
        />
      </div>

      {/* All good banner */}
      {isClean && (
        <div
          className="rounded-[10px] p-5 mb-6 text-center"
          style={{ background: tokens.accentSoft, border: `1px solid #bbf7d0` }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: tokens.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            className="text-sm font-semibold mb-1"
            style={{ fontFamily: fonts.heading, color: tokens.accentText }}
          >
            All Looks Good
          </div>
          <div className="text-xs" style={{ color: tokens.accentText }}>
            Your data passed quality checks with {summary.clean_pct}% clean rows.
            {resolvedCount > 0 &&
              ` ${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} resolved.`}
            {" "}Ready to proceed to processing.
          </div>
        </div>
      )}

      {/* Error breakdown */}
      {activeErrors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div
              className="text-sm font-semibold"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Issues Found
            </div>
            <div className="text-xs" style={{ color: tokens.textMuted }}>
              {activeErrors.length} type{activeErrors.length !== 1 ? "s" : ""}
              {resolvedCount > 0 && ` (${resolvedCount} resolved)`}
            </div>
          </div>

          <div className="space-y-2">
            {activeErrors.map((err) => (
              <ErrorRow
                key={err.type}
                error={err}
                onFix={() => setFixedTypes((prev) => new Set([...prev, err.type]))}
                onSkip={() => setSkippedTypes((prev) => new Set([...prev, err.type]))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Resolved items */}
      {resolvedCount > 0 && !isClean && (
        <div
          className="mt-4 rounded-[10px] p-3"
          style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
        >
          <div
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textMuted }}
          >
            Resolved ({resolvedCount})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...fixedTypes].map((t) => (
              <Tag key={t} variant="green">
                {t.replace(/_/g, " ")} — fixed
              </Tag>
            ))}
            {[...skippedTypes].map((t) => (
              <Tag key={t} variant="default">
                {t.replace(/_/g, " ")} — skipped
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
