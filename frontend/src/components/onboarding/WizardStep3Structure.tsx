import { tokens, fonts } from "../../lib/tokens";
import { OrgDiscoveryReview } from "./OrgDiscoveryReview";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface WizardStep3StructureProps {
  /** Job ID from the data upload step — used to discover org structure */
  jobId: string | null;
  /** Whether data has been loaded (from API connection or file upload) */
  hasData: boolean;
  /** Called when the user confirms the discovered structure */
  onConfirm: () => void;
  /** Called when the user skips org discovery */
  onSkip: () => void;
  /** Called when user wants to go back to load data */
  onGoBack: () => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function WizardStep3Structure({
  jobId,
  hasData,
  onConfirm,
  onSkip,
  onGoBack,
}: WizardStep3StructureProps) {
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
          No Data Loaded Yet
        </div>
        <div
          className="text-xs mb-6 max-w-md mx-auto leading-relaxed"
          style={{ color: tokens.textSecondary }}
        >
          Upload data or connect a health plan first. Organization structure
          is discovered automatically from your claims and provider data.
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

  /* Data loaded via API (no specific job ID) — show API-based discovery */
  if (!jobId) {
    return (
      <div>
        <div
          className="rounded-[10px] p-4 mb-5"
          style={{ background: tokens.blueSoft, border: `1px solid #bfdbfe` }}
        >
          <div className="text-xs" style={{ color: "#1e40af" }}>
            <strong>API-connected data:</strong> Organization structure will be
            auto-discovered from connected health plan data. This may take a moment
            while we pull and analyze provider rosters.
          </div>
        </div>

        {/* Use OrgDiscoveryReview with a synthetic job ID for API-based discovery */}
        <OrgDiscoveryReview
          jobId="__api_discovery__"
          onConfirm={onConfirm}
          onSkip={onSkip}
        />
      </div>
    );
  }

  /* Data uploaded with a job ID — standard file-based discovery */
  return (
    <div>
      <div
        className="rounded-[10px] p-4 mb-5"
        style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
      >
        <div className="text-xs" style={{ color: tokens.textSecondary }}>
          Analyzing your uploaded data to discover practice groups, providers,
          and TIN assignments. You can edit names and relationships before confirming.
        </div>
      </div>

      <OrgDiscoveryReview
        jobId={jobId}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    </div>
  );
}
