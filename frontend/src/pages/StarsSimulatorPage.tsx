import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StarsMeasure {
  code: string;
  name: string;
  category: string;
  weight: number;
  part: "C" | "D";
  total_eligible: number;
  numerator: number;
  current_rate: number;
  star_level: number;
  star_3_cutpoint: number | null;
  star_4_cutpoint: number | null;
  star_5_cutpoint: number | null;
  gaps_to_next_star: number | null;
}

interface StarsProjection {
  overall_rating: number;
  part_c_rating: number;
  part_d_rating: number;
  total_weighted_score: number;
  qualifies_for_bonus: boolean;
  quality_bonus_amount: number;
  measures: StarsMeasure[];
}

interface MeasureChanged {
  code: string;
  name: string;
  weight: number;
  old_star: number;
  new_star: number;
  old_rate: number;
  new_rate: number;
}

interface SimulationResult {
  current_overall: number;
  projected_overall: number;
  current_part_c: number;
  projected_part_c: number;
  current_part_d: number;
  projected_part_d: number;
  rating_change: number;
  measures_changed: MeasureChanged[];
  qualifies_for_bonus: boolean;
  quality_bonus_amount: number;
  quality_bonus_change: number;
  simulated_measures: StarsMeasure[];
}

interface Opportunity {
  measure_code: string;
  measure_name: string;
  current_star: number;
  target_star: number;
  gaps_to_close: number;
  weight: number;
  current_rate: number;
  target_rate: number | null;
  roi_score: number;
  description: string;
  impact_type: string;
}

interface Intervention {
  measure_code: string;
  gaps_to_close: number;
}

type Tab = "current" | "simulator" | "optimize";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function StarDisplay({ rating, size = "large" }: { rating: number; size?: "large" | "small" }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  const sz = size === "large" ? 32 : 18;
  const color = rating >= 4 ? "#16a34a" : rating >= 3 ? "#d97706" : "#dc2626";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <svg key={`f${i}`} width={sz} height={sz} viewBox="0 0 24 24" fill={color}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      {hasHalf && (
        <svg width={sz} height={sz} viewBox="0 0 24 24">
          <defs>
            <linearGradient id={`half-${rating}`}>
              <stop offset="50%" stopColor={color} />
              <stop offset="50%" stopColor={tokens.border} />
            </linearGradient>
          </defs>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={`url(#half-${rating})`} />
        </svg>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <svg key={`e${i}`} width={sz} height={sz} viewBox="0 0 24 24" fill={tokens.border}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      <span
        style={{
          marginLeft: 8,
          fontSize: size === "large" ? 28 : 16,
          fontWeight: 700,
          fontFamily: fonts.heading,
          color: tokens.text,
        }}
      >
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

function starLevelBadge(level: number) {
  const colors: Record<number, { bg: string; text: string }> = {
    5: { bg: "#dcfce7", text: "#16a34a" },
    4: { bg: "#dbeafe", text: "#2563eb" },
    3: { bg: "#fef3c7", text: "#d97706" },
    2: { bg: "#fee2e2", text: "#dc2626" },
    1: { bg: "#fee2e2", text: "#dc2626" },
  };
  const c = colors[level] || colors[1];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 9999,
        background: c.bg,
        color: c.text,
      }}
    >
      {level}-Star
    </span>
  );
}

