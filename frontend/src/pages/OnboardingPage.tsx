import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { tokens, fonts } from "../lib/tokens";
import { WizardShell, type WizardStep } from "../components/onboarding/WizardShell";
import { WizardStep1Org } from "../components/onboarding/WizardStep1Org";
import { WizardStep2DataSources } from "../components/onboarding/WizardStep2DataSources";
import { WizardStep3Structure } from "../components/onboarding/WizardStep3Structure";
import { WizardStep4Quality } from "../components/onboarding/WizardStep4Quality";
import { WizardStep5Processing } from "../components/onboarding/WizardStep5Processing";

/* ------------------------------------------------------------------ */
/* OnboardingPage — 5-step setup wizard                                */
/* ------------------------------------------------------------------ */

const STEP_DEFINITIONS: { title: string; description: string }[] = [
  {
    title: "Organization",
    description:
      "Set up your organization profile — name, type, state, payer mix, and quality bonus tier.",
  },
  {
    title: "Data Sources",
    description:
      "Upload your claims, eligibility, and provider data. We'll auto-detect file types and suggest column mappings.",
  },
  {
    title: "Structure",
    description:
      "Review the organizational structure we discovered — practice groups, providers, and TIN assignments.",
  },
  {
    title: "Quality Review",
    description:
      "Review data quality results, fix validation errors, and approve the final dataset for processing.",
  },
  {
    title: "Processing",
    description:
      "Run the analytics pipeline — HCC analysis, provider scorecards, care gap detection, and AI insights.",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "true";
  const [currentStep, setCurrentStep] = useState(0);
  const [step1Confirmed, setStep1Confirmed] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
  const [structureConfirmed, setStructureConfirmed] = useState(false);
  const [step5Complete, setStep5Complete] = useState(false);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleFinish = useCallback(() => {
    // TODO: Update tenant onboarding_status.wizard_completed = true
    // via PUT /api/tenants/{id}
    navigate("/");
  }, [navigate]);

  const handleExit = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleStep1Confirm = useCallback(() => {
    setStep1Confirmed(true);
    setCurrentStep(1);
  }, []);

  const handleStep5Complete = useCallback(() => {
    setStep5Complete(true);
  }, []);

  // Build wizard steps — Step 1 and Step 5 use real components, others are placeholders
  const steps: WizardStep[] = STEP_DEFINITIONS.map((def, i) => ({
    title: def.title,
    description: def.description,
    component:
      i === 0 ? (
        <WizardStep1Org onConfirm={handleStep1Confirm} />
      ) : i === 4 ? (
        <WizardStep5Processing
          demoMode={isDemoMode}
          onComplete={handleStep5Complete}
        />
      ) : (
        <StepPlaceholder title={def.title} description={def.description} />
      ),
  }));

  // Disable Next on Step 1 (own confirm gate) and Step 5 (until pipeline finishes)
  const nextDisabled =
    (currentStep === 0 && !step1Confirmed) ||
    (currentStep === 4 && !step5Complete);

  return (
    <div style={{ minHeight: "100%" }}>
      {/* Exit wizard header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 32px",
          borderBottom: `1px solid ${tokens.borderSoft}`,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 16,
            fontWeight: 700,
            color: tokens.text,
            margin: 0,
          }}
        >
          Setup Wizard
        </h1>
        <button
          onClick={handleExit}
          style={{
            fontSize: 13,
            color: tokens.textSecondary,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: 6,
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tokens.surfaceAlt;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Exit Wizard
        </button>
      </div>

      <WizardShell
        steps={steps}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onFinish={handleFinish}
        finishLabel="Go to Dashboard"
        nextDisabled={nextDisabled}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Placeholder component for each step (replaced by real components)   */
/* ------------------------------------------------------------------ */

function StepPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        border: `2px dashed ${tokens.border}`,
        borderRadius: 12,
        padding: "48px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 320,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: tokens.blueSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 24, color: tokens.blue }}>
          {title === "Organization"
            ? "\u{1F3E2}"
            : title === "Data Sources"
              ? "\u{1F4C1}"
              : title === "Structure"
                ? "\u{1F3D7}"
                : title === "Quality Review"
                  ? "\u{2705}"
                  : "\u{26A1}"}
        </span>
      </div>
      <h3
        style={{
          fontFamily: fonts.heading,
          fontSize: 18,
          fontWeight: 600,
          color: tokens.text,
          margin: "0 0 8px 0",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 14,
          color: tokens.textSecondary,
          margin: 0,
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      <div
        style={{
          marginTop: 24,
          padding: "8px 16px",
          borderRadius: 6,
          background: tokens.surfaceAlt,
          fontSize: 12,
          color: tokens.textMuted,
          fontFamily: fonts.code,
        }}
      >
        Component slot — will be implemented in subsequent tasks
      </div>
    </div>
  );
}
