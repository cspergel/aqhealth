import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";
import { ReportViewer } from "../components/reports/ReportViewer";

interface ReportTemplate {
  id: number;
  name: string;
  description: string | null;
  report_type: string;
  sections: { key?: string; type: string; title: string }[];
  schedule: string | null;
  is_system: boolean;
}

interface GeneratedReport {
  id: number;
  template_id: number;
  title: string;
  period: string;
  status: string;
  content: Record<string, unknown> | null;
  ai_narrative: string | null;
  generated_by: number;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

const scheduleLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  on_demand: "On Demand",
};

const reportTypeIcon: Record<string, string> = {
  plan_report: "P",
  board_report: "B",
  provider_summary: "S",
  provider_scorecard: "S",
  monthly: "M",
  quarterly: "Q",
  regulatory: "R",
  custom: "C",
};

const reportTypeColor: Record<string, { bg: string; border: string; text: string }> = {
  plan_report: { bg: tokens.blueSoft, border: "#bfdbfe", text: "#1e40af" },
  board_report: { bg: tokens.accentSoft, border: "#bbf7d0", text: tokens.accentText },
  provider_summary: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
  provider_scorecard: { bg: tokens.amberSoft, border: "#fde68a", text: "#92400e" },
  monthly: { bg: tokens.blueSoft, border: "#bfdbfe", text: "#1e40af" },
  quarterly: { bg: tokens.blueSoft, border: "#bfdbfe", text: "#1e40af" },
  regulatory: { bg: tokens.redSoft, border: "#fecaca", text: "#991b1b" },
  custom: { bg: tokens.surfaceAlt, border: tokens.border, text: tokens.textSecondary },
};

export function ReportsPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/reports/templates"),
      api.get("/api/reports"),
    ])
      .then(([tRes, rRes]) => {
        setTemplates(tRes.data);
        setReports(rRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = (templateId: number) => {
    setGenerating(templateId);
    const template = templates.find((t) => t.id === templateId);
    const period = template?.schedule === "quarterly" ? "Q1 2026" : "March 2026";

    api
      .post("/api/reports/generate", { template_id: templateId, period })
      .then((res) => {
        setReports((prev) => [res.data, ...prev]);
        setSelectedReport(res.data);
      })
      .catch(console.error)
      .finally(() => setGenerating(null));
  };

  if (selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            fontWeight: 700,
            color: tokens.text,
            marginBottom: 4,
          }}
        >
          Reports
        </h1>
        <p style={{ fontSize: 13, color: tokens.textSecondary }}>
          Auto-generate reports with AI narratives for health plans, boards, and regulatory submissions.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Templates" value={String(templates.length)} />
        <MetricCard label="Reports Generated" value={String(reports.length)} />
        <MetricCard
          label="Ready"
          value={String(reports.filter((r) => r.status === "ready" || r.status === "completed").length)}
          trendDirection="up"
        />
        <MetricCard
          label="Latest"
          value={reports.length > 0 ? new Date(reports[0].created_at).toLocaleDateString() : "--"}
        />
      </div>

      {/* Templates Section */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            fontWeight: 600,
            color: tokens.text,
            marginBottom: 16,
          }}
        >
          Report Templates
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {templates.map((template) => {
            const colors = reportTypeColor[template.report_type] || reportTypeColor.custom;
            return (
              <div
                key={template.id}
                className="rounded-[10px] border bg-white p-5"
                style={{ borderColor: tokens.border }}
              >
                <div className="flex items-start gap-3 mb-3">
                  {/* Type icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                  >
                    {reportTypeIcon[template.report_type] || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: tokens.text }}>
                      {template.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: tokens.textMuted }}>
                      {scheduleLabel[template.schedule || ""] || "On Demand"} &middot; {template.sections.length} sections
                    </div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed mb-3" style={{ color: tokens.textSecondary }}>
                  {template.description}
                </p>

                {/* Section tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(template.sections ?? []).map((s, idx) => (
                    <span
                      key={s.key || s.type || idx}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        background: tokens.surfaceAlt,
                        color: tokens.textMuted,
                        border: `1px solid ${tokens.borderSoft}`,
                      }}
                    >
                      {s.title}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleGenerate(template.id)}
                  disabled={generating === template.id}
                  className="text-xs px-4 py-2 rounded-lg font-medium text-white transition-opacity"
                  style={{
                    background: tokens.accent,
                    opacity: generating === template.id ? 0.6 : 1,
                    cursor: generating === template.id ? "wait" : "pointer",
                  }}
                >
                  {generating === template.id ? "Generating..." : "Generate Report"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generated Reports */}
      <div>
        <h2
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            fontWeight: 600,
            color: tokens.text,
            marginBottom: 16,
          }}
        >
          Generated Reports
        </h2>

        {loading && reports.length === 0 ? (
          <div className="text-sm" style={{ color: tokens.textMuted }}>Loading...</div>
        ) : reports.length === 0 ? (
          <div
            className="rounded-[10px] border p-8 text-center"
            style={{ borderColor: tokens.border, background: tokens.surface }}
          >
            <div className="text-sm" style={{ color: tokens.textMuted }}>
              No reports generated yet. Use a template above to create your first report.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((report) => {
              const template = templates.find((t) => t.id === report.template_id);
              const colors = reportTypeColor[template?.report_type || "custom"] || reportTypeColor.custom;
              return (
                <div
                  key={report.id}
                  className="rounded-[10px] border bg-white flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
                  style={{ borderColor: tokens.border }}
                  onClick={() => setSelectedReport(report)}
                >
                  {/* Status dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      background:
                        (report.status === "ready" || report.status === "completed") ? tokens.accent :
                        report.status === "generating" ? tokens.amber :
                        tokens.red,
                    }}
                  />

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: tokens.text }}>
                      {report.title}
                    </div>
                    <div className="text-xs" style={{ color: tokens.textMuted }}>
                      {report.period} &middot; {new Date(report.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Type badge */}
                  <span
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                  >
                    {template?.report_type.replace("_", " ") || "report"}
                  </span>

                  {/* Status badge */}
                  <span
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      background: (report.status === "ready" || report.status === "completed") ? tokens.accentSoft : report.status === "generating" ? tokens.amberSoft : tokens.redSoft,
                      color: (report.status === "ready" || report.status === "completed") ? tokens.accentText : report.status === "generating" ? "#92400e" : "#991b1b",
                    }}
                  >
                    {report.status}
                  </span>

                  {/* Arrow */}
                  <svg className="w-4 h-4 shrink-0" style={{ color: tokens.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
