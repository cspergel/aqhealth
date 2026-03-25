import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MemberFilterState {
  raf_min: number;
  raf_max: number;
  days_not_seen: number | null;
  risk_tier: string | null;
  has_suspects: boolean;
  has_gaps: boolean;
  search: string;
}

interface Props {
  filters: MemberFilterState;
  onChange: (filters: MemberFilterState) => void;
  onPreset: (preset: string) => void;
}

/* ------------------------------------------------------------------ */
/* Presets                                                              */
/* ------------------------------------------------------------------ */

const presets = [
  { key: "high_raf_not_seen", label: "High RAF, Not Seen 90+ Days" },
  { key: "all_suspects", label: "All Open Suspects" },
  { key: "all_gaps", label: "All Open Gaps" },
];

const riskTiers = ["low", "rising", "high", "complex"] as const;

const daysOptions = [
  { value: null, label: "Any" },
  { value: 30, label: "30+ days" },
  { value: 60, label: "60+ days" },
  { value: 90, label: "90+ days" },
  { value: 180, label: "180+ days" },
  { value: 365, label: "1 year+" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function MemberFilters({ filters, onChange, onPreset }: Props) {
  const update = (patch: Partial<MemberFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Preset buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            style={{
              padding: "5px 14px",
              borderRadius: 9999,
              border: `1px solid ${tokens.border}`,
              background: tokens.accentSoft,
              color: tokens.accentText,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms",
              fontFamily: fonts.body,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = tokens.accent; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = tokens.accentSoft; e.currentTarget.style.color = tokens.accentText; }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "12px 16px",
          background: tokens.surface,
          borderRadius: 8,
          border: `1px solid ${tokens.border}`,
        }}
      >
        {/* Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Search</label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Name or Member ID..."
            style={{
              width: 180,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              fontSize: 13,
              fontFamily: fonts.body,
              outline: "none",
              background: tokens.bg,
            }}
          />
        </div>

        {/* RAF Range */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>RAF Range</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={filters.raf_min}
              onChange={(e) => update({ raf_min: parseFloat(e.target.value) || 0 })}
              style={{
                width: 60,
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                fontSize: 13,
                fontFamily: fonts.code,
                textAlign: "center",
                background: tokens.bg,
              }}
            />
            <span style={{ fontSize: 12, color: tokens.textMuted }}>to</span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={filters.raf_max}
              onChange={(e) => update({ raf_max: parseFloat(e.target.value) || 5 })}
              style={{
                width: 60,
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                fontSize: 13,
                fontFamily: fonts.code,
                textAlign: "center",
                background: tokens.bg,
              }}
            />
          </div>
        </div>

        {/* Not Seen In */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Not Seen In</label>
          <select
            value={filters.days_not_seen ?? ""}
            onChange={(e) => update({ days_not_seen: e.target.value ? parseInt(e.target.value) : null })}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              fontSize: 13,
              fontFamily: fonts.body,
              background: tokens.bg,
              cursor: "pointer",
            }}
          >
            {daysOptions.map((o) => (
              <option key={o.label} value={o.value ?? ""}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Risk Tier pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Risk Tier</label>
          <div style={{ display: "flex", gap: 4 }}>
            {riskTiers.map((tier) => {
              const active = filters.risk_tier === tier;
              const tierColors: Record<string, { bg: string; text: string; activeBg: string }> = {
                low: { bg: tokens.accentSoft, text: tokens.accentText, activeBg: tokens.accent },
                rising: { bg: tokens.amberSoft, text: tokens.amber, activeBg: tokens.amber },
                high: { bg: tokens.redSoft, text: tokens.red, activeBg: tokens.red },
                complex: { bg: "#f3e8ff", text: "#7c3aed", activeBg: "#7c3aed" },
              };
              const tc = tierColors[tier];
              return (
                <button
                  key={tier}
                  onClick={() => update({ risk_tier: active ? null : tier })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 9999,
                    border: "none",
                    background: active ? tc.activeBg : tc.bg,
                    color: active ? "#fff" : tc.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 150ms",
                    fontFamily: fonts.body,
                  }}
                >
                  {tier}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle: Has Suspects */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Suspects</label>
          <button
            onClick={() => update({ has_suspects: !filters.has_suspects })}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: `1px solid ${filters.has_suspects ? tokens.amber : tokens.border}`,
              background: filters.has_suspects ? tokens.amberSoft : "transparent",
              color: filters.has_suspects ? tokens.amber : tokens.textSecondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: fonts.body,
            }}
          >
            {filters.has_suspects ? "On" : "Off"}
          </button>
        </div>

        {/* Toggle: Has Gaps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Open Gaps</label>
          <button
            onClick={() => update({ has_gaps: !filters.has_gaps })}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: `1px solid ${filters.has_gaps ? tokens.red : tokens.border}`,
              background: filters.has_gaps ? tokens.redSoft : "transparent",
              color: filters.has_gaps ? tokens.red : tokens.textSecondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: fonts.body,
            }}
          >
            {filters.has_gaps ? "On" : "Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
