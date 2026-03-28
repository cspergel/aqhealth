import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { tokens, fonts } from "../../lib/tokens";
import { mockCareAlerts, mockWatchlistItems } from "../../lib/mockData";
import { useAuth } from "../../lib/auth";
import { canAccessSection, canAccessPage } from "../../lib/roleAccess";

/* ------------------------------------------------------------------ */
/* Navigation structure                                                */
/* ------------------------------------------------------------------ */

interface NavItem {
  path: string;
  label: string;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const openAlertCount = mockCareAlerts.filter(
  (a) => a.status === "open" || a.status === "acknowledged" || a.status === "in_progress",
).length;

const watchlistChangeCount = mockWatchlistItems.filter((i) => i.has_changes).length;

const navSections: NavSection[] = [
  {
    title: "Clinical",
    items: [
      { path: "/clinical", label: "Patient View" },
    ],
  },
  {
    title: "Overview",
    items: [
      { path: "/", label: "Dashboard" },
      { path: "/census", label: "Live Census" },
      { path: "/alerts", label: "Alerts", badge: openAlertCount },
      { path: "/alert-rules", label: "Alert Rules" },
      { path: "/tcm", label: "TCM Cases" },
      { path: "/watchlist", label: "Watchlist", badge: watchlistChangeCount || undefined },
      { path: "/actions", label: "Actions" },
    ],
  },
  {
    title: "Population",
    items: [
      { path: "/members", label: "Members" },
      { path: "/cohorts", label: "Cohorts" },
      { path: "/attribution", label: "Attribution" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { path: "/suspects", label: "Suspect HCCs" },
      { path: "/predictions", label: "Predictions" },
    ],
  },
  {
    title: "Care Ops",
    items: [
      { path: "/care-plans", label: "Care Plans" },
      { path: "/case-management", label: "Case Management" },
      { path: "/prior-auth", label: "Prior Auth" },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "/utilization", label: "Utilization" },
      { path: "/avoidable", label: "Avoidable Analysis" },
    ],
  },
  {
    title: "Cost",
    items: [{ path: "/expenditure", label: "Expenditure" }],
  },
  {
    title: "Quality",
    items: [
      { path: "/care-gaps", label: "Care Gaps" },
      { path: "/awv", label: "AWV Tracking" },
      { path: "/stars", label: "Stars Simulator" },
      { path: "/radv", label: "RADV Readiness" },
    ],
  },
  {
    title: "Network",
    items: [
      { path: "/providers", label: "Providers" },
      { path: "/groups", label: "Groups" },
      { path: "/education", label: "Education" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { path: "/intelligence", label: "Intelligence" },
      { path: "/scenarios", label: "Scenarios" },
      { path: "/time-machine", label: "Time Machine" },
      { path: "/automation", label: "Automation" },
    ],
  },
  {
    title: "Finance",
    items: [
      { path: "/financial", label: "Financial" },
      { path: "/risk-accounting", label: "Risk Accounting" },
      { path: "/practice-costs", label: "Practice Costs" },
      { path: "/roi-tracker", label: "ROI Tracker" },
      { path: "/stoploss", label: "Stop-Loss" },
      { path: "/reports", label: "Reports" },
    ],
  },
  {
    title: "Data",
    items: [
      { path: "/ingestion", label: "Data Ingestion" },
      { path: "/integrations", label: "Integrations" },
      { path: "/adt-sources", label: "ADT Sources" },
      { path: "/ai-pipeline", label: "AI Pipeline" },
      { path: "/data-quality", label: "Data Quality" },
      { path: "/data-protection", label: "Data Protection" },
      { path: "/data-exchange", label: "Data Exchange" },
    ],
  },
  {
    title: "Admin",
    items: [
      { path: "/onboarding", label: "Setup Wizard" },
      { path: "/data-management", label: "Data Management" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Collapsible section state (persisted to localStorage)               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "aqsoft_sidebar_sections";

/** Sections expanded by default on first visit */
const DEFAULT_EXPANDED: Record<string, boolean> = {
  Clinical: true,
  Overview: true,
};

function loadSectionState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupt data
  }
  // First visit: expand defaults, collapse everything else
  const state: Record<string, boolean> = {};
  for (const section of navSections) {
    state[section.title] = DEFAULT_EXPANDED[section.title] ?? false;
  }
  return state;
}

function saveSectionState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full — ignore
  }
}

/* ------------------------------------------------------------------ */
/* Sidebar component                                                   */
/* ------------------------------------------------------------------ */

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const width = collapsed ? 60 : 240;
  const { user } = useAuth();
  const userRole = user?.role || "mso_admin";

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(loadSectionState);

  const toggleSection = useCallback((title: string) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      saveSectionState(next);
      return next;
    });
  }, []);

  // Filter sections and items based on role
  const filteredSections = useMemo(() => {
    return navSections
      .filter((section) => canAccessSection(userRole, section.title))
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canAccessPage(userRole, item.path)),
      }))
      .filter((section) => section.items.length > 0);
  }, [userRole]);

  return (
    <aside
      style={{
        width,
        minWidth: width,
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 40,
        background: "#ffffff",
        borderRight: `1px solid ${tokens.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        overflow: "hidden",
      }}
    >
      {/* Logo area */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 18px" : "0 20px",
          gap: 10,
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: tokens.accent,
            flexShrink: 0,
          }}
        />
        {!collapsed && (
          <span
            style={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 15,
              color: tokens.text,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            AQSoft Health
          </span>
        )}
      </div>

      {/* Nav sections */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: collapsed ? "8px 0" : "8px 0",
        }}
      >
        {filteredSections.map((section) => (
          <CollapsibleSection
            key={section.title}
            section={section}
            sidebarCollapsed={collapsed}
            expanded={expandedSections[section.title] ?? false}
            onToggle={() => toggleSection(section.title)}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "0" : "0 20px",
          gap: 8,
          borderTop: `1px solid ${tokens.border}`,
          background: "transparent",
          border: "none",
          borderTopWidth: 1,
          borderTopStyle: "solid",
          borderTopColor: tokens.border,
          cursor: "pointer",
          color: tokens.textMuted,
          fontSize: 12,
          width: "100%",
          flexShrink: 0,
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span style={{ fontSize: 14, lineHeight: 1, fontFamily: "monospace" }}>
          {collapsed ? "\u00BB" : "\u00AB"}
        </span>
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible section wrapper                                         */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  section,
  sidebarCollapsed,
  expanded,
  onToggle,
}: {
  section: NavSection;
  sidebarCollapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);

  // Measure the natural height of the items whenever they change
  useEffect(() => {
    if (contentRef.current) {
      setMeasuredHeight(contentRef.current.scrollHeight);
    }
  }, [section.items.length, expanded]);

  // When sidebar is fully collapsed, don't show expand/collapse — just the letter
  if (sidebarCollapsed) {
    return (
      <div style={{ marginBottom: 4 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: tokens.textMuted,
            padding: "14px 0 6px 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {section.title.charAt(0)}
        </div>
        {section.items.map((item) => (
          <SidebarNavItem key={item.path} item={item} collapsed={true} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Clickable section header */}
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: tokens.textMuted,
          padding: "14px 20px 6px 20px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textAlign: "left",
          transition: "color 150ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = tokens.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = tokens.textMuted;
        }}
        title={expanded ? `Collapse ${section.title}` : `Expand ${section.title}`}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            lineHeight: 1,
            transition: "transform 200ms ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          {"\u25B8"}
        </span>
        <span>{section.title}</span>
      </button>

      {/* Animated collapsible content */}
      <div
        style={{
          overflow: "hidden",
          transition: "max-height 200ms ease",
          maxHeight: expanded ? measuredHeight : 0,
        }}
      >
        <div ref={contentRef}>
          {section.items.map((item) => (
            <SidebarNavItem key={item.path} item={item} collapsed={false} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual nav item                                                 */
/* ------------------------------------------------------------------ */

function SidebarNavItem({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: 8,
        padding: collapsed ? "7px 0" : "7px 20px",
        paddingLeft: collapsed ? 0 : isActive ? 17 : 20,
        fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? tokens.text : tokens.textSecondary,
        background: isActive ? tokens.accentSoft : "transparent",
        borderLeft: isActive ? `3px solid ${tokens.accent}` : "3px solid transparent",
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        transition: "background 150ms, color 150ms",
        position: "relative",
      })}
      onMouseEnter={(e) => {
        const link = e.currentTarget;
        if (!link.classList.contains("active")) {
          link.style.background = tokens.surfaceAlt;
        }
      }}
      onMouseLeave={(e) => {
        const link = e.currentTarget;
        if (!link.classList.contains("active")) {
          link.style.background = "transparent";
        }
      }}
    >
      {collapsed ? (
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {item.label.charAt(0)}
        </span>
      ) : (
        <>
          <span>{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1,
                padding: "2px 6px",
                borderRadius: 9999,
                background: tokens.red,
                color: "#ffffff",
              }}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
