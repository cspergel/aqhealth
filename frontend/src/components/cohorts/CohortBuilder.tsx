import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterRow {
  id: number;
  category: string;
  field: string;
  value: string;
}

interface CohortBuilderProps {
  onBuild: (filters: Record<string, unknown>) => void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

const FILTER_CATEGORIES = [
  {
    label: "Demographics",
    fields: [
      { key: "age_min", label: "Age (min)", type: "number" },
      { key: "age_max", label: "Age (max)", type: "number" },
      { key: "gender", label: "Gender", type: "select", options: ["M", "F"] },
    ],
  },
  {
    label: "Clinical",
    fields: [
      { key: "diagnoses_include", label: "Has Diagnosis (ICD-10)", type: "text" },
      { key: "diagnoses_exclude", label: "Does Not Have Diagnosis", type: "text" },
      { key: "medications", label: "Medication", type: "text" },
      { key: "risk_tier", label: "Risk Tier", type: "select", options: ["high", "medium", "low"] },
    ],
  },
  {
    label: "Utilization",
    fields: [
      { key: "er_visits_min", label: "ER Visits (min)", type: "number" },
      { key: "admissions_min", label: "Admissions (min)", type: "number" },
      { key: "raf_min", label: "RAF Score (min)", type: "number" },
      { key: "raf_max", label: "RAF Score (max)", type: "number" },
    ],
  },
  {
    label: "Quality",
    fields: [
      { key: "care_gaps", label: "Open Care Gap", type: "text" },
      { key: "suspect_hccs", label: "Suspect HCC", type: "text" },
    ],
  },
];

const allFields = FILTER_CATEGORIES.flatMap((c) =>
  c.fields.map((f) => ({ ...f, category: c.label }))
);

let nextFilterId = 1;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CohortBuilder({ onBuild, loading }: CohortBuilderProps) {
  const [filters, setFilters] = useState<FilterRow[]>([
    { id: nextFilterId++, category: "Demographics", field: "age_min", value: "65" },
    { id: nextFilterId++, category: "Clinical", field: "diagnoses_include", value: "E11" },
    { id: nextFilterId++, category: "Utilization", field: "er_visits_min", value: "2" },
  ]);

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { id: nextFilterId++, category: "Demographics", field: "age_min", value: "" },
    ]);
  };

  const removeFilter = (id: number) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFilter = (id: number, updates: Partial<FilterRow>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleBuild = () => {
    const filterObj: Record<string, unknown> = {};
    for (const f of filters) {
      if (!f.value) continue;
      const fieldDef = allFields.find((af) => af.key === f.field);
      if (!fieldDef) continue;

      if (fieldDef.type === "number") {
        filterObj[f.field] = parseFloat(f.value);
      } else if (["diagnoses_include", "diagnoses_exclude", "medications", "care_gaps", "suspect_hccs"].includes(f.field)) {
        // Array fields — split by comma or push
        const existing = filterObj[f.field];
        if (Array.isArray(existing)) {
          existing.push(f.value.trim());
        } else {
          filterObj[f.field] = [f.value.trim()];
        }
      } else {
        filterObj[f.field] = f.value;
      }
    }
    onBuild(filterObj);
  };

  return (
    <div
      className="rounded-xl border bg-white p-6"
      style={{ borderColor: tokens.border }}
    >
      <h2
        className="text-[15px] font-bold tracking-tight mb-1"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        Build Cohort
      </h2>
      <p className="text-[12px] mb-5" style={{ color: tokens.textMuted }}>
        Define filter criteria to segment your population
      </p>

      {/* Filter rows */}
      <div className="space-y-2 mb-4">
        {filters.map((f, idx) => {
          const fieldDef = allFields.find((af) => af.key === f.field);
          return (
            <div
              key={f.id}
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ background: idx % 2 === 0 ? tokens.surfaceAlt : "transparent" }}
            >
              {/* Category / Field selector */}
              <select
                value={f.field}
                onChange={(e) => {
                  const newField = e.target.value;
                  const cat = allFields.find((af) => af.key === newField);
                  updateFilter(f.id, {
                    field: newField,
                    category: cat?.category || f.category,
                    value: "",
                  });
                }}
                className="text-[12px] rounded-md border px-2 py-1.5 min-w-[180px]"
                style={{
                  borderColor: tokens.border,
                  color: tokens.text,
                  background: tokens.surface,
                  fontFamily: fonts.body,
                }}
              >
                {FILTER_CATEGORIES.map((cat) => (
                  <optgroup key={cat.label} label={cat.label}>
                    {cat.fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Value input */}
              {fieldDef?.type === "select" ? (
                <select
                  value={f.value}
                  onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  className="text-[12px] rounded-md border px-2 py-1.5 flex-1"
                  style={{
                    borderColor: tokens.border,
                    color: tokens.text,
                    background: tokens.surface,
                    fontFamily: fonts.body,
                  }}
                >
                  <option value="">Select...</option>
                  {(fieldDef as { options?: string[] }).options?.map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={fieldDef?.type === "number" ? "number" : "text"}
                  value={f.value}
                  onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  placeholder={
                    fieldDef?.type === "number" ? "Enter value" :
                    fieldDef?.key?.includes("diagnos") ? "e.g. E11, I50" :
                    fieldDef?.key?.includes("care_gap") ? "e.g. CDC-HbA1c" :
                    fieldDef?.key?.includes("suspect") ? "e.g. HCC 18" :
                    "Enter value"
                  }
                  className="text-[12px] rounded-md border px-2 py-1.5 flex-1"
                  style={{
                    borderColor: tokens.border,
                    color: tokens.text,
                    background: tokens.surface,
                    fontFamily: fonts.code,
                  }}
                />
              )}

              {/* Remove */}
              <button
                onClick={() => removeFilter(f.id)}
                className="text-[12px] px-2 py-1 rounded hover:bg-red-50 transition-colors"
                style={{ color: tokens.red }}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={addFilter}
          className="text-[12px] px-3 py-1.5 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          + Add Filter
        </button>
        <button
          onClick={handleBuild}
          disabled={loading}
          className="text-[12px] px-5 py-1.5 rounded-md font-semibold text-white transition-colors disabled:opacity-50"
          style={{ background: tokens.accent }}
        >
          {loading ? "Building..." : "Build Cohort"}
        </button>
      </div>
    </div>
  );
}
