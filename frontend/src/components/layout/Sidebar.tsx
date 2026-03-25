import { NavLink } from "react-router-dom";
import { tokens, fonts } from "../../lib/tokens";
import { mockCareAlerts, mockWatchlistItems } from "../../lib/mockData";

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
      { path: "/watchlist", label: "Watchlist", badge: watchlistChangeCount || undefined },
      { path: "/actions", label: "Actions" },
    ],
  },
  {
    title: "Population",
    items: [
      { path: "/members", label: "Members" },
      { path: "/cohorts", label: "Cohorts" },
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
    title: "Cost",
    items: [{ path: "/expenditure", label: "Expenditure" }],
  },
  {
    title: "Quality",
    items: [{ path: "/care-gaps", label: "Care Gaps" }],
  },
  {
    title: "Network",
    items: [
      { path: "/providers", label: "Providers" },
      { path: "/groups", label: "Groups" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { path: "/intelligence", label: "Intelligence" },
      { path: "/scenarios", label: "Scenarios" },
    ],
  },
  {
    title: "Finance",
    items: [
      { path: "/financial", label: "Financial" },
      { path: "/reports", label: "Reports" },
    ],
  },
  {
    title: "Data",
    items: [
      { path: "/ingestion", label: "Data Ingestion" },
      { path: "/adt-sources", label: "ADT Sources" },
    ],
  },
];

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
        {navSections.map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            {/* Section header */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: tokens.textMuted,
                padding: collapsed ? "14px 0 6px 0" : "14px 20px 6px 20px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textAlign: collapsed ? "center" : "left",
              }}
            >
              {collapsed ? section.title.charAt(0) : section.title}
            </div>

            {/* Nav items */}
            {section.items.map((item) => (
              <SidebarNavItem
                key={item.path}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </div>
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
