import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

export interface ADTSourceData {
  id?: number;
  name: string;
  source_type: string;
  config: Record<string, string>;
  is_active: boolean;
  last_sync: string | null;
  events_received: number;
}

interface SourceConfigFormProps {
  initialData?: ADTSourceData | null;
  onSave: (data: ADTSourceData) => void;
  onCancel: () => void;
  onTestConnection?: (data: ADTSourceData) => void;
}

const sourceTypes = [
  { value: "webhook", label: "Bamboo Health Webhook" },
  { value: "rest_api", label: "Availity API" },
  { value: "sftp", label: "Health Plan SFTP" },
  { value: "hl7_mllp", label: "Direct HL7 MLLP" },
  { value: "manual", label: "Manual CSV Upload" },
];

// Config fields per source type
const configFields: Record<string, { key: string; label: string; type: string; placeholder: string }[]> = {
  webhook: [
    { key: "webhook_url", label: "Webhook URL (auto-generated)", type: "text", placeholder: "https://api.aqsoft.health/adt/webhook" },
    { key: "webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Enter webhook secret" },
  ],
  rest_api: [
    { key: "endpoint_url", label: "API Endpoint URL", type: "text", placeholder: "https://api.availity.com/v1/adt" },
    { key: "api_key", label: "API Key", type: "password", placeholder: "Enter API key" },
    { key: "oauth_client_id", label: "OAuth Client ID", type: "text", placeholder: "Client ID" },
    { key: "oauth_client_secret", label: "OAuth Client Secret", type: "password", placeholder: "Client Secret" },
  ],
  sftp: [
    { key: "host", label: "SFTP Host", type: "text", placeholder: "sftp.humana.com" },
    { key: "port", label: "Port", type: "text", placeholder: "22" },
    { key: "username", label: "Username", type: "text", placeholder: "aqsoft_user" },
    { key: "password", label: "Password / Key", type: "password", placeholder: "Enter password or SSH key" },
    { key: "directory", label: "Directory Path", type: "text", placeholder: "/outbound/adt/" },
    { key: "schedule", label: "Sync Schedule", type: "text", placeholder: "*/15 * * * * (every 15 min)" },
  ],
  hl7_mllp: [
    { key: "host", label: "MLLP Host", type: "text", placeholder: "0.0.0.0" },
    { key: "port", label: "MLLP Port", type: "text", placeholder: "2575" },
  ],
  manual: [],
};

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${tokens.border}`,
  background: tokens.surface,
  color: tokens.text,
  fontFamily: fonts.body,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: tokens.textSecondary,
  marginBottom: 4,
  display: "block",
};

export function SourceConfigForm({ initialData, onSave, onCancel, onTestConnection }: SourceConfigFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [sourceType, setSourceType] = useState(initialData?.source_type || "webhook");
  const [config, setConfig] = useState<Record<string, string>>(initialData?.config || {});
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [testing, setTesting] = useState(false);

  const fields = configFields[sourceType] || [];

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave({
      id: initialData?.id,
      name,
      source_type: sourceType,
      config,
      is_active: isActive,
      last_sync: initialData?.last_sync || null,
      events_received: initialData?.events_received || 0,
    });
  };

  const handleTest = () => {
    if (!onTestConnection) return;
    setTesting(true);
    onTestConnection({
      name,
      source_type: sourceType,
      config,
      is_active: isActive,
      last_sync: null,
      events_received: 0,
    });
    setTimeout(() => setTesting(false), 2000);
  };

  return (
    <div
      className="rounded-[10px] border bg-white p-6"
      style={{ borderColor: tokens.border, maxWidth: 560 }}
    >
      <h3
        className="text-base font-semibold mb-5"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        {initialData?.id ? "Edit ADT Source" : "Add ADT Source"}
      </h3>

      {/* Source Name */}
      <div className="mb-4">
        <label style={labelStyle}>Source Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Bamboo Health Production"
          style={inputStyle}
        />
      </div>

      {/* Source Type */}
      <div className="mb-4">
        <label style={labelStyle}>Source Type</label>
        <select
          value={sourceType}
          onChange={(e) => {
            setSourceType(e.target.value);
            setConfig({});
          }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {sourceTypes.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
      </div>

      {/* Dynamic config fields */}
      {fields.map((field) => (
        <div key={field.key} className="mb-4">
          <label style={labelStyle}>{field.label}</label>
          <input
            type={field.type}
            value={config[field.key] || ""}
            onChange={(e) => handleConfigChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        </div>
      ))}

      {/* Active toggle */}
      <div className="flex items-center gap-2 mb-5">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-emerald-600"
        />
        <span className="text-sm" style={{ color: tokens.textSecondary }}>
          Active
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors"
          style={{ background: tokens.accent }}
          onClick={handleSave}
        >
          {initialData?.id ? "Update Source" : "Create Source"}
        </button>

        {sourceType !== "manual" && (
          <button
            className="text-sm px-4 py-2 rounded-lg font-medium border transition-colors hover:bg-stone-50"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        )}

        <button
          className="text-sm px-4 py-2 rounded-lg font-medium transition-colors hover:bg-stone-50"
          style={{ color: tokens.textMuted }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
