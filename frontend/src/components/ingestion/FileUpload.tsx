import { useState, useRef, useCallback } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface UploadResult {
  job_id: string;
  proposed_mapping: Record<string, string>;
  sample_data: Record<string, string[]>;
  detected_type: string;
  /** Extended fields from detect_type_with_metadata (may not exist on older backends) */
  confidence?: number;
  row_count?: number;
  detected_payer?: string | null;
}

interface FileUploadProps {
  onUploadComplete: (result: UploadResult) => void;
}

/* ------------------------------------------------------------------ */
/* File type options for override dropdown                              */
/* ------------------------------------------------------------------ */

const FILE_TYPE_OPTIONS = [
  "claims",
  "roster",
  "pharmacy",
  "providers",
  "prior_auth",
  "lab_results",
  "care_gaps",
  "risk_scores",
  "capitation",
  "encounters",
  "adt_census",
  "quality_report",
  "provider_roster",
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [identification, setIdentification] = useState<UploadResult | null>(null);
  const [typeOverride, setTypeOverride] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED = ".csv,.xlsx,.xls";

  const isValidFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ext === "csv" || ext === "xlsx" || ext === "xls";
  };

  const handleFile = (file: File) => {
    if (!isValidFile(file)) {
      setError("Only CSV and Excel files are accepted.");
      return;
    }
    setError("");
    setSelectedFile(file);
    setIdentification(null);
    setTypeOverride(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await api.post<UploadResult>("/api/ingestion/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Show identification before proceeding
      setIdentification(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = () => {
    if (!identification) return;
    const result = typeOverride
      ? { ...identification, detected_type: typeOverride }
      : identification;
    onUploadComplete(result);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setError("");
    setIdentification(null);
    setTypeOverride(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const effectiveType = typeOverride || identification?.detected_type || "";
  const confidence = identification?.confidence;
  const rowCount = identification?.row_count;
  const detectedPayer = identification?.detected_payer;

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !selectedFile && inputRef.current?.click()}
        className="rounded-[10px] p-8 text-center transition-colors"
        style={{
          border: `2px dashed ${dragOver ? tokens.accent : tokens.border}`,
          background: dragOver ? tokens.accentSoft : tokens.surfaceAlt,
          cursor: selectedFile ? "default" : "pointer",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleInputChange}
          className="hidden"
        />

        {!selectedFile ? (
          <div>
            <div className="text-sm font-medium mb-1" style={{ color: tokens.text }}>
              Drop a CSV or Excel file here, or click to browse
            </div>
            <div className="text-xs" style={{ color: tokens.textMuted }}>
              Accepted formats: .csv, .xlsx, .xls
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <div>
              <div className="text-sm font-medium" style={{ color: tokens.text }}>
                {selectedFile.name}
              </div>
              <div className="text-xs" style={{ color: tokens.textMuted, fontFamily: fonts.code }}>
                {formatSize(selectedFile.size)}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: tokens.textMuted, border: `1px solid ${tokens.border}` }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 text-xs" style={{ color: tokens.red }}>
          {error}
        </div>
      )}

      {/* File identification result */}
      {identification && (
        <div
          className="mt-4 rounded-[10px] p-4"
          style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="text-xs leading-relaxed" style={{ color: tokens.text }}>
              This looks like a <strong>{effectiveType}</strong> file
              {confidence != null && (
                <span style={{ color: tokens.textMuted }}>
                  {" "}({confidence}% confidence)
                </span>
              )}
              {rowCount != null && (
                <span style={{ color: tokens.textMuted }}>
                  . {rowCount.toLocaleString()} rows detected
                </span>
              )}
              .
            </div>
            <Tag variant={confidence != null && confidence >= 80 ? "green" : "amber"}>
              {confidence != null && confidence >= 80 ? "High match" : "Review type"}
            </Tag>
          </div>

          {detectedPayer && (
            <div className="text-xs mb-3" style={{ color: tokens.textSecondary }}>
              Detected payer: <strong>{detectedPayer}</strong>
            </div>
          )}

          {/* Type override */}
          <div className="flex items-center gap-2 mt-2">
            <label
              className="text-[11px] font-medium"
              style={{ color: tokens.textMuted }}
            >
              Override type:
            </label>
            <select
              value={typeOverride || ""}
              onChange={(e) => setTypeOverride(e.target.value || null)}
              className="text-xs px-2 py-1.5 rounded-lg outline-none"
              style={{
                border: `1px solid ${tokens.border}`,
                color: tokens.text,
                background: tokens.surface,
                fontFamily: fonts.code,
              }}
            >
              <option value="">
                Use detected: {identification.detected_type}
              </option>
              {FILE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Upload button — shown before upload */}
      {selectedFile && !identification && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: tokens.accent }}
        >
          {uploading ? "Uploading and analyzing..." : "Upload and analyze"}
        </button>
      )}

      {/* Proceed button — shown after identification */}
      {identification && (
        <button
          onClick={handleProceed}
          className="mt-4 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white transition-opacity"
          style={{ background: tokens.accent }}
        >
          Continue with {effectiveType}
        </button>
      )}

      {/* Loading indicator */}
      {uploading && (
        <div className="mt-3 text-xs text-center" style={{ color: tokens.textMuted }}>
          AI is detecting columns and proposing a mapping. This may take a moment...
        </div>
      )}
    </div>
  );
}
