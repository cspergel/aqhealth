import { useState, useCallback } from "react";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";
import { DataRequirementsChecklist } from "./DataRequirementsChecklist";
import { FileUpload } from "../ingestion/FileUpload";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PayerConfig {
  id: string;
  name: string;
  description: string;
  platform: string;
  available: boolean;
  logoColor: string;
}

interface ApiCredentials {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

/* ------------------------------------------------------------------ */
/* Payer definitions                                                    */
/* ------------------------------------------------------------------ */

const PAYERS: PayerConfig[] = [
  {
    id: "humana",
    name: "Humana",
    description: "Humana Data Exchange — Free, 25 FHIR APIs",
    platform: "Humana Data Exchange",
    available: true,
    logoColor: "#4CAF50",
  },
  {
    id: "optimum",
    name: "Optimum Healthcare",
    description: "AaNeel Connect integration",
    platform: "AaNeel Connect",
    available: true,
    logoColor: "#1565C0",
  },
  {
    id: "freedom",
    name: "Freedom Health",
    description: "AaNeel Connect integration",
    platform: "AaNeel Connect",
    available: true,
    logoColor: "#00897B",
  },
  {
    id: "uhc",
    name: "UHC",
    description: "United Healthcare — integration coming soon",
    platform: "UHC Provider Portal",
    available: false,
    logoColor: "#7B1FA2",
  },
  {
    id: "aetna",
    name: "Aetna",
    description: "Aetna integration — coming soon",
    platform: "Aetna Portal",
    available: false,
    logoColor: "#C62828",
  },
];

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function PayerCard({
  payer,
  connected,
  onConnect,
}: {
  payer: PayerConfig;
  connected: boolean;
  onConnect: (payerId: string) => void;
}) {
  return (
    <div
      className="rounded-[10px] p-4"
      style={{
        border: `1px solid ${connected ? "#bbf7d0" : tokens.border}`,
        background: connected ? tokens.accentSoft : tokens.surface,
        opacity: payer.available ? 1 : 0.6,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Logo placeholder */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: payer.logoColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>
            {payer.name.charAt(0)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-sm font-semibold"
              style={{ color: tokens.text, fontFamily: fonts.heading }}
            >
              {payer.name}
            </span>
            {connected && <Tag variant="green">Connected</Tag>}
            {!payer.available && <Tag variant="default">Coming Soon</Tag>}
          </div>
          <div className="text-xs" style={{ color: tokens.textSecondary }}>
            {payer.description}
          </div>
          <div
            className="text-[10px] mt-1"
            style={{ color: tokens.textMuted, fontFamily: fonts.code }}
          >
            {payer.platform}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          {connected ? (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: tokens.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7L6 10L11 4"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : (
            <button
              onClick={() => onConnect(payer.id)}
              disabled={!payer.available}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
              style={{
                background: payer.available ? tokens.accent : tokens.surfaceAlt,
                color: payer.available ? "#fff" : tokens.textMuted,
                border: payer.available ? "none" : `1px solid ${tokens.border}`,
                cursor: payer.available ? "pointer" : "default",
              }}
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectForm({
  payer,
  onSave,
  onCancel,
}: {
  payer: PayerConfig;
  onSave: (creds: ApiCredentials) => void;
  onCancel: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Simulate saving to tenant config
    await new Promise((r) => setTimeout(r, 800));
    onSave({ apiKey, clientId, clientSecret });
    setSaving(false);
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    borderRadius: 8,
    border: `1px solid ${tokens.border}`,
    color: tokens.text,
    background: tokens.surface,
    outline: "none",
    fontFamily: fonts.code,
  } as const;

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: tokens.textMuted,
    marginBottom: 4,
  };

  return (
    <div
      className="rounded-[10px] p-5"
      style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-sm font-semibold"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Connect to {payer.name}
        </span>
        <Tag variant="blue">{payer.platform}</Tag>
      </div>

      <div className="space-y-3">
        <div>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Enter client ID..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Enter client secret..."
            style={inputStyle}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving || !apiKey || !clientId || !clientSecret}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: tokens.accent }}
        >
          {saving ? "Connecting..." : "Save and Connect"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            color: tokens.textSecondary,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

interface WizardStep2DataSourcesProps {
  /** Called when data is loaded (API connected or file uploaded) */
  onDataLoaded?: (jobId?: string) => void;
}

export function WizardStep2DataSources({ onDataLoaded }: WizardStep2DataSourcesProps) {
  const [activeTab, setActiveTab] = useState<"api" | "upload">("api");
  const [connectedPayers, setConnectedPayers] = useState<Set<string>>(new Set());
  const [connectingPayer, setConnectingPayer] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<
    { type: string; jobId: string }[]
  >([]);

  const handleConnect = useCallback((payerId: string) => {
    setConnectingPayer(payerId);
  }, []);

  const handleSaveCredentials = useCallback(
    (_creds: ApiCredentials) => {
      if (connectingPayer) {
        setConnectedPayers((prev) => new Set([...prev, connectingPayer]));
        setConnectingPayer(null);
        onDataLoaded?.();
      }
    },
    [connectingPayer, onDataLoaded],
  );

  const handleCancelConnect = useCallback(() => {
    setConnectingPayer(null);
  }, []);

  const handleUploadComplete = useCallback(
    (result: { job_id: string; detected_type: string }) => {
      setUploadedFiles((prev) => [
        ...prev,
        { type: result.detected_type, jobId: result.job_id },
      ]);
      onDataLoaded?.(result.job_id);
    },
    [onDataLoaded],
  );

  const connectingPayerConfig = PAYERS.find((p) => p.id === connectingPayer);
  const hasData = connectedPayers.size > 0 || uploadedFiles.length > 0;

  return (
    <div>
      {/* Tab selector */}
      <div
        className="flex gap-1 mb-5 p-1 rounded-lg"
        style={{ background: tokens.surfaceAlt, display: "inline-flex" }}
      >
        {(["api", "upload"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: activeTab === tab ? tokens.surface : "transparent",
              color: activeTab === tab ? tokens.text : tokens.textMuted,
              border: activeTab === tab ? `1px solid ${tokens.border}` : "1px solid transparent",
              cursor: "pointer",
              boxShadow: activeTab === tab ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {tab === "api" ? "Connect Health Plan API" : "Upload Files"}
          </button>
        ))}
      </div>

      {/* API connection section */}
      {activeTab === "api" && (
        <div>
          {/* Connect form overlay */}
          {connectingPayerConfig && (
            <div className="mb-4">
              <ConnectForm
                payer={connectingPayerConfig}
                onSave={handleSaveCredentials}
                onCancel={handleCancelConnect}
              />
            </div>
          )}

          {/* Payer cards grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {PAYERS.map((payer) => (
              <PayerCard
                key={payer.id}
                payer={payer}
                connected={connectedPayers.has(payer.id)}
                onConnect={handleConnect}
              />
            ))}
          </div>

          {/* Manual upload prompt */}
          <div
            className="mt-6 text-center py-3"
            style={{ borderTop: `1px solid ${tokens.borderSoft}` }}
          >
            <button
              onClick={() => setActiveTab("upload")}
              className="text-xs font-medium"
              style={{
                color: tokens.blue,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Or upload files manually
            </button>
          </div>
        </div>
      )}

      {/* Upload files section */}
      {activeTab === "upload" && (
        <div>
          <DataRequirementsChecklist />

          <div className="mt-4">
            <FileUpload onUploadComplete={handleUploadComplete} />
          </div>

          {/* Uploaded files list */}
          {uploadedFiles.length > 0 && (
            <div
              className="mt-4 rounded-[10px] p-4"
              style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
            >
              <div
                className="text-xs font-semibold mb-2 uppercase tracking-wide"
                style={{ color: tokens.textMuted }}
              >
                Uploaded Files
              </div>
              <div className="space-y-1.5">
                {uploadedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: tokens.text }}
                  >
                    <Tag variant="green">Uploaded</Tag>
                    <span style={{ fontFamily: fonts.code }}>{f.type}</span>
                    <span style={{ color: tokens.textMuted }}>
                      Job: {f.jobId.slice(0, 8)}...
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data status summary */}
      <div
        className="mt-6 rounded-[10px] p-4"
        style={{
          background: hasData ? tokens.accentSoft : tokens.surfaceAlt,
          border: `1px solid ${hasData ? "#bbf7d0" : tokens.border}`,
        }}
      >
        <div
          className="text-xs font-semibold mb-1"
          style={{
            fontFamily: fonts.heading,
            color: hasData ? tokens.accentText : tokens.textMuted,
          }}
        >
          Data Status
        </div>
        {hasData ? (
          <div className="flex flex-wrap gap-3">
            {connectedPayers.size > 0 && (
              <div className="text-xs" style={{ color: tokens.accentText }}>
                {connectedPayers.size} health plan{connectedPayers.size !== 1 ? "s" : ""} connected
              </div>
            )}
            {uploadedFiles.length > 0 && (
              <div className="text-xs" style={{ color: tokens.accentText }}>
                {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} uploaded
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs" style={{ color: tokens.textMuted }}>
            No data loaded yet. Connect a health plan API or upload files to continue.
          </div>
        )}
      </div>
    </div>
  );
}
