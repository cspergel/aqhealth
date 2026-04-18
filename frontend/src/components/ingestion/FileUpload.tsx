import { useState, useRef, useCallback } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/* ------------------------------------------------------------------ */
/* Types — backend contract + normalized frontend shape                */
/* ------------------------------------------------------------------ */

// Backend UploadResponse (backend/app/routers/ingestion.py:80)
interface ColumnMappingEntry {
  platform_field: string | null;
  confidence: number;
  transform?: Record<string, unknown> | null;
}

interface UploadResponse {
  job_id: number;
  filename: string;
  detected_type: string;
  proposed_mapping: Record<string, ColumnMappingEntry>;
  sample_rows: string[][];
  headers: string[];
  preprocessing?: { warnings?: string[] } | null;
  file_identification?: { data_type: string; confidence: number; payer_hint: string | null } | null;
}

// Frontend normalized shape consumed by IngestionPage + ColumnMapper
interface UploadResult {
  job_id: string;
  proposed_mapping: Record<string, string>;
  sample_data: Record<string, string[]>;
  detected_type: string;
  confidence?: number;
  row_count?: number;
  detected_payer?: string | null;
}

interface FileUploadProps {
  onUploadComplete: (result: UploadResult) => void;
}

function normalizeUploadResponse(resp: UploadResponse): UploadResult {
  // Flatten nested proposed_mapping to the flat Record<source, target> shape
  const flatMapping: Record<string, string> = {};
  for (const [source, entry] of Object.entries(resp.proposed_mapping || {})) {
    flatMapping[source] = entry?.platform_field || "(unmapped)";
  }

  // Pivot sample_rows (row-major) into sample_data (column-major) keyed by header
  const sample_data: Record<string, string[]> = {};
  const headers = Array.isArray(resp.headers) ? resp.headers : [];
  const rows = Array.isArray(resp.sample_rows) ? resp.sample_rows : [];
  headers.forEach((h, i) => {
    sample_data[h] = rows.map((r) => (r && r[i] != null ? String(r[i]) : ""));
  });

  return {
    job_id: String(resp.job_id),
    proposed_mapping: flatMapping,
    sample_data,
    detected_type: resp.detected_type,
    confidence: resp.file_identification?.confidence,
    // NOTE: backend UploadResponse does not emit a total row count at this
    // stage (it's discovered during post-upload processing). Emitting
    // sample_rows.length here would claim ~5 rows on a 100k-row file —
    // misleading by 3-4 orders of magnitude. Leave undefined.
    row_count: undefined,
    detected_payer: resp.file_identification?.payer_hint ?? null,
  };
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
      const res = await api.post<UploadResponse>("/api/ingestion/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const normalized = normalizeUploadResponse(res.data);
      if (!normalized || Object.keys(normalized.proposed_mapping).length === 0) {
        setError("The server returned an empty mapping. Check the file and retry.");
        return;
      }
      setIdentification(normalized);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 413) setError("File is too large. Split it into smaller files and retry.");
      else if (status === 415) setError("Unsupported file type. Use CSV or Excel.");
      else if (status === 504 || status === 408) setError("Server took too long. Try a smaller sample or retry.");
      else if (!status || err?.message === "Network Error") setError("Can't reach the server. Check your connection.");
      else setError(typeof detail === "string" ? detail : "Upload failed. Please try again.");
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
