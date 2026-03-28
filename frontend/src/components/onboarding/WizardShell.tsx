import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* WizardShell — reusable multi-step wizard wrapper                    */
/* ------------------------------------------------------------------ */

export interface WizardStep {
  title: string;
  description: string;
  component: React.ReactNode;
}

interface WizardShellProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  /** Optional: hide the Back button on the first step (default true) */
  hideBackOnFirst?: boolean;
  /** Optional: label for the final step's Next button */
  finishLabel?: string;
  /** Optional: called when user clicks Next on the last step */
  onFinish?: () => void;
  /** Optional: disable the Next button (e.g., waiting for confirmation) */
  nextDisabled?: boolean;
  /** Optional: show a Skip button for the current step */
  allowSkip?: boolean;
  onSkip?: () => void;
}

export function WizardShell({
  steps,
  currentStep,
  onStepChange,
  hideBackOnFirst = true,
  finishLabel = "Finish",
  onFinish,
  nextDisabled = false,
  allowSkip = false,
  onSkip,
}: WizardShellProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const current = steps[currentStep];

  const handleBack = () => {
    if (!isFirst) onStepChange(currentStep - 1);
  };

  const handleNext = () => {
    if (isLast) {
      onFinish?.();
    } else {
      onStepChange(currentStep + 1);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      {/* Step indicator bar */}
      <StepIndicator steps={steps} currentStep={currentStep} />

      {/* Current step header */}
      <div style={{ padding: "24px 32px 0 32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontFamily: fonts.heading,
              fontSize: 13,
              fontWeight: 600,
              color: tokens.blue,
              letterSpacing: "0.02em",
            }}
          >
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>
        <h2
          style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            fontWeight: 700,
            color: tokens.text,
            margin: "0 0 4px 0",
          }}
        >
          {current.title}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: tokens.textSecondary,
            margin: "0 0 24px 0",
            lineHeight: 1.5,
          }}
        >
          {current.description}
        </p>
      </div>

      {/* Step content area */}
      <div
        style={{
          flex: 1,
          padding: "0 32px 24px 32px",
        }}
      >
        {current.component}
      </div>

      {/* Navigation footer */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderTop: `1px solid ${tokens.border}`,
          background: tokens.surface,
          zIndex: 10,
        }}
      >
        <div>
          {!(hideBackOnFirst && isFirst) && (
            <button
              onClick={handleBack}
              disabled={isFirst}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                background: tokens.surface,
                color: isFirst ? tokens.textMuted : tokens.text,
                cursor: isFirst ? "default" : "pointer",
                opacity: isFirst ? 0.5 : 1,
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => {
                if (!isFirst) e.currentTarget.style.background = tokens.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokens.surface;
              }}
            >
              Back
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {allowSkip && (
            <button
              onClick={onSkip}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                background: tokens.surface,
                color: tokens.textSecondary,
                cursor: "pointer",
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokens.surface;
              }}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={nextDisabled}
            style={{
              padding: "8px 24px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              background: nextDisabled ? tokens.textMuted : tokens.accent,
              color: "#ffffff",
              cursor: nextDisabled ? "default" : "pointer",
              opacity: nextDisabled ? 0.5 : 1,
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => {
              if (!nextDisabled) e.currentTarget.style.background = tokens.accentText;
            }}
            onMouseLeave={(e) => {
              if (!nextDisabled) e.currentTarget.style.background = tokens.accent;
            }}
          >
            {isLast ? finishLabel : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step indicator bar                                                   */
/* ------------------------------------------------------------------ */

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: WizardStep[];
  currentStep: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "20px 32px",
        gap: 0,
        background: tokens.surface,
        borderBottom: `1px solid ${tokens.border}`,
        overflowX: "auto",
      }}
    >
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Step circle + label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                  background: isCompleted
                    ? tokens.accent
                    : isCurrent
                      ? tokens.blue
                      : tokens.surfaceAlt,
                  color: isCompleted || isCurrent ? "#ffffff" : tokens.textMuted,
                  border: isCompleted || isCurrent
                    ? "none"
                    : `2px solid ${tokens.border}`,
                  transition: "all 200ms ease",
                }}
              >
                {isCompleted ? (
                  <CheckIcon />
                ) : (
                  i + 1
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent
                      ? tokens.text
                      : isCompleted
                        ? tokens.accentText
                        : tokens.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {step.title}
                </div>
              </div>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: "0 12px",
                  borderRadius: 1,
                  background: isCompleted ? tokens.accent : tokens.border,
                  transition: "background 200ms ease",
                  minWidth: 16,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Check icon SVG                                                      */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 7L6 10L11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
