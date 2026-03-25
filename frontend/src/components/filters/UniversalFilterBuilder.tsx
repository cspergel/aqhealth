import { useState, useEffect, useCallback } from "react";
import { tokens, fonts } from "../../lib/tokens";
import api from "../../lib/api";
import { FilterConditionRow, type FilterCondition, type FilterField } from "./FilterConditionRow";
import { SavedFiltersList, type SavedFilter } from "./SavedFiltersList";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FilterConditions {
  logic: "AND" | "OR";
  rules: Array<{
    field: string;
    operator: string;
    value: string | number | boolean | [number, number];
  }>;
}

interface Props {
  pageContext: string;
  onApply: (conditions: FilterConditions | null) => void;
  savedFilters?: SavedFilter[];
  onSaveFilter?: (name: string, description: string, conditions: FilterConditions, isShared: boolean) => void;
  onDeleteFilter?: (filterId: number) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let nextId = 1;
const makeId = () => `cond_${nextId++}`;

function createEmptyCondition(fields: FilterField[]): FilterCondition {
  const first = fields[0];
  let defaultValue: string | number | boolean = "";
  if (first?.type === "number") defaultValue = 0;
  if (first?.type === "boolean") defaultValue = true;
  if (first?.type === "enum" && first.options?.length) defaultValue = first.options[0];
  return {
    id: makeId(),
    field: first?.field || "",
    operator: first?.operators[0] || "=",
    value: defaultValue,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function UniversalFilterBuilder({
  pageContext,
  onApply,
  savedFilters = [],
  onSaveFilter,
  onDeleteFilter,
}: Props) {
  const [fields, setFields] = useState<FilterField[]>([]);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<number | null>(null);

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveShared, setSaveShared] = useState(false);

  // Fetch available fields
  useEffect(() => {
    api
      .get<FilterField[]>("/api/filters/fields", { params: { context: pageContext } })
      .then((res) => setFields(res.data))
      .catch(() => {});
  }, [pageContext]);

  // Build conditions object
  const buildConditions = useCallback((): FilterConditions | null => {
    const activeRules = conditions.filter((c) => c.field);
    if (activeRules.length === 0) return null;
    return {
      logic,
      rules: activeRules.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
      })),
    };
  }, [conditions, logic]);

  // Add a new condition row
  const addCondition = () => {
    if (fields.length === 0) return;
    setConditions((prev) => [...prev, createEmptyCondition(fields)]);
    if (!isExpanded) setIsExpanded(true);
  };

  // Update a condition
  const updateCondition = (index: number, updated: FilterCondition) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? updated : c)));
    setActiveFilterId(null); // Clear active preset when editing
  };

  // Remove a condition
  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    setActiveFilterId(null);
  };

  // Toggle logic
  const toggleLogic = () => setLogic((l) => (l === "AND" ? "OR" : "AND"));

  // Apply the filter
  const handleApply = () => {
    const conds = buildConditions();
    onApply(conds);
  };

  // Clear all
  const handleClear = () => {
    setConditions([]);
    setActiveFilterId(null);
    onApply(null);
  };

  // Apply a saved filter
  const handleApplySaved = (filter: SavedFilter) => {
    const conds = filter.conditions;
    if (conds && conds.rules) {
      setLogic(conds.logic || "AND");
      setConditions(
        conds.rules.map((r) => ({
          id: makeId(),
          field: r.field as string,
          operator: r.operator as string,
          value: r.value as string | number | boolean | [number, number],
        }))
      );
      setIsExpanded(true);
    }
    setActiveFilterId(filter.id);
    onApply(conds as FilterConditions);
  };

  // Save dialog
  const handleSave = () => {
    const conds = buildConditions();
    if (!conds || !saveName.trim()) return;
    onSaveFilter?.(saveName.trim(), saveDescription.trim(), conds, saveShared);
    setShowSaveDialog(false);
    setSaveName("");
    setSaveDescription("");
    setSaveShared(false);
  };

  const hasConditions = conditions.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Saved filters list */}
      {savedFilters.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            background: tokens.surface,
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
          }}
        >
          <SavedFiltersList
            filters={savedFilters}
            activeFilterId={activeFilterId}
            onApply={handleApplySaved}
            onDelete={(id) => onDeleteFilter?.(id)}
          />
        </div>
      )}

      {/* Custom filter controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => {
            if (!isExpanded && conditions.length === 0) addCondition();
            else setIsExpanded(!isExpanded);
          }}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            border: `1px solid ${hasConditions ? tokens.accent : tokens.border}`,
            background: hasConditions ? tokens.accentSoft : tokens.surface,
            color: hasConditions ? tokens.accentText : tokens.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: fonts.body,
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 150ms",
          }}
        >
          <span style={{ fontSize: 10 }}>
            {isExpanded ? "\u25BC" : "\u25B6"}
          </span>
          {hasConditions
            ? `Custom Filter (${conditions.length} rule${conditions.length > 1 ? "s" : ""})`
            : "Custom Filter"}
        </button>

        {hasConditions && (
          <>
            <button
              onClick={handleApply}
              style={{
                padding: "5px 16px",
                borderRadius: 6,
                border: "none",
                background: tokens.accent,
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: fonts.body,
                transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Apply
            </button>

            {onSaveFilter && (
              <button
                onClick={() => setShowSaveDialog(true)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: `1px solid ${tokens.border}`,
                  background: tokens.surface,
                  color: tokens.textSecondary,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: fonts.body,
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = tokens.surfaceAlt;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = tokens.surface;
                }}
              >
                Save Filter
              </button>
            )}

            <button
              onClick={handleClear}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                background: "transparent",
                color: tokens.textMuted,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: fonts.body,
                transition: "color 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = tokens.red;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = tokens.textMuted;
              }}
            >
              Clear All
            </button>
          </>
        )}
      </div>

      {/* Expanded filter builder */}
      {isExpanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "12px 16px",
            background: tokens.surface,
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
          }}
        >
          {/* Condition rows */}
          {conditions.map((cond, index) => (
            <FilterConditionRow
              key={cond.id}
              condition={cond}
              fields={fields}
              onChange={(updated) => updateCondition(index, updated)}
              onRemove={() => removeCondition(index)}
              showLogic={index > 0}
              logic={logic}
              onToggleLogic={toggleLogic}
            />
          ))}

          {/* Add buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              onClick={addCondition}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: `1px dashed ${tokens.border}`,
                background: "transparent",
                color: tokens.textMuted,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: fonts.body,
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = tokens.accent;
                e.currentTarget.style.color = tokens.accentText;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = tokens.border;
                e.currentTarget.style.color = tokens.textMuted;
              }}
            >
              + Add Condition
            </button>
          </div>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div
          style={{
            padding: "16px",
            background: tokens.surface,
            borderRadius: 8,
            border: `1px solid ${tokens.accent}`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: tokens.text,
              fontFamily: fonts.heading,
            }}
          >
            Save Custom Filter
          </span>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Filter name..."
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              fontSize: 13,
              fontFamily: fonts.body,
              outline: "none",
              background: tokens.bg,
            }}
            autoFocus
          />
          <input
            type="text"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Description (optional)..."
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              fontSize: 13,
              fontFamily: fonts.body,
              outline: "none",
              background: tokens.bg,
            }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: tokens.textSecondary,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={saveShared}
              onChange={(e) => setSaveShared(e.target.checked)}
              style={{ accentColor: tokens.accent }}
            />
            Share with team
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                background: saveName.trim() ? tokens.accent : tokens.surfaceAlt,
                color: saveName.trim() ? "#fff" : tokens.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: saveName.trim() ? "pointer" : "default",
                fontFamily: fonts.body,
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
                setSaveName("");
                setSaveDescription("");
                setSaveShared(false);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: `1px solid ${tokens.border}`,
                background: "transparent",
                color: tokens.textSecondary,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: fonts.body,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
