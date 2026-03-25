import api from "./api";
import {
  mockDashboard,
  mockInsights,
  mockSuspectsSummary,
  mockSuspectsData,
  mockMemberDetails,
  mockExpenditure,
  mockExpenditureDrillDowns,
  mockProviders,
  mockGroups,
  mockGroupInsights,
  mockGroupTrends,
  mockCareGapSummaries,
  mockCareGapMeasures,
  mockMemberGaps,
  mockPlaybooks,
  mockCodeUtilization,
  mockSuccessStories,
  mockBenchmarks,
  mockQuerySuggestions,
  mockQueryAnswers,
  mockLearningReport,
  mockLearningAccuracy,
  mockLearningInteractions,
  mockImprovementAreas,
  mockDiscoveryLatest,
  mockDiscoveryRevenueCycle,
  mockJourneyMembers,
  mockJourneyData,
  mockTrajectoryData,
  mockFinancialPnl,
  mockFinancialByPlan,
  mockFinancialByGroup,
  mockFinancialForecast,
  mockCohortBuildResult,
  mockSavedCohorts,
  mockCohortTrends,
  mockHospitalizationRisk,
  mockCostProjections,
  mockRafProjections,
  mockPrebuiltScenarios,
  mockScenarioResults,
  mockCensusSummary,
  mockCensusItems,
  mockCareAlerts,
  mockADTSources,
  mockRecentADTEvents,
} from "./mockData";

// ---------------------------------------------------------------------------
// Global-filter helpers — extract group_id / provider_id from axios params
// and use them to narrow mock data before returning it.
// ---------------------------------------------------------------------------

/** Provider name (full) -> provider id lookup */
const providerNameToId: Record<string, number> = {};
mockProviders.forEach((p) => { providerNameToId[p.name] = p.id; });

/** Short PCP name (e.g. "Dr. Rivera") -> provider id lookup */
const pcpShortNameToId: Record<string, number> = {};
mockProviders.forEach((p) => {
  // "Dr. James Rivera" -> "Dr. Rivera"
  const parts = p.name.split(" ");
  const shortName = `${parts[0]} ${parts[parts.length - 1]}`;
  pcpShortNameToId[shortName] = p.id;
});

function getFilterIds(config: { params?: Record<string, string> }): { groupId: number | null; providerId: number | null; providerIds: number[] } {
  const params = config.params || {};
  const groupId = params.group_id ? parseInt(params.group_id) : null;
  const providerId = params.provider_id ? parseInt(params.provider_id) : null;

  // Determine the set of provider ids in scope
  let providerIds: number[] = [];
  if (providerId) {
    providerIds = [providerId];
  } else if (groupId) {
    const group = mockGroups.find((g) => g.id === groupId);
    if (group) providerIds = group.provider_ids;
  }
  return { groupId, providerId, providerIds };
}

