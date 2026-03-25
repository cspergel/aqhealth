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
} from "./mockData";

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
      mockResponse = { success: true };
    }

    // ---------- POST endpoints ----------
    else if (method === "post") {
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
      } else if (url.includes("/api/care-gaps/measures")) {
        mockResponse = { id: 999, code: "CUSTOM-01", name: "Custom Measure", success: true };
      } else {
        mockResponse = { success: true };
      }
    }

    // ---------- GET endpoints (order: most specific first) ----------
    else if (method === "get") {

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
        mockResponse = mockSuspectsData;
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
        mockResponse = mockGroups;
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
        mockResponse = mockProviders;
      }

      // Care gap measures list
      else if (url.includes("/api/care-gaps/measures")) {
        mockResponse = mockCareGapMeasures;
      }
      // Care gap member gaps
      else if (url.includes("/api/care-gaps/members")) {
        mockResponse = mockMemberGaps;
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
