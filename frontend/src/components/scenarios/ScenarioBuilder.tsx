import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioBuilderProps {
  onRun: (type: string, params: Record<string, unknown>) => void;
  loading: boolean;
}

interface ParamDef {
  key: string;
  label: string;
  type: "slider" | "number" | "text" | "select";
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  suffix?: string;
  options?: { value: string; label: string }[];
}

const SCENARIO_TYPES: { value: string; label: string; params: ParamDef[] }[] = [
  {
    value: "capture_improvement",
    label: "Improve HCC Capture Rate",
    params: [
      { key: "from_rate", label: "Current Capture Rate", type: "slider", min: 30, max: 90, step: 1, default: 65, suffix: "%" },
      { key: "to_rate", label: "Target Capture Rate", type: "slider", min: 40, max: 100, step: 1, default: 80, suffix: "%" },
    ],
  },
  {
    value: "facility_redirect",
    label: "Facility Redirection",
    params: [
      { key: "patient_count", label: "Patients to Redirect", type: "slider", min: 10, max: 200, step: 5, default: 50, suffix: " patients" },
    ],
  },
  {
    value: "gap_closure",
    label: "Care Gap Closure Campaign",
    params: [
      { key: "measure", label: "Measure", type: "select", default: "CDC-HbA1c", options: [
        { value: "CDC-HbA1c", label: "Diabetes HbA1c Control" },
        { value: "BCS", label: "Breast Cancer Screening" },
        { value: "COL", label: "Colorectal Screening" },
        { value: "CBP", label: "Blood Pressure Control" },
        { value: "MED-ADH", label: "Medication Adherence" },
      ]},
      { key: "gaps_to_close", label: "Gaps to Close", type: "slider", min: 10, max: 500, step: 10, default: 100, suffix: " gaps" },
    ],
  },
  {
    value: "membership_change",
    label: "Membership Growth/Decline",
    params: [
      { key: "member_delta", label: "Member Change", type: "slider", min: -1000, max: 2000, step: 50, default: 500, suffix: " members" },
      { key: "avg_raf", label: "Average RAF of New Members", type: "slider", min: 0.5, max: 3.0, step: 0.05, default: 1.2, suffix: "" },
    ],
  },
  {
    value: "cost_reduction",
    label: "Cost Category Reduction",
    params: [
      { key: "category", label: "Service Category", type: "select", default: "inpatient", options: [
        { value: "inpatient", label: "Inpatient" },
        { value: "ed_observation", label: "ED/Observation" },
        { value: "pharmacy", label: "Pharmacy" },
        { value: "professional", label: "Professional" },
        { value: "snf_postacute", label: "SNF/Post-Acute" },
        { value: "home_health", label: "Home Health" },
      ]},
      { key: "reduction_pct", label: "Reduction Target", type: "slider", min: 1, max: 30, step: 1, default: 10, suffix: "%" },
    ],
  },
  {
    value: "provider_education",
    label: "Provider Performance Improvement",
    params: [],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenarioBuilder({ onRun, loading }: ScenarioBuilderProps) {
  const [selectedType, setSelectedType] = useState(SCENARIO_TYPES[0].value);
  const scenarioDef = SCENARIO_TYPES.find((s) => s.value === selectedType) || SCENARIO_TYPES[0];

  const defaults: Record<string, number | string> = {};
  scenarioDef.params.forEach((p) => { defaults[p.key] = p.default; });
  const [params, setParams] = useState<Record<string, number | string>>(defaults);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const def = SCENARIO_TYPES.find((s) => s.value === type);
    if (def) {
      const newDefaults: Record<string, number | string> = {};
      def.params.forEach((p) => { newDefaults[p.key] = p.default; });
      setParams(newDefaults);
    }
  };

  const handleParamChange = (key: string, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="rounded-[10px] border p-6" style={{ borderColor: tokens.border, background: tokens.surface }}>
      <h3
        className="text-[15px] font-semibold mb-4"
        style={{ color: tokens.text, fontFamily: fonts.heading }}
      >
        Custom Scenario Builder
      </h3>

      {/* Type selector */}
      <div className="mb-5">
        <label className="text-[11px] font-medium uppercase tracking-wider block mb-1.5" style={{ color: tokens.textMuted }}>
          Scenario Type
        </label>
        <select
          value={selectedType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-[13px]"
          style={{
            borderColor: tokens.border,
            color: tokens.text,
            background: tokens.surface,
            fontFamily: fonts.body,
          }}
        >
          {SCENARIO_TYPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Parameters */}
      {scenarioDef.params.map((p) => (
        <div key={p.key} className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: tokens.textMuted }}>
              {p.label}
            </label>
            <span
              className="text-[13px] font-semibold"
              style={{ color: tokens.accent, fontFamily: fonts.code }}
            >
              {p.type === "select"
                ? p.options?.find((o) => o.value === params[p.key])?.label || params[p.key]
                : `${params[p.key]}${p.suffix || ""}`}
            </span>
          </div>

          {p.type === "slider" && (
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key] as number}
              onChange={(e) => handleParamChange(p.key, parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${tokens.accent} ${((Number(params[p.key]) - (p.min || 0)) / ((p.max || 100) - (p.min || 0))) * 100}%, ${tokens.surfaceAlt} ${((Number(params[p.key]) - (p.min || 0)) / ((p.max || 100) - (p.min || 0))) * 100}%)`,
                accentColor: tokens.accent,
              }}
            />
          )}

          {p.type === "select" && (
            <select
              value={params[p.key] as string}
              onChange={(e) => handleParamChange(p.key, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ borderColor: tokens.border, color: tokens.text, background: tokens.surface }}
            >
              {p.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}

          {p.type === "number" && (
            <input
              type="number"
              value={params[p.key] as number}
              onChange={(e) => handleParamChange(p.key, parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ borderColor: tokens.border, color: tokens.text, background: tokens.surface, fontFamily: fonts.code }}
            />
          )}
        </div>
      ))}

      {scenarioDef.params.length === 0 && (
        <p className="text-[12px] mb-4" style={{ color: tokens.textMuted }}>
          This scenario uses your current provider data with no additional parameters.
        </p>
      )}

      {/* Run button */}
      <button
        onClick={() => onRun(selectedType, params)}
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white transition-opacity"
        style={{ background: tokens.accent, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Running scenario..." : "Run Scenario"}
      </button>
    </div>
  );
}
