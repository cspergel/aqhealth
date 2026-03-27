import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface DataInterface {
  id: number;
  name: string;
  interface_type: string;
  direction: string;
  config: Record<string, any>;
  is_active: boolean;
  schedule: string | null;
  last_received: string | null;
  last_error: string | null;
  records_processed: number;
  error_count: number;
}

interface InterfaceLog {
  id: number;
  event_type: string;
  message: string;
  records_count: number;
  created_at: string;
}

interface FormatInfo {
  format: string;
  description: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  rest_api: "REST API",
  fhir: "FHIR R4",
  hl7v2: "HL7v2",
  x12_837: "X12 837",
  x12_835: "X12 835",
  x12_834: "X12 834",
  cda: "CDA/CCDA",
  sftp: "SFTP",
  webhook: "Webhook",
  database: "Database",
  csv: "CSV/Excel",
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  fhir: { bg: "#dbeafe", text: "#1d4ed8" },
  hl7v2: { bg: "#fae8ff", text: "#9333ea" },
  x12_837: { bg: "#fef3c7", text: "#b45309" },
  x12_835: { bg: "#fef3c7", text: "#b45309" },
  x12_834: { bg: "#fef3c7", text: "#b45309" },
  cda: { bg: "#dcfce7", text: "#15803d" },
  webhook: { bg: "#f0f9ff", text: "#0369a1" },
  rest_api: { bg: "#f1f5f9", text: "#475569" },
  sftp: { bg: "#fce7f3", text: "#be185d" },
  database: { bg: "#f5f3ff", text: "#6d28d9" },
};

const DIRECTION_LABELS: Record<string, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  bidirectional: "Bidirectional",
};

const TYPE_OPTIONS = [
  { value: "rest_api", label: "REST API" },
  { value: "fhir", label: "FHIR R4" },
  { value: "hl7v2", label: "HL7v2 (ADT/ORU/SIU)" },
  { value: "x12_837", label: "X12 837 (Claims)" },
  { value: "x12_835", label: "X12 835 (Remittance)" },
  { value: "x12_834", label: "X12 834 (Enrollment)" },
  { value: "cda", label: "CDA/CCDA" },
  { value: "sftp", label: "SFTP File Pickup" },
  { value: "webhook", label: "Webhook" },
  { value: "database", label: "Database Connection" },
];

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