/** Check if a provider name (full or short PCP style) matches the filter */
function providerNameMatchesFilter(name: string, providerIds: number[]): boolean {
  if (providerIds.length === 0) return true;
  const fullId = providerNameToId[name];
  if (fullId && providerIds.includes(fullId)) return true;
  const shortId = pcpShortNameToId[name];
  if (shortId && providerIds.includes(shortId)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers to build mock response data for specific routes
// ---------------------------------------------------------------------------

function mockScorecardFor(id: number) {
  const p = mockProviders.find((x) => x.id === id) || mockProviders[0];
  return {
    id: p.id,
    npi: p.npi,
    name: p.name,
    specialty: p.specialty,
    practice_name: "AQSoft Demo Medical Group",
    panel_size: p.panel_size,
    tier: p.tier,
    metrics: [
      { key: "panel_size", label: "Panel Size", value: p.panel_size, target: null, tier: p.tier, percentile: 65, trend: 2.1 },
      { key: "capture_rate", label: "Capture Rate", value: p.capture_rate, target: 75.0, tier: p.tier, percentile: (p.capture_rate ?? 0) > 70 ? 80 : 30, trend: 1.4 },
      { key: "recapture_rate", label: "Recapture Rate", value: p.recapture_rate, target: 80.0, tier: p.tier, percentile: (p.recapture_rate ?? 0) > 75 ? 75 : 25, trend: -0.8 },
      { key: "avg_raf", label: "Avg RAF Score", value: p.avg_raf, target: null, tier: "gray", percentile: 55, trend: 0.03 },
      { key: "panel_pmpm", label: "Panel PMPM", value: p.panel_pmpm, target: 1200, tier: (p.panel_pmpm ?? 9999) <= 1200 ? "green" : "amber", percentile: 45, trend: -12 },
      { key: "gap_closure_rate", label: "Gap Closure Rate", value: p.gap_closure_rate, target: 70.0, tier: (p.gap_closure_rate ?? 0) >= 70 ? "green" : "red", percentile: (p.gap_closure_rate ?? 0) > 60 ? 70 : 20, trend: 2.3 },
    ],
    targets: { capture_rate: 75.0, recapture_rate: 80.0, panel_pmpm: 1200, gap_closure_rate: 70.0 },
  };
}

function mockComparisonFor(id: number) {
  const p = mockProviders.find((x) => x.id === id) || mockProviders[0];
  return {
    provider_id: p.id,
    name: p.name,
    comparisons: {
      capture_rate: { provider_value: p.capture_rate, network_avg: 63.2, top_quartile: 78.5, bottom_quartile: 48.1 },
      recapture_rate: { provider_value: p.recapture_rate, network_avg: 69.4, top_quartile: 84.0, bottom_quartile: 52.3 },
      avg_raf: { provider_value: p.avg_raf, network_avg: 1.31, top_quartile: 1.65, bottom_quartile: 1.02 },
      panel_pmpm: { provider_value: p.panel_pmpm, network_avg: 1310, top_quartile: 1120, bottom_quartile: 1480 },
      gap_closure_rate: { provider_value: p.gap_closure_rate, network_avg: 59.8, top_quartile: 75.2, bottom_quartile: 44.1 },
    },
  };
}

function mockExpenditureDrillDown(category: string) {
  if (mockExpenditureDrillDowns[category]) {
    return mockExpenditureDrillDowns[category];
  }
  // Fallback for unknown categories
  const cat = mockExpenditure.categories.find((c) => c.key === category) || mockExpenditure.categories[0];
  return {
    category: cat.key,
    label: cat.label,
    total_spend: cat.total_spend,
    pmpm: cat.pmpm,
    claim_count: cat.claim_count,
    unique_members: Math.round(cat.claim_count * 0.6),
    kpis: [
      { label: "Total Spend", value: `$${(cat.total_spend / 1000000).toFixed(1)}M` },
      { label: "PMPM", value: `$${cat.pmpm}` },
      { label: "Claims", value: cat.claim_count.toLocaleString() },
    ],
    sections: [],
  };
}

// ---------------------------------------------------------------------------
// Enable demo mode — intercepts all API calls and returns shaped mock data
// ---------------------------------------------------------------------------

export function enableDemoMode() {
  api.interceptors.request.use((config) => {
    const url = config.url || "";
    const method = (config.method || "get").toLowerCase();
    let mockResponse: unknown = null;

    // ---------- PATCH endpoints (mutations) ----------
    if (method === "patch") {
      if (url.includes("/api/adt/alerts/")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const alertId = parseInt(url.split("/api/adt/alerts/")[1]);
        const alert = mockCareAlerts.find((a) => a.id === alertId);
        if (alert && body.action === "acknowledge") {
          mockResponse = { ...alert, status: "acknowledged" };
        } else if (alert && body.action === "resolve") {
          mockResponse = { ...alert, status: "resolved", resolution_notes: body.resolution_notes };
        } else if (alert && body.action === "assign") {
          mockResponse = { ...alert, status: "in_progress", assigned_to: body.assigned_to };
        } else {
          mockResponse = { success: true };
        }
      } else if (url.includes("/api/adt/sources/")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = { ...body, id: parseInt(url.split("/api/adt/sources/")[1]) };
      } else {
        mockResponse = { success: true };
      }
    }

    // ---------- POST endpoints ----------
    else if (method === "post") {
      if (url.includes("/api/adt/webhook")) {
        mockResponse = { status: "processed", event_id: Date.now(), alerts: 1 };
      } else if (url.includes("/api/adt/events")) {
        mockResponse = { id: Date.now(), event_type: "admit", alerts: [] };
      } else if (url.includes("/api/adt/batch")) {
        mockResponse = { processed: 25, matched: 22, unmatched: 3, alerts_generated: 8 };
      } else if (url.includes("/api/adt/sources")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = { id: Date.now(), ...body, events_received: 0, last_sync: null };
      } else
      if (url.includes("/api/query/ask")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const q = (body?.question || "").toLowerCase();
        // Match by keyword
        if (q.includes("readmission") || q.includes("memorial")) {
          mockResponse = mockQueryAnswers.readmission;
        } else if (q.includes("diabetic") || q.includes("eye exam") || q.includes("retinal")) {
          mockResponse = mockQueryAnswers.diabetic;
        } else if (q.includes("pharmacy") || q.includes("drug") || q.includes("medication") || q.includes("glp")) {
          mockResponse = mockQueryAnswers.pharmacy;
        } else {
          // Default fallback answer
          mockResponse = {
            answer: `Based on your population of 4,832 members, here's what I found regarding "${body?.question}":\n\nYour network shows a weighted average RAF of 1.247 with a recapture rate of 68.4%. Total PMPM is $1,247 against an MLR of 84.2%. There are 1,847 suspect HCC opportunities worth an estimated $3.4M in annual revenue.\n\nI'd recommend focusing on the highest-value suspect conditions and providers with the lowest capture rates to maximize impact.`,
            data_points: [
              { label: "Total Lives", value: "4,832" },
              { label: "Avg RAF", value: "1.247" },
              { label: "Recapture Rate", value: "68.4%" },
              { label: "Suspect Opportunities", value: "1,847" },
            ],
            related_members: [],
            recommended_actions: [
              "Review suspect HCC opportunities with highest RAF value",
              "Schedule provider education sessions for bottom-quartile performers",
              "Prioritize care gap closure for HEDIS measures below 3 stars",
            ],
            follow_up_questions: [
              "Which providers have the most suspect HCCs?",
              "What's driving our highest cost categories?",
              "Show me patients with the highest RAF scores",
            ],
          };
        }
      } else if (url.includes("/api/learning/track")) {
        mockResponse = { id: Date.now(), interaction_type: "tracked", target_type: "mock", success: true };
      } else if (url.includes("/api/cohorts/build")) {
        mockResponse = mockCohortBuildResult;
      } else if (url.includes("/api/cohorts/save")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = { id: Date.now(), name: body?.name || "New Cohort", filters: body?.filters || {}, created_at: "2026-03-24", member_count: 8, last_run: "2026-03-24" };
      } else if (url.includes("/api/scenarios/run")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const scenarioType = body?.type || "capture_improvement";
        mockResponse = mockScenarioResults[scenarioType] || mockScenarioResults["capture_improvement"];
      } else if (url.includes("/api/care-gaps/measures")) {
        mockResponse = { id: 999, code: "CUSTOM-01", name: "Custom Measure", success: true };
      } else {
        mockResponse = { success: true };
      }
    }

    // ---------- GET endpoints (order: most specific first) ----------
    else if (method === "get") {
      const { groupId, providerId, providerIds } = getFilterIds(config as { params?: Record<string, string> });
      const hasFilter = groupId !== null || providerId !== null;

      // Query suggestions
      if (url.includes("/api/query/suggestions")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const ctx = params.get("context") || "/";
        // Find best matching context
        const matchedKey = Object.keys(mockQuerySuggestions).find((k) => ctx.startsWith(k) && k !== "/") || "/";
        mockResponse = mockQuerySuggestions[matchedKey] || mockQuerySuggestions["/"];
      }

      // Discovery endpoints
      else if (url.includes("/api/discovery/revenue-cycle")) {
        mockResponse = mockDiscoveryRevenueCycle;
      }
      else if (url.includes("/api/discovery/latest")) {
        mockResponse = mockDiscoveryLatest;
      }
      else if (url.includes("/api/discovery/run")) {
        mockResponse = { discoveries_created: mockInsights.length, discoveries: mockInsights };
      }

      // Dashboard insights
      else if (url.includes("/api/dashboard/insights")) {
        mockResponse = mockInsights;
      }
      // Dashboard overview
      else if (url.includes("/api/dashboard")) {
        mockResponse = mockDashboard;
      }

      // HCC summary
      else if (url === "/api/hcc/summary" || url.endsWith("/api/hcc/summary")) {
        mockResponse = mockSuspectsSummary;
      }
      // HCC export
      else if (url.includes("/api/hcc/export")) {
        mockResponse = new Blob(["member_id,member_name,raf\nM1001,Margaret Chen,1.847"], { type: "text/csv" });
      }
      // HCC member detail: /api/hcc/suspects/:memberId (memberId starts with M)
      else if (/\/api\/hcc\/suspects\/M\w+/.test(url)) {
        const memberId = url.match(/\/api\/hcc\/suspects\/(M\w+)/)?.[1] || "";
        mockResponse = mockMemberDetails[memberId] || { suspects: [], medications: [] };
      }
      // HCC suspects list: /api/hcc/suspects (with query params)
      else if (url === "/api/hcc/suspects" || url.endsWith("/api/hcc/suspects")) {
        if (hasFilter && providerIds.length > 0) {
          const filtered = mockSuspectsData.items.filter((item) =>
            providerNameMatchesFilter(item.pcp, providerIds),
          );
          mockResponse = { ...mockSuspectsData, items: filtered, total_pages: Math.max(1, Math.ceil(filtered.length / 10)) };
        } else {
          mockResponse = mockSuspectsData;
        }
      }

      // Expenditure drill-down insights: /api/expenditure/:category/insights
      else if (/\/api\/expenditure\/[^/]+\/insights/.test(url)) {
        mockResponse = [];
      }
      // Expenditure drill-down: /api/expenditure/:category
      else if (/\/api\/expenditure\/([^/]+)$/.test(url) && !url.endsWith("/api/expenditure")) {
        const cat = url.split("/api/expenditure/")[1];
        mockResponse = mockExpenditureDrillDown(cat);
      }
      // Expenditure overview
      else if (url.includes("/api/expenditure")) {
        mockResponse = mockExpenditure;
      }

      // Group insights: /api/groups/insights
      else if (url.includes("/api/groups/insights")) {
        mockResponse = mockGroupInsights;
      }
      // Group compare: /api/groups/compare?a=X&b=Y
      else if (url.includes("/api/groups/compare")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const aId = parseInt(params.get("a") || "1");
        const bId = parseInt(params.get("b") || "2");
        const ga = mockGroups.find((g) => g.id === aId) || mockGroups[0];
        const gb = mockGroups.find((g) => g.id === bId) || mockGroups[1];
        const compareKeys = ["provider_count", "total_panel_size", "avg_capture_rate", "avg_recapture_rate", "avg_raf", "group_pmpm", "gap_closure_rate"] as const;
        const metrics = compareKeys.map((key) => {
          const va = (ga as any)[key];
          const vb = (gb as any)[key];
          const winner = key === "group_pmpm" ? (va <= vb ? "a" : "b") : (va >= vb ? "a" : "b");
          return { key, value_a: va, value_b: vb, winner };
        });
        mockResponse = { group_a: ga, group_b: gb, metrics };
      }
      // Group trends: /api/groups/:id/trends
      else if (/\/api\/groups\/\d+\/trends/.test(url)) {
        const gid = parseInt(url.match(/\/api\/groups\/(\d+)/)![1]);
        const g = mockGroups.find((x) => x.id === gid) || mockGroups[0];
        mockResponse = { group_id: g.id, group_name: g.name, ...mockGroupTrends };
      }
      // Group providers: /api/groups/:id/providers
      else if (/\/api\/groups\/\d+\/providers/.test(url)) {
        const gid = parseInt(url.match(/\/api\/groups\/(\d+)/)![1]);
        const g = mockGroups.find((x) => x.id === gid) || mockGroups[0];
        mockResponse = mockProviders.filter((p) => g.provider_ids.includes(p.id));
      }
      // Group scorecard: /api/groups/:id
      else if (/\/api\/groups\/\d+$/.test(url)) {
        const gid = parseInt(url.match(/\/api\/groups\/(\d+)/)![1]);
        const g = mockGroups.find((x) => x.id === gid) || mockGroups[0];
        const metricKeys = [
          { key: "provider_count", label: "Provider Count" },
          { key: "total_panel_size", label: "Total Panel Size" },
          { key: "avg_capture_rate", label: "Avg Capture Rate" },
          { key: "avg_recapture_rate", label: "Avg Recapture Rate" },
          { key: "avg_raf", label: "Avg RAF Score" },
          { key: "group_pmpm", label: "Group PMPM" },
          { key: "gap_closure_rate", label: "Gap Closure Rate" },
        ];
        const metrics = metricKeys.map(({ key, label }) => ({
          key, label, value: (g as any)[key], target: null, tier: g.tier,
        }));
        mockResponse = { ...g, metrics };
      }
      // Group list: /api/groups
      else if (url.includes("/api/groups")) {
        if (groupId) {
          mockResponse = mockGroups.filter((g) => g.id === groupId);
        } else {
          mockResponse = mockGroups;
        }
      }

      // Provider scorecard comparison: /api/providers/:id/comparison
      else if (/\/api\/providers\/\d+\/comparison/.test(url)) {
        const id = parseInt(url.match(/\/api\/providers\/(\d+)/)![1]);
        mockResponse = mockComparisonFor(id);
      }
      // Provider insights: /api/providers/:id/insights
      else if (/\/api\/providers\/\d+\/insights/.test(url)) {
        mockResponse = [];
      }
      // Provider targets: /api/providers/:id/targets
      else if (/\/api\/providers\/\d+\/targets/.test(url)) {
        mockResponse = { success: true };
      }
      // Provider scorecard: /api/providers/:id
      else if (/\/api\/providers\/\d+$/.test(url)) {
        const id = parseInt(url.match(/\/api\/providers\/(\d+)/)![1]);
        mockResponse = mockScorecardFor(id);
      }
      // Provider list
      else if (url.includes("/api/providers")) {
        if (hasFilter && providerIds.length > 0) {
          mockResponse = mockProviders.filter((p) => providerIds.includes(p.id));
        } else {
          mockResponse = mockProviders;
        }
      }

      // Care gap measures list
      else if (url.includes("/api/care-gaps/measures")) {
        mockResponse = mockCareGapMeasures;
      }
      // Care gap member gaps
      else if (url.includes("/api/care-gaps/members")) {
        if (hasFilter && providerIds.length > 0) {
          mockResponse = mockMemberGaps.filter((g) =>
            providerNameMatchesFilter(g.provider_name, providerIds),
          );
        } else {
          mockResponse = mockMemberGaps;
        }
      }
      // Care gap export
      else if (url.includes("/api/care-gaps/export")) {
        mockResponse = new Blob(["measure,member,status\n"], { type: "text/csv" });
      }
      // Care gap close/exclude: /api/care-gaps/:id (numeric)
      else if (/\/api\/care-gaps\/\d+/.test(url)) {
        mockResponse = { success: true };
      }
      // Care gap summaries list
      else if (url.includes("/api/care-gaps")) {
        mockResponse = mockCareGapSummaries;
      }

      // Learning / Self-Learning System
      else if (url.includes("/api/learning/report")) {
        mockResponse = mockLearningReport;
      }
      else if (url.includes("/api/learning/accuracy")) {
        mockResponse = mockLearningAccuracy;
      }
      else if (url.includes("/api/learning/interactions")) {
        mockResponse = mockLearningInteractions;
      }

      // Patterns / Intelligence
      else if (url.includes("/api/patterns/playbooks")) {
        mockResponse = mockPlaybooks;
      }
      else if (url.includes("/api/patterns/code-utilization")) {
        mockResponse = mockCodeUtilization;
      }
      else if (url.includes("/api/patterns/outcomes")) {
        mockResponse = mockSuccessStories;
      }
      else if (url.includes("/api/patterns/improvements")) {
        mockResponse = mockImprovementAreas;
      }
      else if (url.includes("/api/patterns/benchmarks")) {
        mockResponse = mockBenchmarks;
      }
      else if (url.includes("/api/patterns/success")) {
        mockResponse = [
          { id: "coding_specificity", title: "Higher Coding Specificity", description: "Top performers use specific diagnosis codes 78% of the time vs 51% for bottom performers.", metric: "specificity_rate", top_value: 78, bottom_value: 51, gap: 27, evidence_count: 1247, category: "coding" },
          { id: "hcc_code_breadth", title: "Broader HCC Code Utilization", description: "Top performers document HCC-relevant codes in 34% of claims vs 18% for bottom performers.", metric: "hcc_code_rate", top_value: 34, bottom_value: 18, gap: 16, evidence_count: 24, category: "hcc_capture" },
        ];
      }

      // Journey: member search
      else if (url.includes("/api/journey/members")) {
        if (hasFilter && providerIds.length > 0) {
          mockResponse = (mockJourneyMembers as { id: number; name: string; pcp?: string }[]).filter((m) => {
            if (!m.pcp) return true;
            return providerNameMatchesFilter(m.pcp, providerIds);
          });
        } else {
          mockResponse = mockJourneyMembers;
        }
      }
      // Journey: trajectory for a member
      else if (/\/api\/journey\/\d+\/trajectory/.test(url)) {
        const mid = parseInt(url.match(/\/api\/journey\/(\d+)/)![1]);
        mockResponse = mockTrajectoryData[mid] || mockTrajectoryData[1];
      }
      // Journey: full timeline for a member
      else if (/\/api\/journey\/\d+$/.test(url)) {
        const mid = parseInt(url.match(/\/api\/journey\/(\d+)/)![1]);
        mockResponse = mockJourneyData[mid] || mockJourneyData[1];
      }

      // Financial P&L
      else if (url.includes("/api/financial/pnl/by-plan")) {
        mockResponse = mockFinancialByPlan;
      }
      else if (url.includes("/api/financial/pnl/by-group")) {
        mockResponse = mockFinancialByGroup;
      }
      else if (url.includes("/api/financial/pnl")) {
        mockResponse = mockFinancialPnl;
      }
      else if (url.includes("/api/financial/forecast")) {
        mockResponse = mockFinancialForecast;
      }

      // Cohorts
      else if (/\/api\/cohorts\/\d+\/trends/.test(url)) {
        mockResponse = mockCohortTrends;
      }
      else if (/\/api\/cohorts\/\d+$/.test(url)) {
        const cid = parseInt(url.match(/\/api\/cohorts\/(\d+)/)![1]);
        const cohort = mockSavedCohorts.find((c) => c.id === cid) || mockSavedCohorts[0];
        mockResponse = { ...cohort, ...mockCohortBuildResult };
      }
      else if (url.match(/\/api\/cohorts\/?$/) || url.match(/\/api\/cohorts\?/)) {
        mockResponse = mockSavedCohorts;
      }

      // Predictions
      else if (url.includes("/api/predictions/hospitalization-risk")) {
        if (hasFilter && providerIds.length > 0) {
          mockResponse = (mockHospitalizationRisk as { pcp: string }[]).filter((m) =>
            providerNameMatchesFilter(m.pcp, providerIds),
          );
        } else {
          mockResponse = mockHospitalizationRisk;
        }
      }
      else if (url.includes("/api/predictions/cost-trajectory")) {
        mockResponse = mockCostProjections;
      }
      else if (url.includes("/api/predictions/raf-impact")) {
        mockResponse = mockRafProjections;
      }

      // Scenarios
      else if (url.includes("/api/scenarios/prebuilt")) {
        mockResponse = mockPrebuiltScenarios;
      }

      // ADT Census
      else if (url.includes("/api/adt/census/summary")) {
        mockResponse = mockCensusSummary;
      }
      else if (url.includes("/api/adt/census")) {
        if (hasFilter && providerIds.length > 0) {
          const filtered = mockCensusItems.filter((item) =>
            providerNameMatchesFilter(item.attending_provider, providerIds),
          );
          mockResponse = { total_census: filtered.length, items: filtered };
        } else {
          mockResponse = { total_census: mockCensusItems.length, items: mockCensusItems };
        }
      }

      // ADT Alerts
      else if (url.includes("/api/adt/alerts")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const statusParam = params.get("status");
        const priorityParam = params.get("priority");
        const typeParam = params.get("alert_type");
        let filtered = [...mockCareAlerts];
        if (statusParam) filtered = filtered.filter((a) => a.status === statusParam);
        if (priorityParam) filtered = filtered.filter((a) => a.priority === priorityParam);
        if (typeParam) filtered = filtered.filter((a) => a.alert_type === typeParam);
        // Apply global filter: match alerts to census items by member_id to find attending provider
        if (hasFilter && providerIds.length > 0) {
          filtered = filtered.filter((a) => {
            const census = mockCensusItems.find((c) => c.member_id === a.member_id);
            if (!census) return false;
            return providerNameMatchesFilter(census.attending_provider, providerIds);
          });
        }
        mockResponse = filtered;
      }

      // ADT Sources
      else if (url.includes("/api/adt/sources")) {
        mockResponse = mockADTSources;
      }

      // ADT Events (recent)
      else if (url.includes("/api/adt/events")) {
        mockResponse = mockRecentADTEvents;
      }

      // Generic insights
      else if (url.includes("/api/insights")) {
        mockResponse = mockInsights;
      }
    }

    if (mockResponse !== null) {
      return Promise.reject({
        __MOCK__: true,
        data: mockResponse,
        status: 200,
        config,
      });
    }
    return config;
  });

  // Resolve mock "errors" as successful responses
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.__MOCK__) {
        return Promise.resolve({
          data: error.data,
          status: 200,
          statusText: "OK",
          headers: {},
          config: error.config,
        });
      }
      return Promise.reject(error);
    }
  );
}
