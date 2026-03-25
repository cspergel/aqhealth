import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { tokens, fonts } from "../../lib/tokens";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
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
import { MembersPage } from "../../pages/MembersPage";
import { WatchlistPage } from "../../pages/WatchlistPage";
import { ReportsPage } from "../../pages/ReportsPage";
import { ActionsPage } from "../../pages/ActionsPage";

/* ------------------------------------------------------------------ */
/* AppShell — sidebar + top bar + main content                         */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = sidebarCollapsed ? 60 : 240;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.bg,
        fontFamily: fonts.body,
      }}
    >
      {/* Fixed left sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      {/* Right-side wrapper (top bar + main content) */}
      <div
        style={{
          marginLeft: sidebarWidth,
          transition: "margin-left 200ms ease",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Slim top bar */}
        <TopBar />

        {/* Main content */}
        <main
          style={{
            flex: 1,
            maxWidth: 1440,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/census" element={<CensusPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/adt-sources" element={<ADTConfigPage />} />
            <Route path="/members" element={<MembersPage />} />
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
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/ingestion" element={<IngestionPage />} />
          </Routes>
        </main>

        {/* Conversational AI Query Bar — stays at bottom of main content */}
        <AskBar pageContext={location.pathname} />
      </div>
    </div>
  );
}
