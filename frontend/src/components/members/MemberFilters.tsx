import { useState } from "react";
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
/* Preset groups                                                       */
/* ------------------------------------------------------------------ */

interface PresetGroup {
  label: string;
  color: string;
  softColor: string;
  presets: { key: string; label: string }[];
}

const presetGroups: PresetGroup[] = [
  {
    label: "Revenue",
    color: tokens.accentText,
    softColor: tokens.accentSoft,
    presets: [
      { key: "high_raf_not_seen", label: "High RAF Not Seen 90+" },
      { key: "all_suspects", label: "Open Suspects" },
    ],
  },
  {
    label: "Quality",
    color: tokens.blue,
    softColor: tokens.blueSoft,
    presets: [
      { key: "all_gaps", label: "Open Gaps" },
      { key: "low_raf_undercoded", label: "Low RAF Likely Undercoded" },
    ],
  },
  {
    label: "Care Mgmt",
    color: tokens.amber,
    softColor: tokens.amberSoft,
    presets: [
      { key: "rising_risk", label: "Rising Risk" },
      { key: "complex_active", label: "Complex Active Mgmt" },
      { key: "not_seen_6mo", label: "Not Seen 6+ Mo" },
    ],
  },
  {
    label: "Wellness",
    color: "#7c3aed",
    softColor: "#f3e8ff",
    presets: [
      { key: "healthy_keep_well", label: "Healthy Keep Well" },
    ],
  },
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

  const [showQuickFilters, setShowQuickFilters] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Quick Filters header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setShowQuickFilters(!showQuickFilters)}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
            color: tokens.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: fonts.body,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10 }}>{showQuickFilters ? "\u25BC" : "\u25B6"}</span>
          Quick Filters
        </button>
        <span style={{ fontSize: 11, color: tokens.textMuted }}>
          Click a preset to apply filters instantly
        </span>
      </div>

      {/* Grouped preset buttons */}
      {showQuickFilters && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "12px 16px",
            background: tokens.surface,
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
          }}
        >
          {presetGroups.map((group) => (
            <div key={group.label} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: group.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  width: 70,
                  flexShrink: 0,
                }}
              >
                {group.label}
              </span>
              {group.presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => onPreset(p.key)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 9999,
                    border: `1px solid ${tokens.border}`,
                    background: group.softColor,
                    color: group.color,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 150ms, color 150ms",
                    fontFamily: fonts.body,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = group.color; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = group.color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = group.softColor; e.currentTarget.style.color = group.color; e.currentTarget.style.borderColor = tokens.border; }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

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
