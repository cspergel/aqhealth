import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CohortMember {
  id: string;
  name: string;
  age: number;
  gender: string;
  raf: number;
  risk_tier: string;
  provider: string;
  group: string;
  er_visits: number;
  admissions: number;
  total_spend: number;
  top_diagnoses: string[];
  open_gaps: number;
  suspect_hccs: string[];
}

interface AggregateStats {
  avg_raf: number;
  total_spend: number;
  avg_spend: number;
  avg_age: number;
  avg_er_visits: number;
  avg_admissions: number;
  pct_high_risk: number;
  total_open_gaps: number;
}

interface CohortResult {
  member_count: number;
  filters_applied: Record<string, unknown>;
  aggregate_stats: AggregateStats;
  top_diagnoses: { code: string; count: number }[];
  top_suspects: { code: string; count: number }[];
  members: CohortMember[];
}

interface CohortResultsProps {
  data: CohortResult;
  onSave?: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function tierColor(tier: string): { bg: string; text: string } {
  switch (tier) {
    case "high":
      return { bg: tokens.redSoft, text: tokens.red };
    case "medium":
      return { bg: tokens.amberSoft, text: tokens.amber };
    case "low":
      return { bg: tokens.accentSoft, text: tokens.accentText };
    default:
      return { bg: tokens.surfaceAlt, text: tokens.textMuted };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CohortResults({ data, onSave }: CohortResultsProps) {
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const stats = data.aggregate_stats;

  const handleSave = () => {
    if (!saveName.trim() || !onSave) return;
    setSaving(true);
    onSave(saveName);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 300);
  };

  return (
    <div className="space-y-4">
      {/* Aggregate Stats */}
      <div
        className="rounded-xl border bg-white p-6"
        style={{ borderColor: tokens.border }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3
              className="text-[15px] font-bold tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Cohort Results
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
              {data.member_count} members match your criteria
            </p>
          </div>

          {/* Save */}
          {onSave && (
            <div className="flex items-center gap-2">
              {!saved ? (
                <>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Cohort name..."
                    className="text-[12px] rounded-md border px-2 py-1.5 w-[200px]"
                    style={{ borderColor: tokens.border, color: tokens.text, fontFamily: fonts.body }}
                  />
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim() || saving}
                    className="text-[12px] px-3 py-1.5 rounded-md font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: tokens.accent }}
                  >
                    {saving ? "Saving..." : "Save Cohort"}
                  </button>
                </>
              ) : (
                <span className="text-[12px] font-medium" style={{ color: tokens.accentText }}>
                  Saved
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Avg RAF", value: stats.avg_raf.toFixed(3) },
            { label: "Total Spend", value: fmt(stats.total_spend) },
            { label: "Avg Age", value: stats.avg_age.toFixed(1) },
            { label: "% High Risk", value: `${stats.pct_high_risk}%` },
            { label: "Avg Spend", value: fmt(stats.avg_spend) },
            { label: "Avg ER Visits", value: stats.avg_er_visits.toFixed(1) },
            { label: "Avg Admissions", value: stats.avg_admissions.toFixed(1) },
            { label: "Open Gaps", value: stats.total_open_gaps.toString() },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: tokens.borderSoft, background: tokens.surfaceAlt }}
            >
              <div className="text-[10px] uppercase font-medium tracking-wider" style={{ color: tokens.textMuted }}>
                {s.label}
              </div>
              <div className="text-[14px] font-bold mt-0.5" style={{ fontFamily: fonts.code, color: tokens.text }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Top Diagnoses & Suspects */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-[11px] uppercase font-semibold mb-2 tracking-wider" style={{ color: tokens.textMuted }}>
              Top Diagnoses
            </div>
            <div className="space-y-1">
              {data.top_diagnoses.map((d) => (
                <div key={d.code} className="flex items-center justify-between text-[12px]">
                  <span style={{ fontFamily: fonts.code, color: tokens.text }}>{d.code}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: tokens.surfaceAlt, color: tokens.textSecondary }}>
                    {d.count} members
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase font-semibold mb-2 tracking-wider" style={{ color: tokens.textMuted }}>
              Top Suspect HCCs
            </div>
            <div className="space-y-1">
              {data.top_suspects.map((s) => (
                <div key={s.code} className="flex items-center justify-between text-[12px]">
                  <span style={{ fontFamily: fonts.code, color: tokens.text }}>{s.code}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: tokens.amberSoft, color: tokens.amber }}>
                    {s.count} members
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Member List */}
      <div
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: tokens.border }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: tokens.border }}>
          <h3 className="text-[14px] font-semibold" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Members ({data.member_count})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: tokens.surfaceAlt }}>
                {["Member", "Age", "RAF", "Risk", "Provider", "ER", "Admissions", "Spend", "Gaps"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-semibold px-4 py-2 uppercase tracking-wider"
                    style={{ color: tokens.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const tc = tierColor(m.risk_tier);
                return (
                  <tr
                    key={m.id}
                    className="border-b hover:bg-stone-50/50 transition-colors"
                    style={{ borderColor: tokens.borderSoft }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-medium" style={{ color: tokens.text }}>{m.name}</div>
                      <div className="text-[11px]" style={{ color: tokens.textMuted }}>{m.id} &middot; {m.group}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: tokens.text }}>{m.age}</td>
                    <td className="px-4 py-2.5 text-[13px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
                      {m.raf.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: tc.bg, color: tc.text }}
                      >
                        {m.risk_tier}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: tokens.textSecondary }}>{m.provider}</td>
                    <td className="px-4 py-2.5 text-[13px] font-medium" style={{ fontFamily: fonts.code, color: m.er_visits >= 3 ? tokens.red : tokens.text }}>
                      {m.er_visits}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium" style={{ fontFamily: fonts.code, color: m.admissions >= 2 ? tokens.red : tokens.text }}>
                      {m.admissions}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium" style={{ fontFamily: fonts.code, color: tokens.text }}>
                      {fmt(m.total_spend)}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium" style={{ fontFamily: fonts.code, color: m.open_gaps > 2 ? tokens.red : tokens.amber }}>
                      {m.open_gaps}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
