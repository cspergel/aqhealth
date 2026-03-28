import { useState, useEffect } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface DiscoveredProvider {
  npi: string;
  name: string;
  specialty: string | null;
}

interface DiscoveredGroup {
  tin: string;
  name: string;
  is_existing: boolean;
  relationship_type: "owned" | "affiliated";
  providers: DiscoveredProvider[];
}

interface DiscoveryResult {
  groups: DiscoveredGroup[];
  unmatched_count: number;
}

interface OrgDiscoveryReviewProps {
  jobId: string;
  onConfirm: () => void;
  onSkip: () => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function OrgDiscoveryReview({ jobId, onConfirm, onSkip }: OrgDiscoveryReviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [groups, setGroups] = useState<DiscoveredGroup[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [expandedTin, setExpandedTin] = useState<string | null>(null);

  /* Run discovery on mount */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.post<DiscoveryResult>("/api/onboarding/discover-structure", {
          job_id: jobId,
        });
        if (!cancelled) {
          setResult(res.data);
          setGroups(res.data.groups.map((g) => ({ ...g })));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to discover org structure.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  /* Handlers */

  const updateGroupName = (tin: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.tin === tin ? { ...g, name } : g)),
    );
  };

  const updateRelationship = (tin: string, rel: "owned" | "affiliated") => {
    setGroups((prev) =>
      prev.map((g) => (g.tin === tin ? { ...g, relationship_type: rel } : g)),
    );
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError("");
    try {
      await api.post("/api/onboarding/confirm-structure", {
        job_id: jobId,
        groups: groups.map((g) => ({
          tin: g.tin,
          name: g.name,
          relationship_type: g.relationship_type,
        })),
      });
      onConfirm();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to confirm structure.");
    } finally {
      setConfirming(false);
    }
  };

