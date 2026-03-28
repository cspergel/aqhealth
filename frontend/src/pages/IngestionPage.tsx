import { useState } from "react";
import { tokens, fonts } from "../lib/tokens";
import { FileUpload } from "../components/ingestion/FileUpload";
import { ColumnMapper } from "../components/ingestion/ColumnMapper";
import { JobHistory } from "../components/ingestion/JobHistory";
import { DataRequirementsChecklist } from "../components/onboarding/DataRequirementsChecklist";
import { OrgDiscoveryReview } from "../components/onboarding/OrgDiscoveryReview";

type Tab = "upload" | "history";
type Step = "upload" | "orgDiscovery" | "columnMapper";

interface UploadResult {
  job_id: string;
  proposed_mapping: Record<string, string>;
  sample_data: Record<string, string[]>;
  detected_type: string;
}

export function IngestionPage() {
  const [tab, setTab] = useState<Tab>("upload");
  const [step, setStep] = useState<Step>("upload");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result);
    // Move to org discovery step after upload
    setStep("orgDiscovery");
  };

  const handleOrgConfirm = () => {
    // After confirming org structure, move to column mapper
    setStep("columnMapper");
  };

  const handleOrgSkip = () => {
    // Skip org discovery, go straight to column mapper
    setStep("columnMapper");
  };

  const handleProcessingComplete = () => {
    // After processing completes, reset and switch to history
    setUploadResult(null);
    setStep("upload");
    setTab("history");
  };

  const handleReset = () => {
    setUploadResult(null);
    setStep("upload");
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "history", label: "History" },
  ];

  /* Step indicator for the upload flow */
  const stepLabels: { key: Step; label: string; num: number }[] = [
    { key: "upload", label: "Upload File", num: 1 },
    { key: "orgDiscovery", label: "Org Discovery", num: 2 },
    { key: "columnMapper", label: "Column Mapping", num: 3 },
  ];
  const currentStepIdx = stepLabels.findIndex((s) => s.key === step);

  return (
    <div className="p-7">
      {/* Page header */}
      <h1
        className="text-lg font-bold mb-1"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        Data Ingestion
      </h1>
      <p className="text-xs mb-6" style={{ color: tokens.textMuted }}>
        Upload data files for AI-assisted column mapping and processing.
      </p>

      {/* Data Requirements Checklist — always visible */}
      <DataRequirementsChecklist />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key === "upload" && !uploadResult) setStep("upload");
            }}
            className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{
              background: tab === t.key ? tokens.surface : "transparent",
              color: tab === t.key ? tokens.text : tokens.textMuted,
              border: tab === t.key ? `1px solid ${tokens.border}` : "1px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="rounded-[10px] p-6"
        style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
      >
        {tab === "upload" && (
          <div className="space-y-6">
            {/* Step indicator */}
            {uploadResult && (
              <div className="flex items-center gap-2 mb-2">
                {stepLabels.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-2">
                    {i > 0 && (
                      <div
                        style={{
                          width: 24,
                          height: 1,
                          background: i <= currentStepIdx ? tokens.accent : tokens.border,
                        }}
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <div
                        className="flex items-center justify-center text-[10px] font-bold rounded-full"
                        style={{
                          width: 20,
                          height: 20,
                          background:
                            i < currentStepIdx
                              ? tokens.accentSoft
                              : i === currentStepIdx
                                ? tokens.accent
                                : tokens.surfaceAlt,
                          color:
                            i < currentStepIdx
                              ? tokens.accentText
                              : i === currentStepIdx
                                ? "#fff"
                                : tokens.textMuted,
                          border:
                            i === currentStepIdx
                              ? "none"
                              : `1px solid ${i < currentStepIdx ? tokens.accent : tokens.border}`,
                        }}
                      >
                        {i < currentStepIdx ? "\u2713" : s.num}
                      </div>
                      <span
                        className="text-[11px] font-medium"
                        style={{
                          color: i === currentStepIdx ? tokens.text : tokens.textMuted,
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Reset button */}
                <button
                  onClick={handleReset}
                  className="ml-auto text-[11px] px-2 py-1 rounded"
                  style={{ color: tokens.textMuted, border: `1px solid ${tokens.border}` }}
                >
                  Start over
                </button>
              </div>
            )}

            {/* Step: upload */}
            {step === "upload" && (
              <FileUpload onUploadComplete={handleUploadComplete} />
            )}

            {/* Step: org discovery */}
            {step === "orgDiscovery" && uploadResult && (
              <OrgDiscoveryReview
                jobId={uploadResult.job_id}
                onConfirm={handleOrgConfirm}
                onSkip={handleOrgSkip}
              />
            )}

            {/* Step: column mapper */}
            {step === "columnMapper" && uploadResult && (
              <ColumnMapper
                jobId={uploadResult.job_id}
                proposedMapping={uploadResult.proposed_mapping}
                sampleData={uploadResult.sample_data}
                detectedType={uploadResult.detected_type}
                onComplete={handleProcessingComplete}
              />
            )}
          </div>
        )}

        {tab === "history" && <JobHistory />}
      </div>
    </div>
  );
}
