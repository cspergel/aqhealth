import { useState } from "react";
import { tokens, fonts } from "../lib/tokens";
import { FileUpload } from "../components/ingestion/FileUpload";
import { ColumnMapper } from "../components/ingestion/ColumnMapper";
import { JobHistory } from "../components/ingestion/JobHistory";

type Tab = "upload" | "history";

interface UploadResult {
  job_id: string;
  proposed_mapping: Record<string, string>;
  sample_data: Record<string, string[]>;
  detected_type: string;
}

export function IngestionPage() {
  const [tab, setTab] = useState<Tab>("upload");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result);
  };

  const handleProcessingComplete = () => {
    // After processing completes, switch to history and reset upload
    setUploadResult(null);
    setTab("history");
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "history", label: "History" },
  ];

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

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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
            {!uploadResult ? (
              <FileUpload onUploadComplete={handleUploadComplete} />
            ) : (
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