function weightBadge(w: number) {
  if (w >= 3) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, background: "#fae8ff", color: "#a21caf" }}>
        {w}x
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, background: tokens.surfaceAlt, color: tokens.textSecondary }}>
      {w}x
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StarsSimulatorPage() {
  const [tab, setTab] = useState<Tab>("current");
  const [projection, setProjection] = useState<StarsProjection | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(false);
  const [partFilter, setPartFilter] = useState<"all" | "C" | "D">("all");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/stars/projection"),
      api.get("/api/stars/opportunities"),
    ])
      .then(([projRes, oppRes]) => {
        setProjection(projRes.data);
        setOpportunities(Array.isArray(oppRes.data) ? oppRes.data : []);
      })
      .catch((err) => console.error("Stars load error:", err))
      .finally(() => setLoading(false));
  }, []);

  const addIntervention = (code: string) => {
    if (interventions.find((i) => i.measure_code === code)) return;
    const measure = projection?.measures.find((m) => m.code === code);
    setInterventions([...interventions, {
      measure_code: code,
      gaps_to_close: measure?.gaps_to_next_star ?? 0,
    }]);
  };

  const removeIntervention = (code: string) => {
    setInterventions(interventions.filter((i) => i.measure_code !== code));
  };

  const updateIntervention = (code: string, gaps: number) => {
    setInterventions(interventions.map((i) =>
      i.measure_code === code ? { ...i, gaps_to_close: gaps } : i
    ));
  };

  const runSimulation = () => {
    if (interventions.length === 0) return;
    setSimLoading(true);
    api.post("/api/stars/simulate", { interventions })
      .then((res) => setSimulation(res.data as SimulationResult))
      .catch((err) => console.error("Simulation error:", err))
      .finally(() => setSimLoading(false));
  };

  const autoOptimize = () => {
    // Auto-fill interventions from top opportunities
    const topOps = opportunities.slice(0, 5);
    const newInterventions = topOps.map((op) => ({
      measure_code: op.measure_code,
      gaps_to_close: op.gaps_to_close,
    }));
    setInterventions(newInterventions);
  };

  const filteredMeasures = projection?.measures.filter((m) =>
    partFilter === "all" || m.part === partFilter
  ) || [];

  if (loading) {
    return (
      <div className="px-7 py-6">
        <p style={{ color: tokens.textMuted, fontSize: 13 }}>Loading Stars data...</p>
      </div>
    );
  }

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold tracking-tight mb-1"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Stars Rating Simulator
        </h1>
        <p className="text-[13px]" style={{ color: tokens.textMuted }}>
          Model quality interventions and see projected impact on CMS Star ratings and quality bonus payments
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: tokens.border }}>
        {(["current", "simulator", "optimize"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px"
            style={{
              color: tab === t ? tokens.text : tokens.textMuted,
              borderBottomColor: tab === t ? tokens.accent : "transparent",
              textTransform: "capitalize",
            }}
          >
            {t === "current" ? "Current Projection" : t === "simulator" ? "Intervention Builder" : "Auto-Optimize"}
          </button>
        ))}
      </div>

      {/* ---- CURRENT PROJECTION TAB ---- */}
      {tab === "current" && projection && (
        <>
          {/* Rating cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div
              className="rounded-lg p-5"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: tokens.textMuted }}>
                Overall Rating
              </div>
              <StarDisplay rating={projection.overall_rating} />
              <div className="text-[12px] mt-2" style={{ color: tokens.textSecondary }}>
                Weighted score: {projection.total_weighted_score.toFixed(3)}
              </div>
            </div>
            <div
              className="rounded-lg p-5"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: tokens.textMuted }}>
                Part C (Medical)
              </div>
              <StarDisplay rating={projection.part_c_rating} size="small" />
              <div className="text-[12px] mt-2" style={{ color: tokens.textSecondary }}>
                {projection.measures.filter((m) => m.part === "C").length} measures
              </div>
            </div>
            <div
              className="rounded-lg p-5"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: tokens.textMuted }}>
                Part D (Pharmacy)
              </div>
              <StarDisplay rating={projection.part_d_rating} size="small" />
              <div className="text-[12px] mt-2" style={{ color: tokens.textSecondary }}>
                {projection.measures.filter((m) => m.part === "D").length} measures
              </div>
            </div>
          </div>

          {/* Quality Bonus Banner */}
          <div
            className="rounded-lg p-4 mb-6"
            style={{
              background: projection.qualifies_for_bonus ? tokens.accentSoft : tokens.redSoft,
              border: `1px solid ${projection.qualifies_for_bonus ? tokens.accent : tokens.red}33`,
            }}
          >
            <div className="text-[12px] font-semibold mb-1" style={{ color: projection.qualifies_for_bonus ? tokens.accent : tokens.red }}>
              QUALITY BONUS STATUS
            </div>
            <div className="text-[13px]" style={{ color: tokens.text }}>
              {projection.qualifies_for_bonus
                ? `Congratulations! At ${projection.overall_rating} stars, you qualify for the quality bonus (estimated ${fmtDollar(projection.quality_bonus_amount)}/year).`
                : `At ${projection.overall_rating} stars, you do not currently qualify for the quality bonus. You need 4.0 stars. Use the Intervention Builder to model how to get there.`
              }
            </div>
          </div>

          {/* Part filter */}
          <div className="flex items-center gap-2 mb-4">
            {(["all", "C", "D"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setPartFilter(f)}
                className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: partFilter === f ? tokens.accent : tokens.surfaceAlt,
                  color: partFilter === f ? "#fff" : tokens.textSecondary,
                  border: `1px solid ${partFilter === f ? tokens.accent : tokens.border}`,
                  cursor: "pointer",
                }}
              >
                {f === "all" ? "All Measures" : `Part ${f}`}
              </button>
            ))}
          </div>

          {/* Measures table */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Measure", "Weight", "Part", "Rate", "Star Level", "3-Star", "4-Star", "5-Star", "Gap to Next"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: h === "Measure" ? "left" : "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: tokens.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMeasures.map((m) => (
                  <tr key={m.code} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: tokens.textMuted }}>{m.code}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{weightBadge(m.weight)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: tokens.textSecondary }}>{m.part}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>
                      {m.current_rate}%
                      <div style={{ fontSize: 10, color: tokens.textMuted }}>{m.numerator}/{m.total_eligible}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{starLevelBadge(m.star_level)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: m.current_rate >= (m.star_3_cutpoint || 0) ? tokens.textMuted : tokens.red }}>
                      {m.star_3_cutpoint ?? "--"}%
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: m.current_rate >= (m.star_4_cutpoint || 0) ? tokens.textMuted : tokens.amber }}>
                      {m.star_4_cutpoint ?? "--"}%
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: m.current_rate >= (m.star_5_cutpoint || 0) ? tokens.textMuted : tokens.blue }}>
                      {m.star_5_cutpoint ?? "--"}%
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {m.gaps_to_next_star !== null ? (
                        <span style={{ fontWeight: 600, color: tokens.red }}>{m.gaps_to_next_star}</span>
                      ) : (
                        <span style={{ color: tokens.textMuted }}>--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- INTERVENTION BUILDER TAB ---- */}
      {tab === "simulator" && projection && (
        <>
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Build interventions */}
            <div>
              <div
                className="rounded-lg p-5 mb-4"
                style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
              >
                <h3 className="text-[14px] font-semibold mb-3" style={{ color: tokens.text }}>
                  Select Measure to Improve
                </h3>
                <select
                  className="rounded-md px-3 py-2 text-[13px] w-full mb-3"
                  style={{ border: `1px solid ${tokens.border}`, background: tokens.bg, color: tokens.text }}
                  onChange={(e) => { if (e.target.value) addIntervention(e.target.value); e.target.value = ""; }}
                  defaultValue=""
                >
                  <option value="" disabled>Choose a measure...</option>
                  {projection.measures
                    .filter((m) => m.star_level < 5 && !interventions.find((i) => i.measure_code === m.code))
                    .map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} - {m.name} ({m.weight}x, currently {m.star_level}-star, {m.gaps_to_next_star ?? 0} gaps to next)
                      </option>
                    ))}
                </select>

                {/* Intervention list */}
                {interventions.length === 0 && (
                  <p className="text-[13px]" style={{ color: tokens.textMuted }}>
                    No interventions selected. Choose a measure above or click "Auto-Optimize".
                  </p>
                )}
                {interventions.map((intv) => {
                  const m = projection.measures.find((x) => x.code === intv.measure_code);
                  return (
                    <div
                      key={intv.measure_code}
                      className="rounded-md p-3 mb-2"
                      style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-[13px] font-medium" style={{ color: tokens.text }}>
                            {m?.name || intv.measure_code}
                          </span>
                          {m && <span className="ml-2">{weightBadge(m.weight)}</span>}
                        </div>
                        <button
                          onClick={() => removeIntervention(intv.measure_code)}
                          style={{ fontSize: 12, color: tokens.red, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-[12px]" style={{ color: tokens.textSecondary }}>Gaps to close:</label>
                        <input
                          type="range"
                          min={0}
                          max={m?.total_eligible ? m.total_eligible - m.numerator : 500}
                          value={intv.gaps_to_close}
                          onChange={(e) => updateIntervention(intv.measure_code, parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: tokens.accent }}
                        />
                        <input
                          type="number"
                          value={intv.gaps_to_close}
                          onChange={(e) => updateIntervention(intv.measure_code, parseInt(e.target.value) || 0)}
                          className="rounded-md px-2 py-1 text-[13px] text-center"
                          style={{ width: 64, border: `1px solid ${tokens.border}`, background: tokens.surface, color: tokens.text }}
                        />
                      </div>
                      {m && (
                        <div className="text-[11px] mt-1" style={{ color: tokens.textMuted }}>
                          Current: {m.current_rate}% ({m.numerator}/{m.total_eligible}) |
                          Projected: {Math.min(((m.numerator + intv.gaps_to_close) / m.total_eligible * 100), 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={runSimulation}
                    disabled={interventions.length === 0 || simLoading}
                    className="rounded-md px-5 py-2.5 text-[13px] font-semibold"
                    style={{
                      background: interventions.length === 0 ? tokens.surfaceAlt : tokens.accent,
                      color: interventions.length === 0 ? tokens.textMuted : "#fff",
                      border: "none",
                      cursor: interventions.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {simLoading ? "Running..." : "Run Simulation"}
                  </button>
                  <button
                    onClick={autoOptimize}
                    className="rounded-md px-5 py-2.5 text-[13px] font-semibold"
                    style={{
                      background: tokens.blueSoft,
                      color: tokens.blue,
                      border: `1px solid ${tokens.blue}33`,
                      cursor: "pointer",
                    }}
                  >
                    Auto-Optimize
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Simulation results */}
            <div>
              {!simulation && (
                <div
                  className="rounded-lg p-8 text-center"
                  style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
                >
                  <div className="text-[14px] font-medium mb-2" style={{ color: tokens.textSecondary }}>
                    No simulation results yet
                  </div>
                  <p className="text-[12px]" style={{ color: tokens.textMuted }}>
                    Select measures and gaps to close, then click "Run Simulation" to see projected impact.
                  </p>
                </div>
              )}

              {simulation && (
                <div
                  className="rounded-lg p-5"
                  style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
                >
                  <h3 className="text-[14px] font-semibold mb-4" style={{ color: tokens.text }}>
                    Simulation Results
                  </h3>

                  {/* Rating comparison */}
                  <div className="flex items-center gap-6 mb-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Current</div>
                      <StarDisplay rating={simulation.current_overall} size="small" />
                    </div>
                    <div style={{ fontSize: 24, color: tokens.accent, fontWeight: 700 }}>
                      {simulation.rating_change > 0 ? "+" : ""}{simulation.rating_change.toFixed(1)}
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: tokens.textMuted }}>Projected</div>
                      <StarDisplay rating={simulation.projected_overall} size="small" />
                    </div>
                  </div>

                  {/* Part breakdown */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-md p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-[11px]" style={{ color: tokens.textMuted }}>Part C</div>
                      <div className="text-[15px] font-bold">{simulation.current_part_c} &rarr; {simulation.projected_part_c}</div>
                    </div>
                    <div className="rounded-md p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-[11px]" style={{ color: tokens.textMuted }}>Part D</div>
                      <div className="text-[15px] font-bold">{simulation.current_part_d} &rarr; {simulation.projected_part_d}</div>
                    </div>
                  </div>

                  {/* Quality bonus */}
                  <div
                    className="rounded-md p-3 mb-4"
                    style={{
                      background: simulation.qualifies_for_bonus ? tokens.accentSoft : tokens.surfaceAlt,
                      border: `1px solid ${simulation.qualifies_for_bonus ? tokens.accent : tokens.border}33`,
                    }}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: simulation.qualifies_for_bonus ? tokens.accent : tokens.textMuted }}>
                      Quality Bonus Impact
                    </div>
                    <div className="text-[18px] font-bold" style={{ color: simulation.qualifies_for_bonus ? tokens.accent : tokens.text }}>
                      {simulation.quality_bonus_change > 0 ? "+" : ""}{fmtDollar(simulation.quality_bonus_change)}
                    </div>
                    <div className="text-[12px]" style={{ color: tokens.textSecondary }}>
                      {simulation.qualifies_for_bonus
                        ? `Qualifies for bonus at ${simulation.projected_overall} stars`
                        : "Does not qualify for quality bonus"
                      }
                    </div>
                  </div>

                  {/* Measures that changed */}
                  {simulation.measures_changed.length > 0 && (
                    <>
                      <h4 className="text-[13px] font-semibold mb-2" style={{ color: tokens.text }}>
                        Measures That Moved Star Levels
                      </h4>
                      {simulation.measures_changed.map((mc) => (
                        <div
                          key={mc.code}
                          className="rounded-md p-3 mb-2"
                          style={{ background: tokens.accentSoft, border: `1px solid ${tokens.accent}22` }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium">{mc.name}</span>
                            {weightBadge(mc.weight)}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[12px]">
                            {starLevelBadge(mc.old_star)}
                            <span style={{ color: tokens.accent, fontWeight: 700 }}>&rarr;</span>
                            {starLevelBadge(mc.new_star)}
                            <span style={{ color: tokens.textMuted, marginLeft: 8 }}>
                              ({mc.old_rate}% &rarr; {mc.new_rate}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ---- AUTO-OPTIMIZE TAB ---- */}
      {tab === "optimize" && (
        <>
          <div
            className="rounded-lg p-4 mb-6"
            style={{ background: tokens.blueSoft, border: `1px solid ${tokens.blue}33` }}
          >
            <div className="text-[12px] font-semibold mb-1" style={{ color: tokens.blue }}>
              AI-OPTIMIZED RECOMMENDATIONS
            </div>
            <div className="text-[13px]" style={{ color: tokens.text }}>
              Interventions ranked by ROI: measures closest to a cutpoint with highest weight deliver the most Stars impact per gap closed.
              Triple-weighted measures (medication adherence) have 3x the impact on your overall rating.
            </div>
          </div>

          {/* Opportunities list */}
          {opportunities.map((op, idx) => (
            <div
              key={op.measure_code}
              className="rounded-lg p-5 mb-3"
              style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full w-8 h-8 flex items-center justify-center text-[14px] font-bold"
                    style={{
                      background: idx === 0 ? tokens.accent : tokens.surfaceAlt,
                      color: idx === 0 ? "#fff" : tokens.text,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold" style={{ color: tokens.text }}>{op.measure_name}</div>
                    <div className="text-[12px]" style={{ color: tokens.textMuted }}>{op.measure_code}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {weightBadge(op.weight)}
                  {starLevelBadge(op.current_star)}
                  <span style={{ fontSize: 14, color: tokens.accent, fontWeight: 700 }}>&rarr;</span>
                  {starLevelBadge(op.target_star)}
                </div>
              </div>

              <div className="text-[13px] mb-3" style={{ color: tokens.textSecondary }}>
                {op.description}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>Gaps to Close</div>
                  <div className="text-[16px] font-bold" style={{ color: tokens.text }}>{op.gaps_to_close}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>Current Rate</div>
                  <div className="text-[16px] font-bold" style={{ color: tokens.text }}>{op.current_rate}%</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>Target Rate</div>
                  <div className="text-[16px] font-bold" style={{ color: tokens.accent }}>{op.target_rate}%</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>ROI Score</div>
                  <div className="text-[16px] font-bold" style={{ color: op.impact_type === "triple_weighted" ? "#a21caf" : tokens.text }}>
                    {op.roi_score.toFixed(1)}
                  </div>
                </div>
              </div>

              {op.impact_type === "triple_weighted" && (
                <div
                  className="rounded-md p-2 mt-3 text-[12px] font-medium text-center"
                  style={{ background: "#fae8ff", color: "#a21caf" }}
                >
                  HIGHEST ROI -- Triple-weighted measure
                </div>
              )}
            </div>
          ))}

          {/* CTA */}
          <div className="flex justify-center mt-4">
            <button
              onClick={() => {
                const topOps = opportunities.slice(0, 5);
                setInterventions(topOps.map((op) => ({
                  measure_code: op.measure_code,
                  gaps_to_close: op.gaps_to_close,
                })));
                setTab("simulator");
              }}
              className="rounded-md px-6 py-3 text-[14px] font-semibold"
              style={{ background: tokens.accent, color: "#fff", border: "none", cursor: "pointer" }}
            >
              Load All into Intervention Builder
            </button>
          </div>
        </>
      )}
    </div>
  );
}
