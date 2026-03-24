import { useState, useRef, useCallback } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface UploadResult {
  job_id: string;
  proposed_mapping: Record<string, string>;
  sample_data: Record<string, string[]>;
  detected_type: string;
}

interface FileUploadProps {
  onUploadComplete: (result: UploadResult) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
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
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
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
      onUploadComplete(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

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

      {/* Upload button */}
      {selectedFile && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full py-2.5 rounded-[10px] text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: tokens.accent }}
        >
          {uploading ? "Uploading and analyzing..." : "Upload and analyze"}
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
