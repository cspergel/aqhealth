import { useState, useEffect } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface DataRequirement {
  name: string;
  key: string;
  priority: "required" | "recommended" | "enhances";
  status: "complete" | "partial" | "missing";
  impact: string;
  where_to_find: string;
}

interface OnboardingProgress {
  overall_pct: number;
  requirements: DataRequirement[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const priorityOrder: Record<string, number> = {
  required: 0,
  recommended: 1,
  enhances: 2,
};

const priorityLabel: Record<string, string> = {
  required: "Required",
  recommended: "Recommended",
  enhances: "Enhances",
};

const statusVariant: Record<string, "green" | "amber" | "red"> = {
  complete: "green",
  partial: "amber",
  missing: "red",
};

const statusLabel: Record<string, string> = {
  complete: "Complete",
  partial: "Partial",
  missing: "Missing",
};

/* ------------------------------------------------------------------ */
/* Fallback data — used when API is unavailable (demo / offline)       */
/* ------------------------------------------------------------------ */

const FALLBACK_REQUIREMENTS: DataRequirement[] = [
  {
    name: "Member Roster / Eligibility",
    key: "roster",
    priority: "required",
    status: "missing",
    impact: "Core attribution and panel identification. Without it, no member can be linked to a provider or group.",
    where_to_find: "Request from health plan portal under 'Enrollment Reports' or 'Member Roster'. Humana: Availity portal → Reports → Enrollment. UHC: UHC Provider Portal → My Patients.",
  },
  {
    name: "Medical Claims",
    key: "medical_claims",
    priority: "required",
    status: "missing",
    impact: "Drives HCC capture, cost analytics, utilization patterns, and suspect identification. Foundation of revenue analytics.",
    where_to_find: "Health plan claims portal or clearinghouse (Availity, Change Healthcare). Look for 'Claims Detail' or '835/837' extracts.",
  },
  {
    name: "Pharmacy Claims",
    key: "pharmacy_claims",
    priority: "required",
    status: "missing",
    impact: "Medication adherence (PDC), drug-condition mapping for HCC suspects, polypharmacy alerts, Stars measures.",
    where_to_find: "Pharmacy benefit manager (PBM) or health plan Rx portal. Often separate from medical claims. Request D.0 standard format if possible.",
  },
  {
    name: "Provider Roster",
    key: "provider_roster",
    priority: "required",
    status: "missing",
    impact: "Maps NPIs to practice groups and specialties. Required for group-level scorecards and provider attribution.",
    where_to_find: "Internal MSO records or health plan credentialing portal. Should include NPI, TIN, specialty, group affiliation.",
  },
  {
    name: "Risk Scores / RAF",
    key: "risk_scores",
    priority: "recommended",
    status: "missing",
    impact: "Baseline RAF scores for revenue projection, gap identification, and year-over-year trending.",
    where_to_find: "CMS RAPS/EDS feedback files, or health plan risk adjustment portal. Humana: Provider Portal → Risk Adjustment → RAF Scores.",
  },
  {
    name: "Care Gaps / Quality",
    key: "care_gaps",
    priority: "recommended",
    status: "missing",
    impact: "Pre-populated care gap lists accelerate quality closure. Stars measure tracking from day one.",
    where_to_find: "Health plan quality portal or Availity → Quality Reports. Look for 'Open Care Gaps' or 'HEDIS Gaps'.",
  },
  {
    name: "Prior Authorizations",
    key: "prior_auth",
    priority: "recommended",
    status: "missing",
    impact: "Auth tracking, denial pattern analysis, and utilization management insights.",
    where_to_find: "Health plan auth portal or internal UM system export. Include auth ID, status, dates, and decision.",
  },
  {
    name: "Lab Results",
    key: "lab_results",
    priority: "enhances",
    status: "missing",
    impact: "Clinical decision support, A1c trending for diabetes management, eGFR for CKD staging.",
    where_to_find: "Lab vendor (Quest, LabCorp) HL7 feed or CSV export. Also available from EHR clinical data export.",
  },
  {
    name: "ADT Notifications",
    key: "adt_feeds",
    priority: "enhances",
    status: "missing",
    impact: "Real-time admission/discharge alerts for TCM workflow, census tracking, and avoidable readmission prevention.",
    where_to_find: "Sign up with Bamboo Health (formerly PatientPing) or Availity Real-Time Notifications. Configure via Integrations page.",
  },
  {
    name: "Capitation / Financial",
    key: "capitation",
    priority: "enhances",
    status: "missing",
    impact: "Revenue vs cost analysis, PMPM trending, stop-loss tracking, and practice-level P&L.",
    where_to_find: "Health plan capitation statements or 820 remittance files. Monthly PMPM reports from plan finance portal.",
  },
];

const FALLBACK_PROGRESS: OnboardingProgress = {
  overall_pct: 0,
  requirements: FALLBACK_REQUIREMENTS,
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DataRequirementsChecklist() {
  const [progress, setProgress] = useState<OnboardingProgress>(FALLBACK_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<OnboardingProgress>("/api/onboarding/progress");
        if (!cancelled) setProgress(res.data);
      } catch {
        // Use fallback data — API not yet available or offline
        if (!cancelled) setProgress(FALLBACK_PROGRESS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = progress.requirements
    .slice()
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  const sections: { priority: string; items: DataRequirement[] }[] = [];
  let lastPriority = "";
  for (const req of grouped) {
    if (req.priority !== lastPriority) {
      sections.push({ priority: req.priority, items: [] });
      lastPriority = req.priority;
    }
    sections[sections.length - 1].items.push(req);
  }

  const pct = progress.overall_pct;

  return (
    <div
      className="rounded-[10px] mb-6"
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Data Requirements
          </span>
          <Tag variant={pct >= 80 ? "green" : pct >= 40 ? "amber" : "red"}>
            {pct}% loaded
          </Tag>
        </div>
        <span
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 200ms ease",
            display: "inline-block",
          }}
        >
          {"\u25BC"}
        </span>
      </button>

      {/* Progress bar */}
      <div
        className="mx-5"
        style={{
          height: 4,
          borderRadius: 2,
          background: tokens.surfaceAlt,
          marginBottom: collapsed ? 16 : 0,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 2,
            background: pct >= 80 ? tokens.accent : pct >= 40 ? tokens.amber : tokens.red,
            transition: "width 400ms ease",
          }}
        />
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-4 pt-3">
          {loading ? (
            <div className="text-xs py-4 text-center" style={{ color: tokens.textMuted }}>
              Loading requirements...
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.priority} className="mb-3 last:mb-0">
                <div
                  className="text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: tokens.textMuted }}
                >
                  {priorityLabel[section.priority] ?? section.priority}
                </div>
                {section.items.map((req) => {
                  const isExpanded = expandedRow === req.key;
                  return (
                    <div
                      key={req.key}
                      className="rounded-lg mb-1"
                      style={{
                        border: `1px solid ${tokens.borderSoft}`,
                        background: isExpanded ? tokens.surfaceAlt : "transparent",
                      }}
                    >
                      {/* Row */}
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : req.key)}
                        className="w-full flex items-center justify-between px-3 py-2"
                        style={{ background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: tokens.text }}>
                            {req.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag variant={statusVariant[req.status] ?? "default"}>
                            {statusLabel[req.status] ?? req.status}
                          </Tag>
                          {/* Impact tooltip via title attribute */}
                          <span
                            className="text-[10px] cursor-help"
                            style={{ color: tokens.textMuted }}
                            title={req.impact}
                          >
                            {"\u24D8"}
                          </span>
                        </div>
                      </button>

                      {/* Expanded: Where to find it */}
                      {isExpanded && (
                        <div
                          className="px-3 pb-3 text-xs leading-relaxed"
                          style={{ color: tokens.textSecondary }}
                        >
                          <div className="mb-1.5" style={{ color: tokens.textMuted }}>
                            <strong>Impact:</strong> {req.impact}
                          </div>
                          <div
                            className="rounded-lg p-2.5"
                            style={{ background: tokens.surface, border: `1px solid ${tokens.borderSoft}` }}
                          >
                            <div
                              className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                              style={{ color: tokens.textMuted }}
                            >
                              Where to find it
                            </div>
                            {req.where_to_find}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
