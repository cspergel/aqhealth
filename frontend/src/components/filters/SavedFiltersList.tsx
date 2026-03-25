import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SavedFilter {
  id: number;
  name: string;
  description: string | null;
  page_context: string;
  conditions: {
    logic: "AND" | "OR";
    rules: Array<{
      field: string;
      operator: string;
      value: string | number | boolean | [number, number];
      logic?: "AND" | "OR";
      rules?: Array<unknown>;
    }>;
  };
  created_by: number;
  is_shared: boolean;
  is_system: boolean;
  use_count: number;
  last_used: string | null;
  category?: string;
  category_color?: string;
  category_soft_color?: string;
  is_favorite?: boolean;
}

interface Props {
  filters: SavedFilter[];
  activeFilterId: number | null;
  onApply: (filter: SavedFilter) => void;
  onDelete: (filterId: number) => void;
  onToggleFavorite?: (filterId: number) => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SavedFiltersList({
  filters,
  activeFilterId,
  onApply,
  onDelete,
  onToggleFavorite,
}: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  if (filters.length === 0) return null;

  // Group: system presets first, then user/shared
  const systemFilters = filters.filter((f) => f.is_system);
  const userFilters = filters.filter((f) => !f.is_system);

  // Group system filters by category
  const categorized = new Map<string, SavedFilter[]>();
  systemFilters.forEach((f) => {
    const cat = f.category || "Other";
    if (!categorized.has(cat)) categorized.set(cat, []);
    categorized.get(cat)!.push(f);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* System presets by category */}
      {Array.from(categorized.entries()).map(([category, catFilters]) => (
        <div
          key={category}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: catFilters[0]?.category_color || tokens.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              width: 70,
              flexShrink: 0,
            }}
          >
            {category}
          </span>
          {catFilters.map((f) => (
            <FilterChip
              key={f.id}
              filter={f}
              isActive={activeFilterId === f.id}
              isHovered={hoveredId === f.id}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onApply(f)}
              onDelete={undefined}
              onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(f.id) : undefined}
            />
          ))}
        </div>
      ))}

      {/* User-created / shared filters */}
      {userFilters.length > 0 && (
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: tokens.blue,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              width: 70,
              flexShrink: 0,
            }}
          >
            Saved
          </span>
          {userFilters.map((f) => (
            <FilterChip
              key={f.id}
              filter={f}
              isActive={activeFilterId === f.id}
              isHovered={hoveredId === f.id}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onApply(f)}
              onDelete={() => onDelete(f.id)}
              onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(f.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FilterChip subcomponent                                             */
/* ------------------------------------------------------------------ */

function FilterChip({
  filter,
  isActive,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDelete,
  onToggleFavorite,
}: {
  filter: SavedFilter;
  isActive: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onDelete: (() => void) | undefined;
  onToggleFavorite: (() => void) | undefined;
}) {
  const accentColor = filter.category_color || tokens.accentText;
  const softColor = filter.category_soft_color || tokens.accentSoft;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={onClick}
        style={{
          padding: "5px 14px",
          paddingRight: onDelete && isHovered ? 28 : 14,
          borderRadius: 9999,
          border: isActive ? `1.5px solid ${accentColor}` : `1px solid ${tokens.border}`,
          background: isActive ? accentColor : softColor,
          color: isActive ? "#fff" : accentColor,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 150ms",
          fontFamily: fonts.body,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        title={filter.description || filter.name}
      >
        {/* Favorite star */}
        {onToggleFavorite && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={{
              fontSize: 11,
              cursor: "pointer",
              opacity: filter.is_favorite ? 1 : 0.4,
              transition: "opacity 150ms",
            }}
          >
            {filter.is_favorite ? "\u2605" : "\u2606"}
          </span>
        )}
        {filter.is_shared && !filter.is_system && (
          <span style={{ fontSize: 10, opacity: 0.7 }} title="Shared filter">
            {"\uD83D\uDC65"}
          </span>
        )}
        {filter.name}
      </button>

      {/* Delete button on hover for non-system */}
      {onDelete && isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            padding: "1px 4px",
            borderRadius: 9999,
            border: "none",
            background: "transparent",
            color: tokens.textMuted,
            fontSize: 12,
            cursor: "pointer",
            lineHeight: 1,
          }}
          title="Delete filter"
        >
          ×
        </button>
      )}
    </div>
  );
}
