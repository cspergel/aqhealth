import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { tokens } from "../../lib/tokens";
import { useGlobalFilter, type FilterOption } from "../../lib/filterContext";
import { ALL_ROLES, ROLE_LABELS } from "../../lib/roleAccess";

/* ------------------------------------------------------------------ */
/* Filter dropdown (reused from old AppShell, lightly restyled)        */
/* ------------------------------------------------------------------ */

function FilterDropdown({
  label,
  options,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: FilterOption | null;
  onSelect: (opt: FilterOption) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 500,
          padding: "2px 8px",
          borderRadius: 9999,
          background: tokens.accentSoft,
          color: tokens.accentText,
          cursor: "default",
          userSelect: "none",
        }}
      >
        {selected.name}
        <button
          onClick={onClear}
          style={{
            marginLeft: 2,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: tokens.accentText,
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label={`Clear ${label} filter`}
        >
          &times;
        </button>
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          border: `1px solid ${tokens.border}`,
          color: tokens.textSecondary,
          background: tokens.surface,
          cursor: "pointer",
          transition: "border-color 150ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#d6d3d1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = tokens.border;
        }}
      >
        {label} &#9662;
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            zIndex: 60,
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            maxHeight: 208,
            overflowY: "auto",
            minWidth: 180,
            background: tokens.surface,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onSelect(opt);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: tokens.text,
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TopBar component                                                    */
/* ------------------------------------------------------------------ */

export function TopBar() {
  const { user, logout, isDemo, setDemoRole } = useAuth();
  const {
    selectedGroup,
    selectedProvider,
    setGroup,
    setProvider,
    clearFilters,
    availableGroups,
    availableProviders,
  } = useGlobalFilter();

  const hasActiveFilter = selectedGroup !== null || selectedProvider !== null;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: tokens.surface,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      {/* Left side: filter controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FilterDropdown
          label="All Offices"
          options={availableGroups}
          selected={selectedGroup}
          onSelect={(g) => setGroup(g)}
          onClear={() => setGroup(null)}
        />
        <FilterDropdown
          label="All Providers"
          options={availableProviders}
          selected={selectedProvider}
          onSelect={(p) => setProvider(p)}
          onClear={() => setProvider(null)}
        />
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: tokens.textMuted,
              transition: "background 100ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.surfaceAlt;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Right side: user info + role switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isDemo && (
          <RoleSwitcher
            currentRole={user?.role || "mso_admin"}
            onRoleChange={setDemoRole}
          />
        )}
        <span style={{ fontSize: 12, color: tokens.textMuted }}>
          {user?.full_name}
        </span>
        <button
          onClick={logout}
          style={{
            fontSize: 12,
            padding: "4px 12px",
            borderRadius: 4,
            border: `1px solid ${tokens.border}`,
            background: "transparent",
            color: tokens.textSecondary,
            cursor: "pointer",
            transition: "background 100ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tokens.surfaceAlt;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Role Switcher — demo-only dropdown for switching between roles       */
/* ------------------------------------------------------------------ */

function RoleSwitcher({
  currentRole,
  onRoleChange,
}: {
  currentRole: string;
  onRoleChange: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 11,
          padding: "2px 10px",
          borderRadius: 4,
          border: `1px solid ${tokens.accent}`,
          color: tokens.accentText,
          background: tokens.accentSoft,
          cursor: "pointer",
          fontWeight: 500,
          transition: "background 150ms",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.accent;
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = tokens.accentSoft;
          e.currentTarget.style.color = tokens.accentText;
        }}
      >
        Viewing as: {ROLE_LABELS[currentRole] || currentRole} &#9662;
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            zIndex: 60,
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            minWidth: 160,
            background: tokens.surface,
          }}
        >
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                onRoleChange(role);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "6px 12px",
                background: role === currentRole ? tokens.accentSoft : "transparent",
                border: "none",
                cursor: "pointer",
                color: role === currentRole ? tokens.accentText : tokens.text,
                fontWeight: role === currentRole ? 600 : 400,
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  role === currentRole ? tokens.accentSoft : "transparent";
              }}
            >
              {ROLE_LABELS[role] || role}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
