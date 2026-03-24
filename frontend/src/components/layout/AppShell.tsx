import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { tokens, fonts } from "../../lib/tokens";
import { AskBar } from "../query/AskBar";
import { DashboardPage } from "../../pages/DashboardPage";
import { IngestionPage } from "../../pages/IngestionPage";
import { SuspectsPage } from "../../pages/SuspectsPage";
import { ExpenditurePage } from "../../pages/ExpenditurePage";
import { ProvidersPage } from "../../pages/ProvidersPage";
import { CareGapsPage } from "../../pages/CareGapsPage";
import { GroupsPage } from "../../pages/GroupsPage";
import { PatternsPage } from "../../pages/PatternsPage";

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/suspects", label: "Suspect HCCs" },
  { path: "/expenditure", label: "Expenditure" },
  { path: "/providers", label: "Providers" },
  { path: "/groups", label: "Groups" },
  { path: "/intelligence", label: "Intelligence" },
  { path: "/care-gaps", label: "Care Gaps" },
  { path: "/ingestion", label: "Data" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen" style={{ background: tokens.bg, fontFamily: fonts.body }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-7 py-3"
        style={{ background: tokens.surface, borderBottom: `1px solid ${tokens.border}` }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
            <span
              className="font-bold text-[15px] tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              AQSoft Health
            </span>
          </div>
          <div className="w-px h-5" style={{ background: tokens.border }} />
          <nav className="flex items-center gap-5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `text-[13px] pb-0.5 border-b-2 transition-colors ${
                    isActive ? "font-semibold" : "font-normal"
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? tokens.text : tokens.textMuted,
                  borderBottomColor: isActive ? tokens.accent : "transparent",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: tokens.textMuted }}>
            {user?.full_name}
          </span>
          <button
            onClick={logout}
            className="text-xs px-3 py-1 rounded border"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-[1440px] mx-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/suspects" element={<SuspectsPage />} />
          <Route path="/expenditure" element={<ExpenditurePage />} />
          <Route path="/providers/*" element={<ProvidersPage />} />
          <Route path="/groups/*" element={<GroupsPage />} />
          <Route path="/intelligence" element={<PatternsPage />} />
          <Route path="/care-gaps" element={<CareGapsPage />} />
          <Route path="/ingestion" element={<IngestionPage />} />
        </Routes>
      </main>

      {/* Conversational AI Query Bar */}
      <AskBar pageContext={location.pathname} />
    </div>
  );
}
