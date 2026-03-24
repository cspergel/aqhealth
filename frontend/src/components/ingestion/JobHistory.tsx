import { useState, useEffect } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

interface Job {
  job_id: string;
  filename: string;
  detected_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  rows_processed: number;
  error_count: number;
  errors?: Array<{ row: number; message: string }>;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "green" | "blue" | "red" | "default"> = {
  completed: "green",
  processing: "blue",
  failed: "red",
  pending: "default",
};

export function JobHistory() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Array<{ row: number; message: string }>>([]);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await api.get("/api/ingestion/jobs");
      setJobs(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (job: Job) => {
    if (expandedId === job.job_id) {
      setExpandedId(null);
      setExpandedErrors([]);
      return;
    }
    setExpandedId(job.job_id);
    if (job.error_count > 0) {
      try {
        const res = await api.get(`/api/ingestion/${job.job_id}`);
        setExpandedErrors(res.data.errors || []);
      } catch {
        setExpandedErrors([]);
      }
    } else {
      setExpandedErrors([]);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="text-sm py-8 text-center" style={{ color: tokens.textMuted }}>
        Loading jobs...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-sm py-8 text-center" style={{ color: tokens.textMuted }}>
        No upload jobs yet.
      </div>
    );
  }

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ border: `1px solid ${tokens.border}` }}
    >
      <table className="w-full text-sm" style={{ color: tokens.text }}>
        <thead>
          <tr style={{ background: tokens.surfaceAlt }}>
            <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Filename
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Type
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Status
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Rows
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Errors
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: tokens.textMuted }}>
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <>
              <tr
                key={job.job_id}
                onClick={() => toggleExpand(job)}
                className="cursor-pointer transition-colors hover:opacity-80"
                style={{
                  borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : undefined,
                  background: expandedId === job.job_id ? tokens.surfaceAlt : tokens.surface,
                }}
              >
                <td className="px-4 py-2.5 font-medium text-xs">{job.filename}</td>
                <td className="px-4 py-2.5">
                  <Tag variant="blue">{job.detected_type}</Tag>
                </td>
                <td className="px-4 py-2.5">
                  <Tag variant={STATUS_VARIANT[job.status] || "default"}>{job.status}</Tag>
                </td>
                <td
                  className="px-4 py-2.5 text-right text-xs"
                  style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
                >
                  {job.rows_processed.toLocaleString()}
                </td>
                <td
                  className="px-4 py-2.5 text-right text-xs"
                  style={{
                    fontFamily: fonts.code,
                    color: job.error_count > 0 ? tokens.red : tokens.textSecondary,
                  }}
                >
                  {job.error_count}
                </td>
                <td
                  className="px-4 py-2.5 text-right text-xs"
                  style={{ color: tokens.textMuted }}
                >
                  {formatDate(job.created_at)}
                </td>
              </tr>
              {expandedId === job.job_id && (
                <tr key={`${job.job_id}-detail`}>
                  <td colSpan={6} className="px-4 py-3" style={{ background: tokens.surfaceAlt }}>
                    {expandedErrors.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium mb-2" style={{ color: tokens.textSecondary }}>
                          Error details
                        </div>
                        {expandedErrors.map((err, idx) => (
                          <div
                            key={idx}
                            className="text-xs px-3 py-2 rounded-lg"
                            style={{
                              background: tokens.redSoft,
                              color: tokens.red,
                              border: `1px solid #fecaca`,
                            }}
                          >
                            <span style={{ fontFamily: fonts.code }}>Row {err.row}:</span>{" "}
                            {err.message}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: tokens.textMuted }}>
                        {job.error_count === 0
                          ? "No errors. All rows processed successfully."
                          : "Loading error details..."}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
