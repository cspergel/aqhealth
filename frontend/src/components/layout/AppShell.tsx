import { useState, useRef, useEffect } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { tokens, fonts } from "../../lib/tokens";
import { useGlobalFilter, type FilterOption } from "../../lib/filterContext";
import { AskBar } from "../query/AskBar";
import { DashboardPage } from "../../pages/DashboardPage";
import { IngestionPage } from "../../pages/IngestionPage";
import { SuspectsPage } from "../../pages/SuspectsPage";
import { ExpenditurePage } from "../../pages/ExpenditurePage";
import { ProvidersPage } from "../../pages/ProvidersPage";
import { CareGapsPage } from "../../pages/CareGapsPage";
import { GroupsPage } from "../../pages/GroupsPage";
import { PatternsPage } from "../../pages/PatternsPage";
import { JourneyPage } from "../../pages/JourneyPage";
import { FinancialPage } from "../../pages/FinancialPage";
import { CohortsPage } from "../../pages/CohortsPage";
import { PredictionsPage } from "../../pages/PredictionsPage";
import { ScenariosPage } from "../../pages/ScenariosPage";
import { CensusPage } from "../../pages/CensusPage";
import { AlertsPage } from "../../pages/AlertsPage";
import { ADTConfigPage } from "../../pages/ADTConfigPage";

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/census", label: "Census" },
  { path: "/alerts", label: "Alerts" },
  { path: "/suspects", label: "Suspect HCCs" },
  { path: "/expenditure", label: "Expenditure" },
  { path: "/financial", label: "Financial" },
  { path: "/predictions", label: "Predictions" },
  { path: "/scenarios", label: "Scenarios" },
  { path: "/providers", label: "Providers" },
  { path: "/groups", label: "Groups" },
  { path: "/cohorts", label: "Cohorts" },
  { path: "/intelligence", label: "Intelligence" },
  { path: "/care-gaps", label: "Care Gaps" },
  { path: "/journey", label: "Journey" },
  { path: "/ingestion", label: "Data" },
];

/* ------------------------------------------------------------------ */
/* Filter dropdown component                                          */
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
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full cursor-default select-none"
        style={{ background: tokens.accentSoft, color: tokens.accentText }}
      >
        {selected.name}
        <button
          onClick={onClear}
          className="ml-0.5 hover:opacity-70 leading-none"
          style={{ color: tokens.accentText }}
          aria-label={`Clear ${label} filter`}
        >
          &times;
        </button>
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] px-2 py-0.5 rounded border transition-colors hover:border-stone-300"
        style={{
          borderColor: tokens.border,
          color: tokens.textSecondary,
          background: tokens.surface,
        }}
      >
        {label} &#9662;
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-[60] rounded border shadow-sm max-h-52 overflow-y-auto min-w-[180px]"
          style={{ background: tokens.surface, borderColor: tokens.border }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onSelect(opt);
                setOpen(false);
              }}
              className="block w-full text-left text-[12px] px-3 py-1.5 hover:bg-stone-50 transition-colors"
              style={{ color: tokens.text }}
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
/* AppShell                                                           */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
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

        {/* Global Filters + User */}
        <div className="flex items-center gap-3">
          {/* Filter controls */}
          <div className="flex items-center gap-2">
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
                className="text-[10px] px-1.5 py-0.5 rounded hover:bg-stone-100 transition-colors"
                style={{ color: tokens.textMuted }}
              >
                Clear all
              </button>
            )}
          </div>

          <div className="w-px h-4" style={{ background: tokens.border }} />

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
          <Route path="/census" element={<CensusPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/adt-sources" element={<ADTConfigPage />} />
          <Route path="/suspects" element={<SuspectsPage />} />
          <Route path="/expenditure" element={<ExpenditurePage />} />
          <Route path="/providers/*" element={<ProvidersPage />} />
          <Route path="/groups/*" element={<GroupsPage />} />
          <Route path="/intelligence" element={<PatternsPage />} />
          <Route path="/care-gaps" element={<CareGapsPage />} />
          <Route path="/journey" element={<JourneyPage />} />
          <Route path="/journey/:memberId" element={<JourneyPage />} />
          <Route path="/financial" element={<FinancialPage />} />
          <Route path="/cohorts" element={<CohortsPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/ingestion" element={<IngestionPage />} />
        </Routes>
      </main>

      {/* Conversational AI Query Bar */}
      <AskBar pageContext={location.pathname} />
    </div>
  );
}
