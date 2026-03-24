import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

// Standard target columns for healthcare data
const TARGET_COLUMNS = [
  "(unmapped)",
  "member_id",
  "first_name",
  "last_name",
  "date_of_birth",
  "gender",
  "diagnosis_code",
  "diagnosis_description",
  "service_date",
  "provider_npi",
  "provider_name",
  "facility_name",
  "claim_id",
  "claim_amount",
  "procedure_code",
  "procedure_description",
  "plan_id",
  "plan_name",
  "effective_date",
  "termination_date",
  "address",
  "city",
  "state",
  "zip",
  "phone",
  "email",
];

type ProcessingStatus = "idle" | "pending" | "processing" | "completed" | "failed";

interface ColumnMapperProps {
  jobId: string;
  proposedMapping: Record<string, string>;
  sampleData: Record<string, string[]>;
  detectedType: string;
  onComplete?: () => void;
}

export function ColumnMapper({
  jobId,
  proposedMapping,
  sampleData,
  detectedType,
  onComplete,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(proposedMapping);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const sourceColumns = Object.keys(proposedMapping);

  // Compute simple confidence: exact match or fuzzy
  const getConfidence = (source: string, target: string): { level: string; variant: "green" | "amber" | "default" } => {
    if (target === "(unmapped)") return { level: "None", variant: "default" };
    const norm = source.toLowerCase().replace(/[^a-z0-9]/g, "");
    const tNorm = target.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm === tNorm) return { level: "High", variant: "green" };
    if (norm.includes(tNorm) || tNorm.includes(norm)) return { level: "Medium", variant: "amber" };
    return { level: "Low", variant: "default" };
  };

  const handleMappingChange = (source: string, target: string) => {
    setMapping((prev) => ({ ...prev, [source]: target }));
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError("");
    try {
      await api.post(`/api/ingestion/${jobId}/confirm-mapping`, {
        mapping,
        save_as_template: saveAsTemplate,
        template_name: saveAsTemplate ? templateName : undefined,
      });
      setStatus("pending");
      pollStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to confirm mapping.");
      setConfirming(false);
    }
  };

  const pollStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/ingestion/${jobId}`);
        const s = res.data.status as ProcessingStatus;
        setStatus(s);
        if (s === "completed" || s === "failed") {
          clearInterval(interval);
          if (s === "completed") onComplete?.();
          if (s === "failed") setError(res.data.error_summary || "Processing failed.");
        }
      } catch {
        clearInterval(interval);
        setError("Lost connection while checking status.");
      }
    }, 2000);
  };

  const statusVariant = (s: ProcessingStatus) => {
    if (s === "completed") return "green";
    if (s === "processing") return "blue";
    if (s === "failed") return "red";
    return "default";
  };

  const isProcessing = status !== "idle";

  return (
    <div>
      {/* Detected type badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium" style={{ color: tokens.textMuted }}>
          Detected data type:
        </span>
        <Tag variant="blue">{detectedType}</Tag>
      </div>

      {/* Mapping table */}
      <div
        className="rounded-[10px] overflow-hidden"
        style={{ border: `1px solid ${tokens.border}` }}
      >
        <table className="w-full text-sm" style={{ color: tokens.text }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
                Source Column
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
                Sample Data
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
                Mapped To
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {sourceColumns.map((col, i) => {
              const conf = getConfidence(col, mapping[col]);
              const samples = sampleData[col] || [];
              return (
                <tr
                  key={col}
                  style={{
                    borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : undefined,
                    background: tokens.surface,
                  }}
                >
                  <td className="px-4 py-2.5 font-medium text-xs" style={{ fontFamily: fonts.code }}>
                    {col}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                    {samples.slice(0, 3).join(", ") || "--"}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={mapping[col]}
                      onChange={(e) => handleMappingChange(col, e.target.value)}
                      disabled={isProcessing}
                      className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                      style={{
                        border: `1px solid ${tokens.border}`,
                        color: tokens.text,
                        background: tokens.surface,
                        fontFamily: fonts.code,
                      }}
                    >
                      {TARGET_COLUMNS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <Tag variant={conf.variant}>{conf.level}</Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save as template */}
      {!isProcessing && (
        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: tokens.textSecondary }}>
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="rounded"
              style={{ accentColor: tokens.accent }}
            />
            Save as template
          </label>
          {saveAsTemplate && (
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="text-xs px-3 py-1.5 rounded-lg outline-none"
              style={{ border: `1px solid ${tokens.border}`, color: tokens.text }}
            />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 text-xs" style={{ color: tokens.red }}>
          {error}
        </div>
      )}

      {/* Confirm / Status */}
      {!isProcessing ? (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-4 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: tokens.accent }}
        >
          {confirming ? "Confirming..." : "Confirm mapping and process"}
        </button>
      ) : (
        <div
          className="mt-4 rounded-[10px] px-4 py-3 flex items-center justify-between"
          style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
        >
          <span className="text-sm" style={{ color: tokens.textSecondary }}>
            Processing status:
          </span>
          <Tag variant={statusVariant(status)}>
            {status === "pending" && "Pending"}
            {status === "processing" && "Processing..."}
            {status === "completed" && "Completed"}
            {status === "failed" && "Failed"}
          </Tag>
        </div>
      )}
    </div>
  );
}
