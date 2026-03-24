import api from "./api";
import {
  mockDashboard,
  mockInsights,
  mockSuspectsSummary,
  mockSuspectsData,
  mockMemberDetails,
  mockExpenditure,
  mockProviders,
  mockCareGapSummaries,
  mockCareGapMeasures,
  mockMemberGaps,
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
  const cat = mockExpenditure.categories.find((c) => c.key === category) || mockExpenditure.categories[0];
  return {
    category: cat.key,
    label: cat.label,
    total_spend: cat.total_spend,
    pmpm: cat.pmpm,
    claim_count: cat.claim_count,
    unique_members: Math.round(cat.claim_count * 0.6),
    kpis: [
      { label: "Avg Cost per Claim", value: `$${Math.round(cat.total_spend / cat.claim_count).toLocaleString()}` },
      { label: "Claims per Member", value: (cat.claim_count / 4832).toFixed(1) },
      { label: "Trend vs Prior Year", value: `${cat.trend_vs_prior > 0 ? "+" : ""}${cat.trend_vs_prior}%` },
    ],
    tables: [] as { title: string; columns: string[]; rows: Record<string, unknown>[] }[],
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
      if (url.includes("/api/care-gaps/measures")) {
        mockResponse = { id: 999, code: "CUSTOM-01", name: "Custom Measure", success: true };
      } else {
        mockResponse = { success: true };
      }
    }

    // ---------- GET endpoints (order: most specific first) ----------
    else if (method === "get") {

      // Dashboard insights
      if (url.includes("/api/dashboard/insights")) {
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
