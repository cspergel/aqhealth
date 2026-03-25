import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FilterField {
  field: string;
  label: string;
  type: "number" | "enum" | "string" | "boolean";
  operators: string[];
  options?: string[];
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean | [number, number];
}

interface Props {
  condition: FilterCondition;
  fields: FilterField[];
  onChange: (updated: FilterCondition) => void;
  onRemove: () => void;
  showLogic: boolean;
  logic: "AND" | "OR";
  onToggleLogic: () => void;
}

/* ------------------------------------------------------------------ */
/* Operator labels                                                     */
/* ------------------------------------------------------------------ */

const operatorLabels: Record<string, string> = {
  ">=": "greater than or equal",
  "<=": "less than or equal",
  "=": "equals",
  "!=": "not equal",
  between: "between",
  contains: "contains",
  equals: "equals",
  starts_with: "starts with",
  not_contains: "does not contain",
  is: "is",
  is_not: "is not",
  in: "is one of",
  is_true: "is true",
  is_false: "is false",
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: tokens.surface,
  borderRadius: 8,
  border: `1px solid ${tokens.border}`,
  transition: "border-color 150ms",
};

const selectStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: `1px solid ${tokens.border}`,
  fontSize: 12,
  fontFamily: fonts.body,
  background: tokens.bg,
  color: tokens.text,
  cursor: "pointer",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: `1px solid ${tokens.border}`,
  fontSize: 12,
  fontFamily: fonts.code,
  background: tokens.bg,
  color: tokens.text,
  width: 90,
  outline: "none",
};

const removeStyle: React.CSSProperties = {
  padding: "2px 6px",
  borderRadius: 4,
  border: "none",
  background: "transparent",
  color: tokens.textMuted,
  fontSize: 14,
  cursor: "pointer",
  lineHeight: 1,
  transition: "color 150ms",
};

const logicPillStyle = (active: boolean): React.CSSProperties => ({
  padding: "2px 10px",
  borderRadius: 9999,
  border: `1px solid ${active ? tokens.accent : tokens.border}`,
  background: active ? tokens.accentSoft : "transparent",
  color: active ? tokens.accentText : tokens.textMuted,
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.04em",
  fontFamily: fonts.body,
  textTransform: "uppercase" as const,
  transition: "all 150ms",
  alignSelf: "center" as const,
});

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FilterConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
  showLogic,
  logic,
  onToggleLogic,
}: Props) {
  const selectedField = fields.find((f) => f.field === condition.field);
  const operators = selectedField?.operators || [];
  const fieldType = selectedField?.type || "string";

  const handleFieldChange = (newField: string) => {
    const fd = fields.find((f) => f.field === newField);
    const newOps = fd?.operators || [];
    const defaultOp = newOps[0] || "=";
    let defaultValue: string | number | boolean = "";
    if (fd?.type === "number") defaultValue = 0;
    if (fd?.type === "boolean") defaultValue = true;
    if (fd?.type === "enum" && fd.options?.length) defaultValue = fd.options[0];
    onChange({ ...condition, field: newField, operator: defaultOp, value: defaultValue });
  };

  const handleOperatorChange = (op: string) => {
    let newValue = condition.value;
    if (op === "between" && !Array.isArray(newValue)) {
      newValue = [0, 100];
    } else if (op === "is_true") {
      newValue = true;
    } else if (op === "is_false") {
      newValue = false;
    }
    onChange({ ...condition, operator: op, value: newValue });
  };

  const handleValueChange = (val: string | number | boolean) => {
    onChange({ ...condition, value: val });
  };

  /* Render value input based on field type + operator */
  const renderValueInput = () => {
    if (condition.operator === "is_true" || condition.operator === "is_false") {
      return null; // No value needed
    }

    if (condition.operator === "between" && Array.isArray(condition.value)) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="number"
            value={condition.value[0]}
            onChange={(e) =>
              onChange({
                ...condition,
                value: [parseFloat(e.target.value) || 0, (condition.value as [number, number])[1]],
              })
            }
            style={{ ...inputStyle, width: 65 }}
          />
          <span style={{ fontSize: 11, color: tokens.textMuted }}>to</span>
          <input
            type="number"
            value={condition.value[1]}
            onChange={(e) =>
              onChange({
                ...condition,
                value: [(condition.value as [number, number])[0], parseFloat(e.target.value) || 0],
              })
            }
            style={{ ...inputStyle, width: 65 }}
          />
        </div>
      );
    }

    if (fieldType === "enum" && selectedField?.options) {
      return (
        <select
          value={String(condition.value)}
          onChange={(e) => handleValueChange(e.target.value)}
          style={{ ...selectStyle, minWidth: 120 }}
        >
          {selectedField.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (fieldType === "number") {
      return (
        <input
          type="number"
          value={condition.value as number}
          onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
      );
    }

    return (
      <input
        type="text"
        value={String(condition.value)}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Value..."
        style={{ ...inputStyle, width: 140 }}
      />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Logic toggle between rows */}
      {showLogic && (
        <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
          <button
            onClick={onToggleLogic}
            style={logicPillStyle(true)}
            title="Click to toggle AND/OR"
          >
            {logic}
          </button>
        </div>
      )}

      {/* Condition row */}
      <div style={rowStyle}>
        {/* Field selector */}
        <select
          value={condition.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          style={{ ...selectStyle, minWidth: 130, fontWeight: 500 }}
        >
          <option value="" disabled>
            Select field...
          </option>
          {fields.map((f) => (
            <option key={f.field} value={f.field}>
              {f.label}
            </option>
          ))}
        </select>

        {/* Operator selector */}
        <select
          value={condition.operator}
          onChange={(e) => handleOperatorChange(e.target.value)}
          style={{ ...selectStyle, minWidth: 100 }}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {operatorLabels[op] || op}
            </option>
          ))}
        </select>

        {/* Value input */}
        {renderValueInput()}

        {/* Remove button */}
        <button
          onClick={onRemove}
          style={removeStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = tokens.red;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = tokens.textMuted;
          }}
          title="Remove condition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