  /* Loading state */
  if (loading) {
    return (
      <div className="py-12 text-center">
        <div
          className="text-sm font-medium mb-2"
          style={{ color: tokens.text, fontFamily: fonts.heading }}
        >
          Discovering organization structure...
        </div>
        <div className="text-xs" style={{ color: tokens.textMuted }}>
          Analyzing TINs and NPIs in the uploaded file to identify practice groups.
        </div>
        {/* Simple spinner */}
        <div className="mt-4 flex justify-center">
          <div
            style={{
              width: 24,
              height: 24,
              border: `3px solid ${tokens.border}`,
              borderTop: `3px solid ${tokens.accent}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* Error state */
  if (error && !result) {
    return (
      <div className="py-8 text-center">
        <div className="text-xs mb-3" style={{ color: tokens.red }}>
          {error}
        </div>
        <button
          onClick={onSkip}
          className="text-xs px-4 py-2 rounded-lg font-medium"
          style={{ color: tokens.textSecondary, border: `1px solid ${tokens.border}` }}
        >
          Skip org discovery and proceed to column mapping
        </button>
      </div>
    );
  }

  /* No groups found */
  if (groups.length === 0) {
    return (
      <div className="py-8 text-center">
        <div
          className="text-sm font-medium mb-2"
          style={{ color: tokens.text }}
        >
          No practice groups discovered
        </div>
        <div className="text-xs mb-4" style={{ color: tokens.textMuted }}>
          The uploaded file does not contain TIN or group information that can be mapped to practice groups.
        </div>
        <button
          onClick={onSkip}
          className="text-xs px-4 py-2 rounded-lg font-medium"
          style={{ color: tokens.textSecondary, border: `1px solid ${tokens.border}` }}
        >
          Continue to column mapping
        </button>
      </div>
    );
  }

  /* Main tree view */
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="text-sm font-semibold"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Discovered Organization Structure
          </div>
          <div className="text-xs mt-0.5" style={{ color: tokens.textMuted }}>
            {groups.length} group{groups.length !== 1 ? "s" : ""} found
            {result && result.unmatched_count > 0 && (
              <> &middot; {result.unmatched_count} rows with no group match</>
            )}
          </div>
        </div>
      </div>

      {/* Groups list */}
      <div className="space-y-2 mb-4">
        {groups.map((group) => {
          const isExpanded = expandedTin === group.tin;
          return (
            <div
              key={group.tin}
              className="rounded-[10px]"
              style={{ border: `1px solid ${tokens.border}` }}
            >
              {/* Group header */}
              <button
                onClick={() => setExpandedTin(isExpanded ? null : group.tin)}
                className="w-full flex items-center gap-3 px-4 py-3"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <span
                  style={{
                    fontSize: 10,
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 200ms",
                    display: "inline-block",
                    color: tokens.textMuted,
                  }}
                >
                  {"\u25B8"}
                </span>

                <Tag variant={group.is_existing ? "green" : "blue"}>
                  {group.is_existing ? "Existing" : "New"}
                </Tag>

                <span className="text-xs font-medium" style={{ color: tokens.text }}>
                  {group.name}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: tokens.textMuted, fontFamily: fonts.code }}
                >
                  TIN: {group.tin}
                </span>
                <span
                  className="ml-auto text-[10px]"
                  style={{ color: tokens.textMuted }}
                >
                  {group.providers.length} provider{group.providers.length !== 1 ? "s" : ""}
                </span>
              </button>

              {/* Expanded: editable fields + providers */}
              {isExpanded && (
                <div
                  className="px-4 pb-4"
                  style={{ borderTop: `1px solid ${tokens.borderSoft}` }}
                >
                  {/* Edit fields */}
                  <div className="flex gap-3 mt-3 mb-3">
                    <div className="flex-1">
                      <label
                        className="block text-[10px] font-medium mb-1 uppercase tracking-wide"
                        style={{ color: tokens.textMuted }}
                      >
                        Group Name
                      </label>
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => updateGroupName(group.tin, e.target.value)}
                        className="w-full text-xs px-3 py-1.5 rounded-lg outline-none"
                        style={{
                          border: `1px solid ${tokens.border}`,
                          color: tokens.text,
                          background: tokens.surface,
                        }}
                      />
                    </div>
                    <div style={{ width: 180 }}>
                      <label
                        className="block text-[10px] font-medium mb-1 uppercase tracking-wide"
                        style={{ color: tokens.textMuted }}
                      >
                        Relationship
                      </label>
                      <select
                        value={group.relationship_type}
                        onChange={(e) =>
                          updateRelationship(group.tin, e.target.value as "owned" | "affiliated")
                        }
                        className="w-full text-xs px-3 py-1.5 rounded-lg outline-none"
                        style={{
                          border: `1px solid ${tokens.border}`,
                          color: tokens.text,
                          background: tokens.surface,
                        }}
                      >
                        <option value="owned">Owned</option>
                        <option value="affiliated">Affiliated</option>
                      </select>
                    </div>
                  </div>

                  {/* Providers table */}
                  {group.providers.length > 0 && (
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ border: `1px solid ${tokens.borderSoft}` }}
                    >
                      <table className="w-full text-xs" style={{ color: tokens.text }}>
                        <thead>
                          <tr style={{ background: tokens.surfaceAlt }}>
                            <th
                              className="text-left px-3 py-2 font-medium"
                              style={{ color: tokens.textMuted }}
                            >
                              NPI
                            </th>
                            <th
                              className="text-left px-3 py-2 font-medium"
                              style={{ color: tokens.textMuted }}
                            >
                              Provider Name
                            </th>
                            <th
                              className="text-left px-3 py-2 font-medium"
                              style={{ color: tokens.textMuted }}
                            >
                              Specialty
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.providers.map((prov) => (
                            <tr
                              key={prov.npi}
                              style={{
                                borderTop: `1px solid ${tokens.borderSoft}`,
                                background: tokens.surface,
                              }}
                            >
                              <td
                                className="px-3 py-2"
                                style={{ fontFamily: fonts.code }}
                              >
                                {prov.npi}
                              </td>
                              <td className="px-3 py-2">{prov.name}</td>
                              <td
                                className="px-3 py-2"
                                style={{ color: tokens.textSecondary }}
                              >
                                {prov.specialty || "--"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs mb-3" style={{ color: tokens.red }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: tokens.accent }}
        >
          {confirming ? "Confirming..." : "Confirm Structure"}
        </button>
        <button
          onClick={onSkip}
          disabled={confirming}
          className="px-6 py-2.5 rounded-[10px] text-sm font-medium transition-opacity disabled:opacity-60"
          style={{
            color: tokens.textSecondary,
            border: `1px solid ${tokens.border}`,
            background: "transparent",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