function getStatus(iface: DataInterface): { color: string; label: string; pulse: boolean } {
  if (!iface.is_active) return { color: tokens.textMuted, label: "Inactive", pulse: false };
  if (iface.error_count > 3 || (iface.last_error && !iface.last_received)) {
    return { color: tokens.red, label: "Error", pulse: false };
  }
  if (iface.last_received) {
    const hoursSince = (Date.now() - new Date(iface.last_received).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return { color: tokens.accent, label: "Active", pulse: true };
    if (hoursSince < 72) return { color: tokens.amber, label: "Stale", pulse: false };
    return { color: tokens.red, label: "Stale", pulse: false };
  }
  return { color: tokens.amber, label: "Pending", pulse: false };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/* Main page component                                                 */
/* ------------------------------------------------------------------ */

export function InterfacesPage() {
  const [interfaces, setInterfaces] = useState<DataInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusSummary, setStatusSummary] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedInterface, setSelectedInterface] = useState<DataInterface | null>(null);
  const [logs, setLogs] = useState<InterfaceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ id: number; result: any } | null>(null);

  const loadInterfaces = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/interfaces"),
      api.get("/api/interfaces/status"),
    ])
      .then(([ifRes, statusRes]) => {
        setInterfaces(Array.isArray(ifRes.data) ? ifRes.data : []);
        setStatusSummary(statusRes.data);
      })
      .catch((err) => console.error("Failed to load interfaces:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadInterfaces(); }, [loadInterfaces]);

  const loadLogs = (ifaceId: number) => {
    setLogsLoading(true);
    api.get(`/api/interfaces/${ifaceId}/logs`)
      .then((res) => setLogs(res.data))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  };

  const handleSelectInterface = (iface: DataInterface) => {
    setSelectedInterface(iface);
    setTestResult(null);
    loadLogs(iface.id);
  };

  const handleTestConnection = (ifaceId: number) => {
    api.post(`/api/interfaces/${ifaceId}/test`)
      .then((res) => setTestResult({ id: ifaceId, result: res.data }))
      .catch((err) => setTestResult({ id: ifaceId, result: { success: false, error: err.message } }));
  };

  const handleCloseDetail = () => {
    setSelectedInterface(null);
    setLogs([]);
    setTestResult(null);
  };

  // Summary stats
  const activeCount = interfaces.filter((i) => {
    const s = getStatus(i);
    return s.label === "Active";
  }).length;
  const staleCount = interfaces.filter((i) => getStatus(i).label === "Stale").length;
  const errorCount = interfaces.filter((i) => getStatus(i).label === "Error").length;
  const totalRecords = interfaces.reduce((sum, i) => sum + i.records_processed, 0);

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Integrations
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            Universal data interface layer -- accept data from any healthcare system in any standard format
          </p>
        </div>
        {!showForm && !selectedInterface && (
          <button
            className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ background: tokens.accent }}
            onClick={() => setShowForm(true)}
          >
            + Add Integration
          </button>
        )}
      </div>

      {/* Summary metrics bar */}
      {!selectedInterface && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          <MetricBox label="Active Feeds" value={activeCount} color={tokens.accent} />
          <MetricBox label="Stale" value={staleCount} color={tokens.amber} />
          <MetricBox label="Errors" value={errorCount} color={tokens.red} />
          <MetricBox label="Records Processed" value={totalRecords.toLocaleString()} color={tokens.blue} />
        </div>
      )}

      {/* Add Integration Form */}
      {showForm && (
        <AddInterfaceForm
          onSave={() => {
            setShowForm(false);
            loadInterfaces();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Detail view */}
      {selectedInterface && (
        <InterfaceDetail
          iface={selectedInterface}
          logs={logs}
          logsLoading={logsLoading}
          testResult={testResult}
          onTest={handleTestConnection}
          onClose={handleCloseDetail}
        />
      )}

      {/* Interface cards grid */}
      {!selectedInterface && !showForm && (
        <>
          {loading ? (
            <div className="text-sm py-12 text-center" style={{ color: tokens.textMuted }}>
              Loading interfaces...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {interfaces.map((iface) => (
                <InterfaceCard
                  key={iface.id}
                  iface={iface}
                  onClick={() => handleSelectInterface(iface)}
                />
              ))}
            </div>
          )}

          {/* Supported formats section */}
          <div className="mt-8">
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: tokens.textMuted }}
            >
              Supported Formats
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(statusSummary?.formats_supported || []).map((fmt: FormatInfo) => (
                <div
                  key={fmt.format}
                  className="rounded-lg border p-3"
                  style={{ borderColor: tokens.borderSoft, background: tokens.surface }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: tokens.accent }}
                    />
                    <span className="text-xs font-semibold" style={{ color: tokens.text }}>
                      {fmt.format}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight" style={{ color: tokens.textMuted }}>
                    {fmt.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metric box                                                          */
/* ------------------------------------------------------------------ */

function MetricBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-[10px] border bg-white p-4"
      style={{ borderColor: tokens.border }}
    >
      <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color, fontFamily: fonts.code }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interface card                                                      */
/* ------------------------------------------------------------------ */

function InterfaceCard({ iface, onClick }: { iface: DataInterface; onClick: () => void }) {
  const status = getStatus(iface);
  const typeColor = TYPE_COLORS[iface.interface_type] || { bg: "#f1f5f9", text: "#475569" };

  return (
    <div
      className="rounded-[10px] border bg-white p-5 transition-all hover:shadow-sm cursor-pointer"
      style={{ borderColor: tokens.border }}
      onClick={onClick}
    >
      {/* Top row: name + status */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-3">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: tokens.text, fontFamily: fonts.heading }}
          >
            {iface.name}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: typeColor.bg, color: typeColor.text }}
            >
              {TYPE_LABELS[iface.interface_type] || iface.interface_type}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}
            >
              {DIRECTION_LABELS[iface.direction] || iface.direction}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: status.color,
              boxShadow: status.pulse ? `0 0 0 3px ${status.color}22` : "none",
            }}
          />
          <span className="text-xs font-medium" style={{ color: status.color }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-5 mt-3 pt-3" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
        <div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
            Records
          </div>
          <div
            className="text-sm font-semibold"
            style={{ fontFamily: fonts.code, color: tokens.text }}
          >
            {iface.records_processed.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
            Last Received
          </div>
          <div className="text-xs" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
            {timeAgo(iface.last_received)}
          </div>
        </div>
        {iface.error_count > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
              Errors
            </div>
            <div
              className="text-sm font-semibold"
              style={{ fontFamily: fonts.code, color: tokens.red }}
            >
              {iface.error_count}
            </div>
          </div>
        )}
        <div className="ml-auto">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
            Schedule
          </div>
          <div className="text-xs" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
            {iface.schedule === "realtime" ? "Real-time" : iface.schedule || "Manual"}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {iface.last_error && (
        <div
          className="mt-3 text-[11px] px-3 py-2 rounded-lg"
          style={{ background: tokens.redSoft, color: tokens.red }}
        >
          {iface.last_error}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interface detail panel                                              */
/* ------------------------------------------------------------------ */

function InterfaceDetail({
  iface,
  logs,
  logsLoading,
  testResult,
  onTest,
  onClose,
}: {
  iface: DataInterface;
  logs: InterfaceLog[];
  logsLoading: boolean;
  testResult: { id: number; result: any } | null;
  onTest: (id: number) => void;
  onClose: () => void;
}) {
  const status = getStatus(iface);
  const typeColor = TYPE_COLORS[iface.interface_type] || { bg: "#f1f5f9", text: "#475569" };

  return (
    <div>
      {/* Back button */}
      <button
        className="text-xs mb-4 px-3 py-1.5 rounded-lg transition-colors"
        style={{ color: tokens.textSecondary, background: tokens.surfaceAlt }}
        onClick={onClose}
      >
        &larr; Back to all integrations
      </button>

      {/* Header card */}
      <div
        className="rounded-[10px] border bg-white p-6 mb-4"
        style={{ borderColor: tokens.border }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2
                className="text-lg font-bold"
                style={{ fontFamily: fonts.heading, color: tokens.text }}
              >
                {iface.name}
              </h2>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: typeColor.bg, color: typeColor.text }}
              >
                {TYPE_LABELS[iface.interface_type] || iface.interface_type}
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: status.color }} />
                <span className="text-xs font-medium" style={{ color: status.color }}>{status.label}</span>
              </div>
            </div>
            <p className="text-xs" style={{ color: tokens.textMuted }}>
              {DIRECTION_LABELS[iface.direction]} &middot; Schedule: {iface.schedule === "realtime" ? "Real-time" : iface.schedule || "Manual"}
            </p>
          </div>
          <button
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-colors"
            style={{ background: tokens.blue }}
            onClick={() => onTest(iface.id)}
          >
            Test Connection
          </button>
        </div>

        {/* Test result */}
        {testResult && testResult.id === iface.id && (
          <div
            className="mt-4 text-xs px-4 py-3 rounded-lg"
            style={{
              background: testResult.result.success ? tokens.accentSoft : tokens.redSoft,
              color: testResult.result.success ? tokens.accentText : tokens.red,
            }}
          >
            {testResult.result.success
              ? `Connection verified successfully. Latency: ${testResult.result.latency_ms}ms`
              : `Connection failed: ${testResult.result.error || "Unknown error"}`
            }
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-4 mt-5 pt-4" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tokens.textMuted }}>Records Processed</div>
            <div className="text-lg font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>
              {iface.records_processed.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tokens.textMuted }}>Error Count</div>
            <div className="text-lg font-bold" style={{ fontFamily: fonts.code, color: iface.error_count > 0 ? tokens.red : tokens.text }}>
              {iface.error_count}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tokens.textMuted }}>Last Received</div>
            <div className="text-sm font-medium" style={{ fontFamily: fonts.code, color: tokens.text }}>
              {iface.last_received ? new Date(iface.last_received).toLocaleString() : "Never"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tokens.textMuted }}>Direction</div>
            <div className="text-sm font-medium" style={{ color: tokens.text }}>
              {DIRECTION_LABELS[iface.direction] || iface.direction}
            </div>
          </div>
        </div>

        {/* Error message */}
        {iface.last_error && (
          <div
            className="mt-4 text-xs px-4 py-3 rounded-lg"
            style={{ background: tokens.redSoft, color: tokens.red }}
          >
            <span className="font-semibold">Last Error: </span>{iface.last_error}
          </div>
        )}

        {/* Connection config (redacted) */}
        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
          <div className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: tokens.textMuted }}>
            Connection Configuration
          </div>
          <div
            className="rounded-lg px-4 py-3 text-xs"
            style={{ background: tokens.surfaceAlt, fontFamily: fonts.code, color: tokens.textSecondary }}
          >
            {Object.entries(iface.config).map(([key, val]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span style={{ color: tokens.textMuted, minWidth: 120 }}>{key}:</span>
                <span>{typeof val === "string" && (key.includes("secret") || key.includes("key") || key.includes("password"))
                  ? "***"
                  : typeof val === "object" ? JSON.stringify(val) : String(val)
                }</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div
        className="rounded-[10px] border bg-white p-5"
        style={{ borderColor: tokens.border }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Activity Log
        </h3>
        {logsLoading ? (
          <div className="text-xs py-4 text-center" style={{ color: tokens.textMuted }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-xs py-4 text-center" style={{ color: tokens.textMuted }}>No log entries yet.</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log entry                                                           */
/* ------------------------------------------------------------------ */

const LOG_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  receive: { bg: tokens.accentSoft, text: tokens.accentText },
  parse: { bg: tokens.blueSoft, text: tokens.blue },
  normalize: { bg: "#f5f3ff", text: "#6d28d9" },
  error: { bg: tokens.redSoft, text: tokens.red },
  test: { bg: tokens.amberSoft, text: tokens.amber },
};

function LogEntry({ log }: { log: InterfaceLog }) {
  const typeStyle = LOG_TYPE_COLORS[log.event_type] || { bg: tokens.surfaceAlt, text: tokens.textSecondary };
  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
      style={{ background: log.event_type === "error" ? tokens.redSoft + "44" : "transparent" }}
    >
      <span
        className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0 mt-0.5"
        style={{ background: typeStyle.bg, color: typeStyle.text }}
      >
        {log.event_type.toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs" style={{ color: tokens.text }}>{log.message}</div>
        {log.records_count > 0 && (
          <span className="text-[10px]" style={{ color: tokens.textMuted }}>
            {log.records_count} record{log.records_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <span
        className="text-[10px] flex-shrink-0"
        style={{ color: tokens.textMuted, fontFamily: fonts.code }}
      >
        {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add Integration form                                                */
/* ------------------------------------------------------------------ */

function AddInterfaceForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [interfaceType, setInterfaceType] = useState("hl7v2");
  const [direction, setDirection] = useState("inbound");
  const [schedule, setSchedule] = useState("");
  const [saving, setSaving] = useState(false);

  // Type-specific config fields
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    setSaving(true);

    const config: Record<string, any> = {};
    if (["hl7v2", "sftp", "database"].includes(interfaceType)) {
      if (host) config.host = host;
      if (port) config.port = parseInt(port);
    }
    if (["rest_api", "fhir"].includes(interfaceType)) {
      if (url) config.url = url;
    }
    if (interfaceType === "sftp" && directory) config.directory = directory;
    if (interfaceType === "hl7v2") config.protocol = "mllp";

    api.post("/api/interfaces", {
      name: name.trim(),
      interface_type: interfaceType,
      direction,
      config,
      schedule: schedule || null,
    })
      .then(() => onSave())
      .catch((err) => console.error("Failed to create interface:", err))
      .finally(() => setSaving(false));
  };

  const needsHost = ["hl7v2", "sftp", "database"].includes(interfaceType);
  const needsUrl = ["rest_api", "fhir"].includes(interfaceType);
  const needsDirectory = interfaceType === "sftp";

  return (
    <div
      className="rounded-[10px] border bg-white p-6 mb-6"
      style={{ borderColor: tokens.border }}
    >
      <h3
        className="text-sm font-semibold mb-4"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        Add New Integration
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Name */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
            Name
          </label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: tokens.border, color: tokens.text }}
            placeholder='e.g. "Humana Claims Feed"'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
            Interface Type
          </label>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: tokens.border, color: tokens.text }}
            value={interfaceType}
            onChange={(e) => setInterfaceType(e.target.value)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
            Direction
          </label>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: tokens.border, color: tokens.text }}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="bidirectional">Bidirectional</option>
          </select>
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
            Schedule
          </label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: tokens.border, color: tokens.text }}
            placeholder='e.g. "realtime" or cron: "0 2 * * *"'
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          />
        </div>

        {/* Host (conditional) */}
        {needsHost && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
                Host
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: tokens.border, color: tokens.text }}
                placeholder="e.g. sftp.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
                Port
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: tokens.border, color: tokens.text }}
                placeholder={interfaceType === "sftp" ? "22" : "2575"}
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </>
        )}

        {/* URL (conditional) */}
        {needsUrl && (
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
              Endpoint URL
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: tokens.border, color: tokens.text }}
              placeholder="https://fhir.example.com/R4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        {/* Directory (conditional) */}
        {needsDirectory && (
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: tokens.textMuted }}>
              Remote Directory
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: tokens.border, color: tokens.text }}
              placeholder="/outbound/837/"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-3" style={{ borderTop: `1px solid ${tokens.borderSoft}` }}>
        <button
          className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: tokens.accent }}
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : "Create Integration"}
        </button>
        <button
          className="text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          style={{ color: tokens.textSecondary }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
