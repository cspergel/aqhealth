import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { Tag } from "../components/ui/Tag";
import { SourceConfigForm, type ADTSourceData } from "../components/adt/SourceConfigForm";

const typeLabels: Record<string, string> = {
  webhook: "Webhook",
  rest_api: "REST API",
  sftp: "SFTP",
  hl7_mllp: "HL7 MLLP",
  manual: "Manual CSV",
};

function statusIndicator(source: ADTSourceData): { color: string; label: string } {
  if (!source.is_active) return { color: tokens.textMuted, label: "Inactive" };
  // Active and recently synced = green
  if (source.last_sync) {
    const hoursSince = (Date.now() - new Date(source.last_sync).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return { color: tokens.accent, label: "Active" };
    return { color: tokens.amber, label: "Stale" };
  }
  // Active but never synced
  return { color: tokens.amber, label: "Pending" };
}

export function ADTConfigPage() {
  const [sources, setSources] = useState<ADTSourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<ADTSourceData | null>(null);

  const loadSources = () => {
    setLoading(true);
    api
      .get("/api/adt/sources")
      .then((res) => setSources(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Failed to load sources:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleSave = (data: ADTSourceData) => {
    const method = data.id ? api.patch : api.post;
    const url = data.id ? `/api/adt/sources/${data.id}` : "/api/adt/sources";
    method(url, data)
      .then(() => {
        loadSources();
        setShowForm(false);
        setEditingSource(null);
      })
      .catch((err) => console.error("Failed to save source:", err));
  };

  const handleEdit = (source: ADTSourceData) => {
    setEditingSource(source);
    setShowForm(true);
  };

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            ADT Sources
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            Configure real-time ADT data feeds and integrations
          </p>
        </div>
        {!showForm && (
          <button
            className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ background: tokens.accent }}
            onClick={() => {
              setEditingSource(null);
              setShowForm(true);
            }}
          >
            + Add Source
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6">
          <SourceConfigForm
            initialData={editingSource}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingSource(null);
            }}
            onTestConnection={() => {
              // Mock test — in prod would call backend validation
            }}
          />
        </div>
      )}

      {/* Source cards */}
      {loading ? (
        <div className="text-sm py-12 text-center" style={{ color: tokens.textMuted }}>
          Loading sources...
        </div>
      ) : sources.length === 0 && !showForm ? (
        <div
          className="rounded-[10px] border bg-white p-8 text-center"
          style={{ borderColor: tokens.border }}
        >
          <div className="text-sm mb-2" style={{ color: tokens.textMuted }}>
            No ADT sources configured yet.
          </div>
          <button
            className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ background: tokens.accent }}
            onClick={() => setShowForm(true)}
          >
            + Add Your First Source
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => {
            const status = statusIndicator(source);
            return (
              <div
                key={source.id || source.name}
                className="rounded-[10px] border bg-white p-5 transition-all hover:shadow-sm cursor-pointer"
                style={{ borderColor: tokens.border }}
                onClick={() => handleEdit(source)}
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: tokens.text, fontFamily: fonts.heading }}
                    >
                      {source.name}
                    </h3>
                    <Tag variant="default">{typeLabels[source.source_type] || source.source_type}</Tag>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: status.color }}
                    />
                    <span className="text-xs font-medium" style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
                      Events
                    </div>
                    <div
                      className="text-sm font-semibold"
                      style={{ fontFamily: fonts.code, color: tokens.text }}
                    >
                      {(source.events_received || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: tokens.textMuted }}>
                      Last Sync
                    </div>
                    <div className="text-xs" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                      {source.last_sync
                        ? new Date(source.last_sync).toLocaleString()
                        : "Never"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
