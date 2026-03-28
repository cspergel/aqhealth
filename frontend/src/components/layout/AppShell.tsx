import { useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import { ClinicalPage } from "../../pages/ClinicalPage";
import { DataQualityPage } from "../../pages/DataQualityPage";
import { TCMPage } from "../../pages/TCMPage";
import { RADVPage } from "../../pages/RADVPage";
import { AttributionPage } from "../../pages/AttributionPage";
import { StopLossPage } from "../../pages/StopLossPage";
import { EducationPage } from "../../pages/EducationPage";
import { AWVPage } from "../../pages/AWVPage";
import { StarsSimulatorPage } from "../../pages/StarsSimulatorPage";
import { TemporalPage } from "../../pages/TemporalPage";
import { AlertRulesPage } from "../../pages/AlertRulesPage";
import { PracticeExpensesPage } from "../../pages/PracticeExpensesPage";
import { BOIPage } from "../../pages/BOIPage";
import { ClinicalExchangePage } from "../../pages/ClinicalExchangePage";
import { RiskAccountingPage } from "../../pages/RiskAccountingPage";
import { CarePlansPage } from "../../pages/CarePlansPage";
import { CaseManagementPage } from "../../pages/CaseManagementPage";
import { PriorAuthPage } from "../../pages/PriorAuthPage";
import { UtilizationPage } from "../../pages/UtilizationPage";
import { AvoidablePage } from "../../pages/AvoidablePage";
import { InterfacesPage } from "../../pages/InterfacesPage";
import { AIPipelinePage } from "../../pages/AIPipelinePage";
import { SkillsPage } from "../../pages/SkillsPage";
import { DataProtectionPage } from "../../pages/DataProtectionPage";
import { OnboardingPage } from "../../pages/OnboardingPage";

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
            <Route path="/clinical" element={<ClinicalPage />} />
            <Route path="/clinical/:memberId" element={<ClinicalPage />} />
            <Route path="/" element={<DashboardPage />} />
            <Route path="/census" element={<CensusPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/alert-rules" element={<AlertRulesPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/adt-sources" element={<ADTConfigPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/suspects" element={<SuspectsPage />} />
            <Route path="/expenditure" element={<ExpenditurePage />} />
            <Route path="/providers/*" element={<ProvidersPage />} />
            <Route path="/groups/*" element={<GroupsPage />} />
            <Route path="/intelligence" element={<PatternsPage />} />
            <Route path="/care-gaps" element={<CareGapsPage />} />
            <Route path="/awv" element={<AWVPage />} />
            <Route path="/stars" element={<StarsSimulatorPage />} />
            <Route path="/journey" element={<JourneyPage />} />
            <Route path="/journey/:memberId" element={<JourneyPage />} />
            <Route path="/financial" element={<FinancialPage />} />
            <Route path="/cohorts" element={<CohortsPage />} />
            <Route path="/predictions" element={<PredictionsPage />} />
            <Route path="/scenarios" element={<ScenariosPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/ingestion" element={<IngestionPage />} />
            <Route path="/data-quality" element={<DataQualityPage />} />
            <Route path="/tcm" element={<TCMPage />} />
            <Route path="/radv" element={<RADVPage />} />
            <Route path="/attribution" element={<AttributionPage />} />
            <Route path="/stoploss" element={<StopLossPage />} />
            <Route path="/education" element={<EducationPage />} />
            <Route path="/time-machine" element={<TemporalPage />} />
            <Route path="/practice-costs" element={<PracticeExpensesPage />} />
            <Route path="/roi-tracker" element={<BOIPage />} />
            <Route path="/data-exchange" element={<ClinicalExchangePage />} />
            <Route path="/risk-accounting" element={<RiskAccountingPage />} />
            <Route path="/care-plans" element={<CarePlansPage />} />
            <Route path="/case-management" element={<CaseManagementPage />} />
            <Route path="/prior-auth" element={<PriorAuthPage />} />
            <Route path="/utilization" element={<UtilizationPage />} />
            <Route path="/avoidable" element={<AvoidablePage />} />
            <Route path="/integrations" element={<InterfacesPage />} />
            <Route path="/ai-pipeline" element={<AIPipelinePage />} />
            <Route path="/automation" element={<SkillsPage />} />
            <Route path="/data-protection" element={<DataProtectionPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        {/* Conversational AI Query Bar — stays at bottom of main content */}
        <AskBar pageContext={location.pathname} />
      </div>
    </div>
  );
}
