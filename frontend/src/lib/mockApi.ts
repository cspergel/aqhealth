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
  mockReconciliationReport,
  mockIbnrEstimate,
  mockMembers,
  mockFilterFields,
  mockSavedFilters,
  mockAnnotations,
  mockWatchlistItems,
  mockReportTemplates,
  mockGeneratedReports,
  mockActionItems,
  mockClinicalPatients,
  mockClinicalWorklist,
  mockQualityReport,
  mockQualityReports,
  mockQuarantinedRecords,
  mockUnresolvedMatches,
  mockDataLineage,
  mockTCMDashboard,
  mockTCMActiveCases,
  mockRADVReadiness,
  mockRADVMemberProfile,
  mockAttributionDashboard,
  mockAttributionChanges,
  mockChurnRisk,
  mockStopLossDashboard,
  mockHighCostMembers,
  mockRiskCorridor,
  mockEducationLibrary,
  mockEducationRecommendations,
  mockAWVDashboard,
  mockAWVMembersDue,
  mockAWVOpportunities,
  mockStarsProjection,
  mockStarsOpportunities,
  mockTemporalSnapshotA,
  mockTemporalSnapshotB,
  mockTemporalComparison,
  mockTemporalTimelineMap,
  mockTemporalChangeLog,
  mockAlertRules,
  mockAlertRuleTriggers,
  mockAlertRulePresets,
  mockStaffMembers,
  mockExpenseEntries,
  mockExpenseDashboard,
  mockStaffingAnalysis,
  mockExpenseTrends,
  mockEfficiencyMetrics,
  mockHiringAnalysis,
  mockBOIDashboard,
  mockInterventions,
  mockBOIRecommendations,
  mockExchangeDashboard,
  mockExchangeRequests,
  mockEvidencePackageExample,
  mockRiskDashboard,
  mockCapitationPayments,
  mockSubcapPayments,
  mockRiskPools,
  mockRiskIBNR,
  mockSurplusDeficitByPlan,
  mockSurplusDeficitByGroup,
  mockRiskCorridorAnalysis,
  mockCarePlans,
  mockCarePlanDetail,
  mockCarePlanSummary,
  mockCaseDashboard,
  mockCaseAssignments,
  mockCaseDetail,
  mockCaseWorkload,
  mockAuthDashboard,
  mockAuthRequests,
  mockAuthCompliance,
  mockAuthOverdue,
  mockPartAnalysis,
  mockExpenditureByPeriod,
  mockDashboardActions,
  mockUtilizationDashboard,
  mockFacilityIntelligence,
  mockAdmissionCalendar,
  mockAdmissionPatterns,
  mockAvoidableAnalysis,
  mockAvoidableERDetail,
  mockAvoidableEducation,
  mockFHIRCapability,
  mockDataInterfaces,
  mockInterfaceLogs,
  mockInterfaceStatus,
  mockPipelineDashboard,
  mockPipelineRules,
  mockPipelineRuns,
  mockSkills,
  mockSkillExecutions,
  mockSkillPresets,
  mockSkillSuggestions,
  mockSkillActions,
  mockProtectionDashboard,
  mockFingerprints,
  mockDataContracts,
  mockGoldenRecords,
  mockIngestionBatches,
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

/** Apply universal filter conditions to a member record */
function applyConditionToMember(member: any, rule: { field: string; operator: string; value: any }): boolean {
  const val = member[rule.field];
  if (val === undefined) return true;
  switch (rule.operator) {
    case ">=": return typeof val === "number" && val >= Number(rule.value);
    case "<=": return typeof val === "number" && val <= Number(rule.value);
    case "=": return val == rule.value;
    case "!=": return val != rule.value;
    case "between": return Array.isArray(rule.value) && typeof val === "number" && val >= rule.value[0] && val <= rule.value[1];
    case "contains": return typeof val === "string" && val.toLowerCase().includes(String(rule.value).toLowerCase());
    case "equals": return String(val).toLowerCase() === String(rule.value).toLowerCase();
    case "starts_with": return typeof val === "string" && val.toLowerCase().startsWith(String(rule.value).toLowerCase());
    case "not_contains": return typeof val === "string" && !val.toLowerCase().includes(String(rule.value).toLowerCase());
    case "is": return String(val).toLowerCase() === String(rule.value).toLowerCase();
    case "is_not": return String(val).toLowerCase() !== String(rule.value).toLowerCase();
    case "is_true": return val === true || val > 0;
    case "is_false": return val === false || val === 0;
    default: return true;
  }
}

function applyUniversalConditions(members: any[], conditions: { logic?: string; rules?: any[] } | null): any[] {
  if (!conditions || !conditions.rules || conditions.rules.length === 0) return members;
  const logic = conditions.logic || "AND";
  return members.filter((m) => {
    if (logic === "AND") return conditions.rules!.every((r: any) => applyConditionToMember(m, r));
    return conditions.rules!.some((r: any) => applyConditionToMember(m, r));
  });
}

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
  // Override the adapter to return mock data directly — bypasses the network
  // and all request/response interceptors (auth 401 handler, global filter
  // handler, etc.) which are unnecessary for demo/mock mode.
  api.defaults.adapter = (config) => {
    const url = config.url || "";
    const method = (config.method || "get").toLowerCase();
    let mockResponse: unknown = null;

    // ---------- PATCH endpoints (mutations) ----------
    if (method === "patch") {
      // Skills: update
      if (url.match(/\/api\/skills\/\d+$/)) {
        const skillId = parseInt(url.match(/\/api\/skills\/(\d+)/)![1]);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const skill = mockSkills.find((s) => s.id === skillId);
        if (skill) {
          Object.assign(skill, body, { updated_at: new Date().toISOString() });
          mockResponse = skill;
        } else {
          mockResponse = { error: "Skill not found" };
        }
      }
      // HCC suspect capture/dismiss: /api/hcc/suspects/:suspectId
      if (/\/api\/hcc\/suspects\/S\w+/.test(url)) {
        const suspectId = url.match(/\/api\/hcc\/suspects\/(S\w+)/)?.[1] || "";
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newStatus = body?.status; // "captured" or "dismissed"
        // Update in mockMemberDetails
        for (const memberId of Object.keys(mockMemberDetails)) {
          const detail = mockMemberDetails[memberId];
          const suspect = detail.suspects.find((s) => s.id === suspectId);
          if (suspect) {
            suspect.status = newStatus;
            // Update the member row in mockSuspectsData
            const memberRow = mockSuspectsData.items.find((m) => m.member_id === memberId);
            if (memberRow) {
              const openSuspects = detail.suspects.filter((s) => s.status === "open");
              if (openSuspects.length === 0) {
                memberRow.status = "captured";
              }
              // Recalculate projected RAF: current + sum of open suspect raf values
              const openRafSum = openSuspects.reduce((sum, s) => sum + s.raf_value, 0);
              memberRow.projected_raf = Math.round((memberRow.current_raf + openRafSum) * 1000) / 1000;
              memberRow.uplift = Math.round((memberRow.projected_raf - memberRow.current_raf) * 1000) / 1000;
              memberRow.suspect_count = openSuspects.length;
            }
            mockResponse = { success: true, suspect_id: suspectId, status: newStatus, raf_value: suspect.raf_value };
            break;
          }
        }
        if (!mockResponse) mockResponse = { success: true };
      }
      // Care gap close/exclude: /api/care-gaps/:id
      else if (/\/api\/care-gaps\/\d+/.test(url)) {
        const gapId = parseInt(url.match(/\/api\/care-gaps\/(\d+)/)![1]);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newStatus = body?.status || "closed";
        // Update in mockMemberGaps
        const gap = mockMemberGaps.find((g) => g.id === gapId);
        if (gap && gap.status === "open") {
          gap.status = newStatus;
          gap.closed_date = new Date().toISOString().split("T")[0];
          // Recalculate closure rate in mockCareGapSummaries for this measure
          const summary = mockCareGapSummaries.find((s) => s.code === gap.measure_code);
          if (summary && newStatus === "closed") {
            summary.open_gaps = Math.max(0, summary.open_gaps - 1);
            summary.closed_gaps += 1;
            summary.closure_rate = Math.round((summary.closed_gaps / summary.total_eligible) * 1000) / 10;
          }
        }
        mockResponse = { success: true, gap_id: gapId, status: newStatus };
      }
      else if (url.includes("/api/annotations/")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const annotationId = parseInt(url.split("/api/annotations/")[1]);
        // Find annotation across all entity keys
        for (const key of Object.keys(mockAnnotations)) {
          const idx = mockAnnotations[key].findIndex((a) => a.id === annotationId);
          if (idx !== -1) {
            const updated = { ...mockAnnotations[key][idx] };
            if (body.content !== undefined) updated.content = body.content;
            if (body.is_pinned !== undefined) updated.is_pinned = body.is_pinned;
            if (body.follow_up_completed !== undefined) updated.follow_up_completed = body.follow_up_completed;
            updated.updated_at = new Date().toISOString();
            mockAnnotations[key][idx] = updated;
            mockResponse = updated;
            break;
          }
        }
        if (!mockResponse) mockResponse = { success: true };
      } else if (url.match(/\/api\/watchlist\/\d+\/acknowledge/)) {
        const itemId = parseInt(url.match(/\/api\/watchlist\/(\d+)/)![1]);
        const item = mockWatchlistItems.find((i) => i.id === itemId);
        if (item) {
          item.has_changes = false;
          item.changes_detected = null;
          item.last_checked = new Date().toISOString();
          mockResponse = item;
        } else {
          mockResponse = { success: true };
        }
      } else if (url.includes("/api/adt/alerts/")) {
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
      } else if (/\/api\/actions\/\d+/.test(url)) {
        const actionId = parseInt(url.match(/\/api\/actions\/(\d+)/)![1]);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const idx = mockActionItems.findIndex((a) => a.id === actionId);
        if (idx !== -1) {
          const updated = { ...mockActionItems[idx] };
          if (body.status) updated.status = body.status;
          if (body.priority) updated.priority = body.priority;
          if (body.assigned_to !== undefined) updated.assigned_to = body.assigned_to;
          if (body.assigned_to_name !== undefined) updated.assigned_to_name = body.assigned_to_name;
          if (body.due_date !== undefined) updated.due_date = body.due_date;
          if (body.actual_outcome) { updated.actual_outcome = body.actual_outcome; updated.outcome_measured = true; }
          if (body.resolution_notes) updated.resolution_notes = body.resolution_notes;
          if (body.status === "completed") updated.completed_date = new Date().toISOString().split("T")[0];
          updated.updated_at = new Date().toISOString();
          mockActionItems[idx] = updated;
          mockResponse = updated;
        } else {
          mockResponse = { success: true };
        }
      } else if (url.includes("/api/tcm/")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const memberId = url.split("/api/tcm/")[1];
        const tcmCase = mockTCMActiveCases.find((c) => c.member_id === memberId);
        if (tcmCase) {
          if (body.phone_contact_date) { tcmCase.phone_contact_status = "done"; tcmCase.phone_contact_date = body.phone_contact_date; }
          if (body.visit_date) { tcmCase.visit_status = "done"; tcmCase.visit_date = body.visit_date; }
          if (body.billing_status) tcmCase.billing_status = body.billing_status;
          mockResponse = tcmCase;
        } else {
          mockResponse = { success: true };
        }
      }
      // Alert Rules: acknowledge trigger
      else if (/\/api\/alert-rules\/triggers\/\d+\/acknowledge/.test(url)) {
        const triggerId = parseInt(url.match(/\/api\/alert-rules\/triggers\/(\d+)\/acknowledge/)![1]);
        const trigger = mockAlertRuleTriggers.find((t) => t.id === triggerId);
        if (trigger) { trigger.acknowledged = true; trigger.acknowledged_by = 2; }
        mockResponse = trigger || { success: true };
      }
      // Alert Rules: update rule
      else if (/\/api\/alert-rules\/\d+/.test(url)) {
        const ruleId = parseInt(url.match(/\/api\/alert-rules\/(\d+)/)![1]);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const rule = mockAlertRules.find((r) => r.id === ruleId);
        if (rule) {
          if (body.is_active !== undefined) rule.is_active = body.is_active;
          if (body.name) rule.name = body.name;
          if (body.severity) rule.severity = body.severity;
          if (body.threshold !== undefined) rule.threshold = body.threshold;
        }
        mockResponse = rule || { success: true };
      }
      else if (url.match(/\/api\/interfaces\/\d+$/)) {
        mockResponse = { status: "updated" };
      }
      else {
        mockResponse = { success: true };
      }
    }

    // ---------- DELETE endpoints ----------
    else if (method === "delete") {
      if (url.match(/\/api\/annotations\/\d+/)) {
        const annotationId = parseInt(url.split("/api/annotations/")[1]);
        for (const key of Object.keys(mockAnnotations)) {
          const idx = mockAnnotations[key].findIndex((a) => a.id === annotationId);
          if (idx !== -1) {
            mockAnnotations[key].splice(idx, 1);
            break;
          }
        }
        mockResponse = { deleted: true };
      } else if (url.match(/\/api\/watchlist\/\d+/)) {
        const itemId = parseInt(url.split("/api/watchlist/")[1]);
        const idx = mockWatchlistItems.findIndex((i) => i.id === itemId);
        if (idx !== -1) mockWatchlistItems.splice(idx, 1);
        mockResponse = { deleted: true };
      } else if (url.match(/\/api\/alert-rules\/\d+/)) {
        const ruleId = parseInt(url.match(/\/api\/alert-rules\/(\d+)/)![1]);
        const idx = mockAlertRules.findIndex((r) => r.id === ruleId);
        if (idx !== -1) mockAlertRules.splice(idx, 1);
        mockResponse = { deleted: true };
      } else if (url.match(/\/api\/skills\/\d+$/)) {
        const skillId = parseInt(url.match(/\/api\/skills\/(\d+)/)![1]);
        const idx = mockSkills.findIndex((s) => s.id === skillId);
        if (idx !== -1) mockSkills.splice(idx, 1);
        mockResponse = { deleted: true, id: skillId };
      } else if (url.includes("/api/filters/")) {
        mockResponse = { deleted: true };
      } else if (url.match(/\/api\/interfaces\/\d+$/)) {
        mockResponse = { status: "deleted" };
      } else {
        mockResponse = { deleted: true };
      }
    }

    // ---------- POST endpoints ----------
    else if (method === "post") {
      // Alert Rules: evaluate
      if (url.includes("/api/alert-rules/evaluate")) {
        mockResponse = mockAlertRuleTriggers;
      }
      // Alert Rules: create rule
      else if (url.match(/\/api\/alert-rules\/?$/)) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newRule = {
          id: Date.now(), ...body, is_active: true, created_by: 2,
          last_evaluated: null, last_triggered: null, trigger_count: 0,
          created_at: new Date().toISOString(),
        };
        mockAlertRules.push(newRule);
        mockResponse = newRule;
      }
      else if (url.includes("/api/annotations")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newAnnotation = {
          id: Date.now(),
          entity_type: body.entity_type,
          entity_id: body.entity_id,
          content: body.content,
          note_type: body.note_type || "general",
          author_id: 1,
          author_name: "Sarah Mitchell, RN",
          requires_follow_up: !!body.follow_up_date,
          follow_up_date: body.follow_up_date || null,
          follow_up_completed: false,
          is_pinned: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const key = `${body.entity_type}:${body.entity_id}`;
        if (!mockAnnotations[key]) mockAnnotations[key] = [];
        mockAnnotations[key].unshift(newAnnotation);
        mockResponse = newAnnotation;
      } else if (url.includes("/api/watchlist/check")) {
        // Simulate change detection -- return current state
        mockResponse = mockWatchlistItems.map((i) => ({
          item_id: i.id, entity_type: i.entity_type, entity_id: i.entity_id,
          entity_name: i.entity_name, has_changes: i.has_changes, changes: i.changes_detected,
        }));
      } else if (url.match(/\/api\/watchlist\/?$/)) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newItem = {
          id: Date.now(), user_id: 1, entity_type: body.entity_type,
          entity_id: body.entity_id, entity_name: body.entity_name,
          reason: body.reason || null, watch_for: body.watch_for || null,
          last_snapshot: {}, changes_detected: null,
          last_checked: new Date().toISOString(), has_changes: false,
          created_at: new Date().toISOString(),
        };
        mockWatchlistItems.push(newItem);
        mockResponse = newItem;
      }
      // Clinical Exchange: auto-respond
      else if (url.match(/\/api\/exchange\/auto-respond\/\d+/)) {
        const idMatch = url.match(/\/auto-respond\/(\d+)/);
        const id = idMatch ? parseInt(idMatch[1]) : 0;
        const req = mockExchangeRequests.find((r: any) => r.id === id);
        if (req) {
          req.status = "auto_responded";
          req.response_date = new Date().toISOString().split("T")[0];
          req.auto_generated = true;
        }
        mockResponse = { request_id: id, status: "auto_responded", package: mockEvidencePackageExample };
      }
      // Clinical Exchange: generate evidence
      else if (url.includes("/api/exchange/generate-evidence")) {
        mockResponse = mockEvidencePackageExample;
      }
      // Clinical Exchange: create request
      else if (url.includes("/api/exchange/requests")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newReq = { id: Date.now(), ...body, status: "pending", request_date: new Date().toISOString().split("T")[0], response_date: null, auto_generated: false };
        mockExchangeRequests.push(newReq);
        mockResponse = newReq;
      }
      // Risk Accounting: enter capitation
      else if (url.includes("/api/risk/capitation")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newPmt = { id: Date.now(), ...body };
        mockCapitationPayments.push(newPmt);
        mockResponse = { id: newPmt.id, status: "recorded", ...body };
      }
      // Risk Accounting: enter subcap
      else if (url.includes("/api/risk/subcap")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newPmt = { id: Date.now(), ...body };
        mockSubcapPayments.push(newPmt);
        mockResponse = { id: newPmt.id, status: "recorded", ...body };
      }
      else if (url.includes("/api/adt/webhook")) {
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

        // Dynamic data for answers
        const openSuspects = mockSuspectsData.items.filter((s) => s.status === "open");
        const totalOpenSuspects = openSuspects.length;
        const totalOpenRaf = Math.round(openSuspects.reduce((s, m) => s + m.uplift, 0) * 100) / 100;
        const totalLives = mockDashboard.metrics.total_lives;
        const avgRaf = mockDashboard.metrics.avg_raf;

        if (q.includes("readmission") || q.includes("memorial")) {
          mockResponse = mockQueryAnswers.readmission;
        } else if (q.includes("diabetes") || q.includes("diabetic") || q.includes("eye exam") || q.includes("retinal") || q.includes("gap")) {
          mockResponse = mockQueryAnswers.diabetic;
        } else if (q.includes("pharmacy") || q.includes("drug") || q.includes("medication") || q.includes("glp") || q.includes("cost")) {
          mockResponse = mockQueryAnswers.pharmacy;
        } else if (q.includes("raf") || q.includes("capture") || q.includes("hcc") || q.includes("suspect")) {
          // Dynamic answer from current suspect data
          const topByUplift = [...openSuspects].sort((a, b) => b.uplift - a.uplift).slice(0, 5);
          mockResponse = {
            answer: `Your population currently has ${totalOpenSuspects} open suspect HCC opportunities representing ${totalOpenRaf.toFixed(2)} RAF uplift. The average RAF across ${totalLives.toLocaleString()} members is ${avgRaf}.\n\nTop members by RAF opportunity:\n${topByUplift.map((m, i) => `${i + 1}. ${m.member_name} (${m.member_id}) — ${m.uplift.toFixed(3)} RAF uplift, ${m.suspect_count} open suspects`).join("\n")}\n\nFocusing on these high-value members first will maximize your capture impact.`,
            data_points: [
              { label: "Open Suspects", value: totalOpenSuspects.toString() },
              { label: "Total RAF Uplift", value: totalOpenRaf.toFixed(2) },
              { label: "Avg RAF", value: avgRaf.toString() },
              { label: "Est. Annual Value", value: `$${Math.round(totalOpenRaf * 13200).toLocaleString()}` },
            ],
            related_members: topByUplift.map((m) => ({ member_id: m.member_id, member_name: m.member_name, raf: m.current_raf, uplift: m.uplift })),
            recommended_actions: [
              "Schedule visits for members with highest RAF uplift potential",
              "Review recapture suspects — these are conditions coded last year but not yet this year",
              "Prioritize members with 3+ suspects for comprehensive visits",
            ],
            follow_up_questions: [
              "Which providers have the lowest capture rates?",
              "Show me recapture suspects specifically",
              "What HCC codes have the highest value?",
            ],
          };
        } else if (mockProviders.some((p) => q.includes(p.name.toLowerCase().split(" ").pop()!.toLowerCase()))) {
          // Provider-specific answer
          const matchedProvider = mockProviders.find((p) => q.includes(p.name.toLowerCase().split(" ").pop()!.toLowerCase()))!;
          const provSuspects = mockSuspectsData.items.filter((s) => s.pcp.includes(matchedProvider.name.split(" ").pop()!));
          mockResponse = {
            answer: `Here's what I found about ${matchedProvider.name}:\n\n• Specialty: ${matchedProvider.specialty}\n• Panel Size: ${matchedProvider.panel_size} members\n• Capture Rate: ${matchedProvider.capture_rate}%\n• Recapture Rate: ${matchedProvider.recapture_rate}%\n• Avg RAF: ${matchedProvider.avg_raf}\n• Panel PMPM: $${matchedProvider.panel_pmpm}\n• Gap Closure Rate: ${matchedProvider.gap_closure_rate}%\n• Tier: ${matchedProvider.tier}\n\nThey have ${provSuspects.length} members with suspect HCCs in the current worklist.`,
            data_points: [
              { label: "Capture Rate", value: `${matchedProvider.capture_rate}%` },
              { label: "Panel Size", value: matchedProvider.panel_size.toString() },
              { label: "PMPM", value: `$${matchedProvider.panel_pmpm}` },
              { label: "Gap Closure", value: `${matchedProvider.gap_closure_rate}%` },
            ],
            related_members: provSuspects.map((m) => ({ member_id: m.member_id, member_name: m.member_name, raf: m.current_raf, uplift: m.uplift })),
            recommended_actions: [
              (matchedProvider.capture_rate ?? 0) < 60 ? "Schedule coding education session — capture rate is below network average" : "Capture rate is strong — consider peer mentoring role",
              (matchedProvider.gap_closure_rate ?? 0) < 60 ? "Review open care gaps and prioritize outreach" : "Gap closure is above average — maintain current workflows",
              "Review suspect HCC list for upcoming patient visits",
            ],
            follow_up_questions: [
              `What are ${matchedProvider.name}'s open suspect HCCs?`,
              `How does ${matchedProvider.name} compare to peers?`,
              `What care gaps are open for ${matchedProvider.name}'s panel?`,
            ],
          };
        } else {
          // Generic helpful fallback using live data
          const openGapCount = mockCareGapSummaries.reduce((s, g) => s + g.open_gaps, 0);
          const avgClosure = Math.round(mockCareGapSummaries.reduce((s, g) => s + g.closure_rate, 0) / mockCareGapSummaries.length * 10) / 10;
          mockResponse = {
            answer: `Based on your population of ${totalLives.toLocaleString()} members, here's a summary regarding "${body?.question}":\n\n• Average RAF: ${avgRaf} | Recapture Rate: ${mockDashboard.metrics.recapture_rate}%\n• Open HCC Suspects: ${totalOpenSuspects} (${totalOpenRaf.toFixed(1)} RAF opportunity)\n• Open Care Gaps: ${openGapCount} across ${mockCareGapSummaries.length} measures (avg closure: ${avgClosure}%)\n• Total PMPM: $${mockDashboard.metrics.total_pmpm} | MLR: ${mockDashboard.metrics.mlr}%\n• Stars Rating: ${mockStarsProjection.overall_rating} overall\n\nI can dig deeper into any of these areas. Try asking about specific providers, RAF capture, care gaps, costs, or Star ratings.`,
            data_points: [
              { label: "Total Lives", value: totalLives.toLocaleString() },
              { label: "Avg RAF", value: avgRaf.toString() },
              { label: "Open Suspects", value: totalOpenSuspects.toString() },
              { label: "Open Care Gaps", value: openGapCount.toString() },
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
              "Show me our Stars rating breakdown",
              "Which care gaps have the lowest closure rates?",
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
      } else if (url.includes("/api/filters/apply")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = { applied: true, conditions: body?.conditions || {}, context: body?.page_context || "members" };
      } else if (url.includes("/api/filters")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = {
          id: Date.now(), name: body?.name || "New Filter", description: body?.description || null,
          page_context: body?.page_context || "members", conditions: body?.conditions || {},
          created_by: 1, is_shared: body?.is_shared || false, is_system: false,
          use_count: 0, last_used: null,
        };
      } else if (url.includes("/api/reconciliation/run")) {
        mockResponse = { total_signals: 23, matched: 18, unmatched: 5, avg_accuracy: 91.3, accuracy_by_category: { inpatient: { count: 10, avg_error: 10.3, avg_bias: -2.4 }, ed_observation: { count: 5, avg_error: 5.9, avg_bias: -1.1 }, snf_postacute: { count: 3, avg_error: 6.4, avg_bias: 1.4 } } };
      } else if (url.includes("/api/care-gaps/measures")) {
        mockResponse = { id: 999, code: "CUSTOM-01", name: "Custom Measure", success: true };
      }
      // Reports: generate
      else if (url.includes("/api/reports/generate")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const template = mockReportTemplates.find((t) => t.id === body?.template_id);
        const newReport = {
          id: Date.now(),
          template_id: body?.template_id || 1,
          title: `${template?.name || "Report"} - ${body?.period || "Current"}`,
          period: body?.period || "Current",
          status: "ready",
          content: mockGeneratedReports[0].content,
          ai_narrative: mockGeneratedReports[0].ai_narrative,
          generated_by: 1,
          file_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        (mockGeneratedReports as any[]).unshift(newReport);
        mockResponse = newReport;
      }
      // Actions: create from insight
      else if (/\/api\/actions\/from-insight\/\d+/.test(url)) {
        const insightId = parseInt(url.match(/\/api\/actions\/from-insight\/(\d+)/)![1]);
        const insight = mockInsights.find((i) => i.id === insightId);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});
        const newAction = {
          id: Date.now(), source_type: "insight", source_id: insightId,
          title: insight?.title || "Action from insight",
          description: insight?.description || null,
          action_type: "investigation", assigned_to: body.assigned_to || null,
          assigned_to_name: body.assigned_to_name || null,
          priority: (insight?.dollar_impact && insight.dollar_impact >= 100000) ? "high" : "medium",
          status: "open", due_date: null, completed_date: null,
          member_id: null, provider_id: null, group_id: null,
          expected_impact: insight?.dollar_impact ? `$${(insight.dollar_impact / 1000).toFixed(0)}K estimated impact` : null,
          actual_outcome: null, outcome_measured: false, resolution_notes: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        (mockActionItems as any[]).unshift(newAction);
        mockResponse = newAction;
      }
      // Actions: create from alert
      else if (/\/api\/actions\/from-alert\/\d+/.test(url)) {
        const alertId = parseInt(url.match(/\/api\/actions\/from-alert\/(\d+)/)![1]);
        const alert = mockCareAlerts.find((a) => a.id === alertId);
        const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});
        const newAction = {
          id: Date.now(), source_type: "alert", source_id: alertId,
          title: alert?.title || "Action from alert",
          description: alert?.description || null,
          action_type: "care_plan", assigned_to: body.assigned_to || null,
          assigned_to_name: body.assigned_to_name || null,
          priority: alert?.priority || "medium",
          status: "open", due_date: null, completed_date: null,
          member_id: alert?.member_id || null, provider_id: null, group_id: null,
          expected_impact: null, actual_outcome: null, outcome_measured: false,
          resolution_notes: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        (mockActionItems as any[]).unshift(newAction);
        mockResponse = newAction;
      }
      // Actions: create
      else if (url.match(/\/api\/actions\/?$/)) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newAction = {
          id: Date.now(), source_type: body?.source_type || "manual", source_id: body?.source_id || null,
          title: body?.title || "New Action",
          description: body?.description || null,
          action_type: body?.action_type || "other",
          assigned_to: body?.assigned_to || null,
          assigned_to_name: body?.assigned_to_name || null,
          priority: body?.priority || "medium", status: "open",
          due_date: body?.due_date || null, completed_date: null,
          member_id: body?.member_id || null, provider_id: body?.provider_id || null,
          group_id: body?.group_id || null,
          expected_impact: body?.expected_impact || null,
          actual_outcome: null, outcome_measured: false, resolution_notes: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        (mockActionItems as any[]).unshift(newAction);
        mockResponse = newAction;
      }
      // Clinical: capture suspect
      else if (url.includes("/api/clinical/capture")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const memberId = body?.member_id;
        const suspectId = body?.suspect_id;
        const patient = mockClinicalPatients[memberId];
        if (patient) {
          const suspect = patient.suspects.find((s) => s.id === suspectId);
          if (suspect) {
            suspect.captured = true;
            // Also update mockMemberDetails if matching suspect exists
            const memberIdStr = typeof memberId === "number" ? `M${memberId}` : memberId;
            const detail = mockMemberDetails[memberIdStr];
            if (detail) {
              const detailSuspect = detail.suspects.find((s) => s.id === suspectId || s.hcc_code === String(suspect.hcc_code) || s.hcc_code.includes(String(suspect.hcc_code)));
              if (detailSuspect) detailSuspect.status = "captured";
            }
            // Update suspects data row
            const row = mockSuspectsData.items.find((m) => m.member_id === memberIdStr);
            if (row) {
              const openCount = detail ? detail.suspects.filter((s) => s.status === "open").length : Math.max(0, row.suspect_count - 1);
              row.suspect_count = openCount;
              if (openCount === 0) row.status = "captured";
              if (detail) {
                const openRaf = detail.suspects.filter((s) => s.status === "open").reduce((sum, s) => sum + s.raf_value, 0);
                row.projected_raf = Math.round((row.current_raf + openRaf) * 1000) / 1000;
                row.uplift = Math.round((row.projected_raf - row.current_raf) * 1000) / 1000;
              }
            }
            mockResponse = {
              success: true,
              suspect_id: suspectId,
              hcc_code: suspect.hcc_code,
              raf_value: suspect.raf_value,
              annual_value: suspect.annual_value,
            };
          } else {
            mockResponse = { success: false, error: "Suspect not found" };
          }
        } else {
          mockResponse = { success: false, error: "Patient not found" };
        }
      }
      // Clinical: close gap
      else if (url.includes("/api/clinical/close-gap")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const memberId = body?.member_id;
        const gapId = body?.gap_id;
        const patient = mockClinicalPatients[memberId];
        if (patient) {
          const gap = patient.care_gaps.find((g) => g.id === gapId);
          if (gap) {
            gap.closed = true;
            mockResponse = { success: true, gap_id: gapId };
          } else {
            mockResponse = { success: false, error: "Gap not found" };
          }
        } else {
          mockResponse = { success: false, error: "Patient not found" };
        }
      }
      // Education: complete module
      else if (url.includes("/api/education/complete")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        mockResponse = { provider_id: body?.provider_id, module_id: body?.module_id, completed: true, completed_date: new Date().toISOString().split("T")[0] };
      }
      // Stars: simulate — dynamic calculation from interventions
      else if (url.includes("/api/stars/simulate")) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const interventions: { measure_code: string; gaps_to_close: number }[] = body?.interventions || [];

        const measuresChanged: { code: string; name: string; weight: number; old_star: number; new_star: number; old_rate: number; new_rate: number }[] = [];
        const simMeasures = mockStarsProjection.measures.map((m) => {
          const intv = interventions.find((i) => i.measure_code === m.code);
          if (!intv || intv.gaps_to_close <= 0) return { ...m };

          const newNumerator = m.numerator + intv.gaps_to_close;
          const newRate = Math.min(100, Math.round((newNumerator / m.total_eligible) * 1000) / 10);
          let newStar = 2;
          if (newRate >= m.star_5_cutpoint) newStar = 5;
          else if (newRate >= m.star_4_cutpoint) newStar = 4;
          else if (newRate >= m.star_3_cutpoint) newStar = 3;

          if (newStar !== m.star_level) {
            measuresChanged.push({
              code: m.code, name: m.name, weight: m.weight,
              old_star: m.star_level, new_star: newStar,
              old_rate: m.current_rate, new_rate: newRate,
            });
          }
          return { ...m, current_rate: newRate, numerator: newNumerator, star_level: newStar };
        });

        // Compute weighted average for overall rating
        let totalWeight = 0;
        let weightedSum = 0;
        let partCWeight = 0; let partCSum = 0;
        let partDWeight = 0; let partDSum = 0;
        for (const m of simMeasures) {
          totalWeight += m.weight;
          weightedSum += m.star_level * m.weight;
          if (m.part === "D") { partDWeight += m.weight; partDSum += m.star_level * m.weight; }
          else { partCWeight += m.weight; partCSum += m.star_level * m.weight; }
        }
        const projOverall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 2) / 2 : 3.5; // round to nearest 0.5
        const projPartC = partCWeight > 0 ? Math.round((partCSum / partCWeight) * 2) / 2 : 3.5;
        const projPartD = partDWeight > 0 ? Math.round((partDSum / partDWeight) * 2) / 2 : 4.0;
        const qualifiesForBonus = projOverall >= 4.0;
        // Quality bonus: ~$1,028/member/year for 4+ stars
        const bonusAmount = qualifiesForBonus ? Math.round(mockDashboard.metrics.total_lives * 1028 * (projOverall >= 4.5 ? 1.15 : 1.0)) : 0;

        mockResponse = {
          current_overall: mockStarsProjection.overall_rating,
          projected_overall: projOverall,
          current_part_c: mockStarsProjection.part_c_rating,
          projected_part_c: projPartC,
          current_part_d: mockStarsProjection.part_d_rating,
          projected_part_d: projPartD,
          rating_change: Math.round((projOverall - mockStarsProjection.overall_rating) * 10) / 10,
          measures_changed: measuresChanged,
          qualifies_for_bonus: qualifiesForBonus,
          quality_bonus_amount: bonusAmount,
          quality_bonus_change: bonusAmount - (mockStarsProjection.qualifies_for_bonus ? Math.round(mockDashboard.metrics.total_lives * 1028) : 0),
          simulated_measures: simMeasures,
        };
      }
      // Interfaces — create / test / ingest
      else if (url.match(/\/api\/interfaces\/\d+\/test/)) {
        const idMatch = url.match(/\/api\/interfaces\/(\d+)\/test/);
        const ifaceId = idMatch ? parseInt(idMatch[1]) : 0;
        const iface = mockDataInterfaces.find((i) => i.id === ifaceId);
        mockResponse = { success: true, interface_id: ifaceId, interface_type: iface?.interface_type, message: `Connection to ${iface?.name || "interface"} verified successfully.`, latency_ms: 42 };
      }
      else if (url.match(/\/api\/interfaces\/?$/)) {
        mockResponse = { id: 7, status: "created" };
      }
      // Skills — execute
      else if (url.match(/\/api\/skills\/\d+\/execute/)) {
        const idMatch = url.match(/\/api\/skills\/(\d+)\/execute/);
        const skillId = idMatch ? parseInt(idMatch[1]) : 0;
        const skill = mockSkills.find((s: any) => s.id === skillId);
        if (skill) {
          skill.times_executed = (skill.times_executed || 0) + 1;
          skill.last_executed = new Date().toISOString();
          const steps = skill.steps || [];
          mockResponse = {
            id: mockSkillExecutions.length + 1,
            skill_id: skillId,
            triggered_by: "manual",
            status: "completed",
            steps_completed: steps.length,
            steps_total: steps.length,
            results: steps.map((s: any) => ({ step: s.order, action: s.action, status: "completed", output: { message: `${s.description} completed` } })),
            error: null,
            duration_seconds: skill.avg_duration_seconds || 30,
            executed_by: 1,
            created_at: new Date().toISOString(),
          };
        } else {
          mockResponse = { error: "Skill not found" };
        }
      }
      // Skills — create
      else if (url.match(/\/api\/skills\/?$/) && method === "post") {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newSkill = {
          id: mockSkills.length + 1,
          ...body,
          created_by: 1,
          created_from: body.created_from || "manual",
          is_active: true,
          times_executed: 0,
          last_executed: null,
          avg_duration_seconds: null,
          scope: body.scope || "tenant",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockSkills.push(newSkill);
        mockResponse = newSkill;
      }
      else if (url.includes("/api/ingest/hl7v2")) {
        mockResponse = { success: true, format: "hl7v2", records_parsed: 1, records_normalised: 3 };
      }
      else if (url.includes("/api/ingest/x12")) {
        mockResponse = { success: true, format: "x12_837", records_parsed: 12, records_normalised: 12 };
      }
      else if (url.includes("/api/ingest/cda")) {
        mockResponse = { success: true, format: "cda", records_parsed: 1, records_normalised: 8 };
      }
      else if (url.includes("/api/ingest/json")) {
        mockResponse = { success: true, format: "json_custom", records_parsed: 1 };
      }
      // Data Protection POST routes
      else if (url.match(/\/api\/data-protection\/contracts\/?$/)) {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const newContract = {
          id: Date.now(),
          name: body.name,
          source_name: body.source_name || null,
          contract_rules: body.contract_rules || {},
          is_active: true,
          violations_last_30d: 0,
          last_tested: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        (mockDataContracts as any[]).push(newContract);
        mockResponse = newContract;
      }
      else if (url.match(/\/api\/data-protection\/rollback\/\d+/)) {
        const idMatch = url.match(/\/api\/data-protection\/rollback\/(\d+)/);
        const batchId = idMatch ? parseInt(idMatch[1]) : 0;
        const batch = mockIngestionBatches.find((b: any) => b.id === batchId);
        if (batch) {
          batch.status = "rolled_back";
          batch.rolled_back_at = new Date().toISOString();
          batch.rolled_back_by = 1;
          batch.rollback_reason = (typeof config.data === "string" ? JSON.parse(config.data) : config.data)?.reason || "Manual rollback";
        }
        mockResponse = { records_removed: 145, records_restored: 0, affected_tables: ["claims"], batch_id: batchId };
      }
      else if (url.includes("/api/data-protection/shadow-check")) {
        mockResponse = {
          safe: true,
          warnings: ["Record count changed 3% vs last file (4801 -> 4832)"],
          anomalies: [],
          prev_record_count: 4801,
          new_record_count: 4832,
          last_ingestion: "2026-02-25T14:15:00Z",
        };
      }
      else if (url.includes("/api/data-protection/validate-contract")) {
        mockResponse = {
          passed: true,
          violations: [
            { rule: "unexpected_column", detail: "Unexpected column 'attribution_group' not in contract", severity: "info" },
          ],
        };
      }
      else {
        mockResponse = { success: true };
      }
    }

    // ---------- GET endpoints (order: most specific first) ----------
    else if (method === "get") {
      const { groupId, providerId, providerIds } = getFilterIds(config as { params?: Record<string, string> });
      const hasFilter = groupId !== null || providerId !== null;

      // Filter fields
      if (url.includes("/api/filters/fields")) {
        const params = config.params || {};
        const context = params.context || "members";
        mockResponse = mockFilterFields[context] || mockFilterFields["members"];
      }
      // Saved filters list
      else if (url.match(/\/api\/filters\/?$/) || url.match(/\/api\/filters\?/)) {
        const params = config.params || {};
        const context = params.context || "members";
        mockResponse = mockSavedFilters.filter((f) => f.page_context === context);
      }

      // Query suggestions
      else if (url.includes("/api/query/suggestions")) {
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
      // Dashboard overview — derived from current mock data state
      else if (url.includes("/api/dashboard")) {
        // Count open suspects dynamically
        const openSuspectsCount = mockSuspectsData.items.filter((s) => s.status === "open").length;
        const openRafTotal = Math.round(mockSuspectsData.items.filter((s) => s.status === "open").reduce((sum, s) => sum + s.uplift, 0) * 10) / 10;
        // Scale: each row represents ~185 members (1847 total / 10 rows)
        const scaleFactor = mockDashboard.metrics.suspect_inventory.count / mockSuspectsData.items.length;
        const scaledCount = Math.round(openSuspectsCount * scaleFactor);
        const scaledRaf = Math.round(openRafTotal * scaleFactor * 10) / 10;

        // Build dynamic care gap summary from current state
        const dynamicCareGaps = mockCareGapSummaries.map((g) => ({
          measure_code: g.code,
          measure_name: g.name,
          category: g.category,
          total_gaps: g.total_eligible,
          open_count: g.open_gaps,
          closed_count: g.closed_gaps,
          closure_rate: g.closure_rate,
        }));

        mockResponse = {
          ...mockDashboard,
          metrics: {
            ...mockDashboard.metrics,
            suspect_inventory: {
              count: scaledCount,
              total_raf_value: scaledRaf,
              total_annual_value: Math.round(scaledRaf * 13200),
            },
          },
          care_gap_summary: dynamicCareGaps,
        };
      }

      // HCC summary — derived from current mock data state
      else if (url === "/api/hcc/summary" || url.endsWith("/api/hcc/summary")) {
        const openItems = mockSuspectsData.items.filter((s) => s.status === "open");
        const totalOpen = openItems.length;
        const scaleFactor = mockSuspectsSummary.total_suspects / mockSuspectsData.items.length;
        const scaledTotal = Math.round(totalOpen * scaleFactor);
        const totalRafOpp = Math.round(openItems.reduce((sum, s) => sum + s.uplift, 0) * scaleFactor * 10) / 10;
        const capturedCount = mockSuspectsData.items.length - totalOpen;
        const captureRate = mockSuspectsData.items.length > 0 ? Math.round((capturedCount / mockSuspectsData.items.length) * 1000) / 10 : mockSuspectsSummary.capture_rate;
        mockResponse = {
          ...mockSuspectsSummary,
          total_suspects: scaledTotal,
          total_raf_opportunity: totalRafOpp,
          estimated_annual_value: Math.round(totalRafOpp * 13200),
          capture_rate: captureRate,
        };
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

      // Reconciliation
      else if (url.includes("/api/reconciliation/report")) {
        mockResponse = mockReconciliationReport;
      }
      else if (url.includes("/api/reconciliation/ibnr")) {
        mockResponse = mockIbnrEstimate;
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

      // Members: stats
      else if (url.includes("/api/members/stats")) {
        const params = config.params || {};
        let filtered = [...mockMembers];
        // Apply universal filter conditions if present
        if (params.conditions) {
          try { filtered = applyUniversalConditions(filtered, JSON.parse(params.conditions)); } catch (_e) { /* ignore */ }
        }
        if (params.raf_min) filtered = filtered.filter((m) => m.current_raf >= parseFloat(params.raf_min));
        if (params.raf_max) filtered = filtered.filter((m) => m.current_raf <= parseFloat(params.raf_max));
        if (params.days_not_seen) filtered = filtered.filter((m) => m.days_since_visit >= parseInt(params.days_not_seen));
        if (params.risk_tier) filtered = filtered.filter((m) => m.risk_tier === params.risk_tier);
        if (params.provider_id) filtered = filtered.filter((m) => m.pcp_id === parseInt(params.provider_id));
        if (params.group_id) filtered = filtered.filter((m) => m.group_id === parseInt(params.group_id));
        if (params.has_suspects === "true") filtered = filtered.filter((m) => m.has_suspects);
        if (params.has_gaps === "true") filtered = filtered.filter((m) => m.has_gaps);
        if (params.search) { const q = params.search.toLowerCase(); filtered = filtered.filter((m) => m.name.toLowerCase().includes(q) || m.member_id.toLowerCase().includes(q)); }
        if (params.min_er_visits) filtered = filtered.filter((m) => m.er_visits_12mo >= parseInt(params.min_er_visits));
        if (params.min_admissions) filtered = filtered.filter((m) => m.admissions_12mo >= parseInt(params.min_admissions));
        if (params.frequent_utilizers === "true") filtered = filtered.filter((m) => m.er_visits_12mo >= 3 || m.admissions_12mo >= 2);
        mockResponse = {
          count: filtered.length,
          avg_raf: filtered.length ? Math.round((filtered.reduce((s, m) => s + m.current_raf, 0) / filtered.length) * 1000) / 1000 : 0,
          total_suspects: filtered.reduce((s, m) => s + m.suspect_count, 0),
          total_gaps: filtered.reduce((s, m) => s + m.gap_count, 0),
        };
      }
      // Members: detail by ID
      else if (/\/api\/members\/M\w+/.test(url)) {
        const memberId = url.match(/\/api\/members\/(M\w+)/)?.[1] || "";
        const member = mockMembers.find((m) => m.member_id === memberId);
        mockResponse = member || { error: "Not found" };
      }
      // Members: list with filtering
      else if (url.includes("/api/members")) {
        const params = config.params || {};
        let filtered = [...mockMembers];
        // Apply global filters
        if (hasFilter && providerIds.length > 0) {
          filtered = filtered.filter((m) => providerIds.includes(m.pcp_id));
        }
        // Apply universal filter conditions if present
        if (params.conditions) {
          try { filtered = applyUniversalConditions(filtered, JSON.parse(params.conditions)); } catch (_e) { /* ignore */ }
        }
        // Apply member-specific filters
        if (params.raf_min) filtered = filtered.filter((m) => m.current_raf >= parseFloat(params.raf_min));
        if (params.raf_max) filtered = filtered.filter((m) => m.current_raf <= parseFloat(params.raf_max));
        if (params.days_not_seen) filtered = filtered.filter((m) => m.days_since_visit >= parseInt(params.days_not_seen));
        if (params.risk_tier) filtered = filtered.filter((m) => m.risk_tier === params.risk_tier);
        if (params.provider_id) filtered = filtered.filter((m) => m.pcp_id === parseInt(params.provider_id));
        if (params.group_id) filtered = filtered.filter((m) => m.group_id === parseInt(params.group_id));
        if (params.has_suspects === "true") filtered = filtered.filter((m) => m.has_suspects);
        if (params.has_gaps === "true") filtered = filtered.filter((m) => m.has_gaps);
        if (params.search) { const q = params.search.toLowerCase(); filtered = filtered.filter((m) => m.name.toLowerCase().includes(q) || m.member_id.toLowerCase().includes(q)); }
        if (params.min_er_visits) filtered = filtered.filter((m) => m.er_visits_12mo >= parseInt(params.min_er_visits));
        if (params.min_admissions) filtered = filtered.filter((m) => m.admissions_12mo >= parseInt(params.min_admissions));
        if (params.frequent_utilizers === "true") filtered = filtered.filter((m) => m.er_visits_12mo >= 3 || m.admissions_12mo >= 2);
        // Sort
        const sortBy = params.sort_by || "raf";
        const order = params.order || "desc";
        const sortKeyMap: Record<string, string> = { raf: "current_raf", name: "name", last_visit: "days_since_visit", suspect_count: "suspect_count", gap_count: "gap_count", spend: "total_spend_12mo", er_visits_12mo: "er_visits_12mo", admissions_12mo: "admissions_12mo" };
        const sortField = sortKeyMap[sortBy] || "current_raf";
        filtered.sort((a: any, b: any) => {
          const av = a[sortField]; const bv = b[sortField];
          if (typeof av === "string") return order === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
          return order === "asc" ? av - bv : bv - av;
        });
        // Paginate
        const page = parseInt(params.page || "1");
        const pageSize = parseInt(params.page_size || "25");
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const start = (page - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize);
        mockResponse = { items, total, page, page_size: pageSize, total_pages: totalPages };
      }

      // Annotations: follow-ups due
      else if (url.includes("/api/annotations/follow-ups")) {
        const allNotes = Object.values(mockAnnotations).flat();
        mockResponse = allNotes.filter(
          (n) => n.requires_follow_up && !n.follow_up_completed
        );
      }
      // Annotations: list for entity
      else if (url.includes("/api/annotations")) {
        const params = config.params || {};
        const entityType = params.entity_type || "";
        const entityId = params.entity_id ? parseInt(params.entity_id) : 0;
        const key = `${entityType}:${entityId}`;
        const notes = mockAnnotations[key] || [];
        // Sort: pinned first, then by date desc
        mockResponse = [...notes].sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      // Watchlist
      else if (url.includes("/api/watchlist")) {
        mockResponse = mockWatchlistItems.sort((a, b) => {
          if (a.has_changes !== b.has_changes) return a.has_changes ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      // Report templates
      else if (url.includes("/api/reports/templates")) {
        mockResponse = mockReportTemplates;
      }
      // Report detail: /api/reports/:id
      else if (/\/api\/reports\/\d+/.test(url)) {
        const reportId = parseInt(url.match(/\/api\/reports\/(\d+)/)![1]);
        mockResponse = mockGeneratedReports.find((r) => r.id === reportId) || mockGeneratedReports[0];
      }
      // Report list
      else if (url.match(/\/api\/reports\/?$/) || url.match(/\/api\/reports\?/)) {
        mockResponse = mockGeneratedReports;
      }

      // Action stats
      else if (url.includes("/api/actions/stats")) {
        // Compute stats dynamically from current mock data
        const open = mockActionItems.filter((a) => a.status === "open").length;
        const inProgress = mockActionItems.filter((a) => a.status === "in_progress").length;
        const completed = mockActionItems.filter((a) => a.status === "completed").length;
        const cancelled = mockActionItems.filter((a) => a.status === "cancelled").length;
        const total = mockActionItems.length;
        const overdue = mockActionItems.filter((a) => (a.status === "open" || a.status === "in_progress") && a.due_date && a.due_date < new Date().toISOString().split("T")[0]).length;
        mockResponse = { total, open, in_progress: inProgress, completed, cancelled, overdue, completion_rate: total > 0 ? Math.round(completed / total * 1000) / 10 : 0 };
      }
      // Action list
      else if (url.match(/\/api\/actions\/?$/) || url.match(/\/api\/actions\?/)) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        let filtered = [...mockActionItems];
        const status = params.get("status");
        const priority = params.get("priority");
        const assignedTo = params.get("assigned_to");
        const sourceType = params.get("source_type");
        if (status) filtered = filtered.filter((a) => a.status === status);
        if (priority) filtered = filtered.filter((a) => a.priority === priority);
        if (assignedTo) filtered = filtered.filter((a) => a.assigned_to === parseInt(assignedTo));
        if (sourceType) filtered = filtered.filter((a) => a.source_type === sourceType);
        mockResponse = filtered;
      }

      // Clinical: patient context
      else if (/\/api\/clinical\/patient\/\d+/.test(url)) {
        const memberId = parseInt(url.match(/\/api\/clinical\/patient\/(\d+)/)![1]);
        mockResponse = mockClinicalPatients[memberId] || { error: "Patient not found" };
      }
      // Clinical: worklist
      else if (url.includes("/api/clinical/worklist")) {
        mockResponse = mockClinicalWorklist;
      }

      // Data Quality: report detail
      else if (/\/api\/data-quality\/reports\/\d+/.test(url)) {
        const reportId = parseInt(url.match(/\/api\/data-quality\/reports\/(\d+)/)![1]);
        mockResponse = mockQualityReports.find((r) => r.id === reportId) || mockQualityReport;
      }
      // Data Quality: reports list
      else if (url.includes("/api/data-quality/reports")) {
        mockResponse = mockQualityReports;
      }
      // Data Quality: quarantine list
      else if (url.includes("/api/data-quality/quarantine")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        let filtered = [...mockQuarantinedRecords];
        const sourceType = params.get("source_type");
        const status = params.get("status");
        if (sourceType) filtered = filtered.filter((r) => r.source_type === sourceType);
        if (status) filtered = filtered.filter((r) => r.status === status);
        mockResponse = filtered;
      }
      // Data Quality: unresolved matches
      else if (url.includes("/api/data-quality/unresolved")) {
        mockResponse = mockUnresolvedMatches;
      }
      // Data Quality: lineage
      else if (url.includes("/api/data-quality/lineage")) {
        mockResponse = mockDataLineage;
      }

      // TCM dashboard
      else if (url.includes("/api/tcm/dashboard")) {
        mockResponse = mockTCMDashboard;
      }
      // TCM active cases
      else if (url.includes("/api/tcm/active")) {
        mockResponse = mockTCMActiveCases;
      }

      // RADV member profile
      else if (/\/api\/radv\/member\/M\w+/.test(url)) {
        const memberId = url.match(/\/api\/radv\/member\/(M\w+)/)?.[1] || "";
        mockResponse = mockRADVMemberProfile[memberId] || { member_id: memberId, member_name: "Unknown", overall_score: 0, hccs: [] };
      }
      // RADV readiness
      else if (url.includes("/api/radv/readiness")) {
        mockResponse = mockRADVReadiness;
      }
      // RADV vulnerable codes
      else if (url.includes("/api/radv/vulnerable")) {
        mockResponse = mockRADVReadiness.weakest_codes;
      }

      // Attribution dashboard
      else if (url.includes("/api/attribution/dashboard")) {
        mockResponse = mockAttributionDashboard;
      }
      // Attribution changes
      else if (url.includes("/api/attribution/changes")) {
        mockResponse = mockAttributionChanges;
      }
      // Attribution churn risk
      else if (url.includes("/api/attribution/churn-risk")) {
        mockResponse = mockChurnRisk;
      }

      // Stop-loss dashboard
      else if (url.includes("/api/stoploss/dashboard")) {
        mockResponse = mockStopLossDashboard;
      }
      // Stop-loss high-cost members
      else if (url.includes("/api/stoploss/high-cost")) {
        mockResponse = mockHighCostMembers;
      }
      // Stop-loss risk corridor
      else if (url.includes("/api/stoploss/risk-corridor")) {
        mockResponse = mockRiskCorridor;
      }

      // Education recommendations (provider-specific)
      else if (url.includes("/api/education/recommendations")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const providerId = parseInt(params.get("provider_id") || config.params?.provider_id || "8");
        mockResponse = mockEducationRecommendations[providerId] || mockEducationRecommendations[8] || [];
      }
      // Education library
      else if (url.includes("/api/education/library")) {
        mockResponse = mockEducationLibrary;
      }

      // AWV: opportunities
      else if (url.includes("/api/awv/opportunities")) {
        mockResponse = mockAWVOpportunities;
      }
      // AWV: dashboard
      else if (url.includes("/api/awv/dashboard")) {
        mockResponse = mockAWVDashboard;
      }
      // AWV: due list
      else if (url.includes("/api/awv/due")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        let filtered = [...mockAWVMembersDue];
        const provId = params.get("provider_id") || config.params?.provider_id;
        const tier = params.get("risk_tier") || config.params?.risk_tier;
        if (provId) filtered = filtered.filter((m) => m.pcp_provider_id === parseInt(provId));
        if (tier) filtered = filtered.filter((m) => m.risk_tier === tier);
        // Sort by RAF descending
        filtered.sort((a, b) => b.current_raf - a.current_raf);
        mockResponse = filtered;
      }
      // AWV: export (return same data as due list)
      else if (url.includes("/api/awv/export")) {
        mockResponse = mockAWVMembersDue;
      }

      // Stars: opportunities
      else if (url.includes("/api/stars/opportunities")) {
        mockResponse = mockStarsOpportunities;
      }
      // Stars: projection
      else if (url.includes("/api/stars/projection")) {
        mockResponse = mockStarsProjection;
      }

      // Temporal: compare
      else if (url.includes("/api/temporal/compare")) {
        mockResponse = mockTemporalComparison;
      }
      // Temporal: timeline
      else if (url.includes("/api/temporal/timeline")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const metric = params.get("metric") || config.params?.metric || "avg_raf";
        mockResponse = mockTemporalTimelineMap[metric] || mockTemporalTimelineMap["avg_raf"];
      }
      // Temporal: changes
      else if (url.includes("/api/temporal/changes")) {
        mockResponse = mockTemporalChangeLog;
      }
      // Temporal: snapshot
      else if (url.includes("/api/temporal/snapshot")) {
        const params = new URLSearchParams(url.split("?")[1] || "");
        const dateParam = params.get("date") || config.params?.date || "2026-03-01";
        mockResponse = dateParam < "2026-01-01" ? mockTemporalSnapshotA : mockTemporalSnapshotB;
      }

      // Alert Rules: presets
      else if (url.includes("/api/alert-rules/presets")) {
        mockResponse = mockAlertRulePresets;
      }
      // Alert Rules: triggers
      else if (url.includes("/api/alert-rules/triggers")) {
        mockResponse = mockAlertRuleTriggers;
      }
      // Alert Rules: evaluate
      else if (url.includes("/api/alert-rules/evaluate")) {
        mockResponse = mockAlertRuleTriggers;
      }
      // Alert Rules: list
      else if (url.includes("/api/alert-rules")) {
        mockResponse = mockAlertRules;
      }

      // Practice Expenses: dashboard
      else if (url.includes("/api/expenses/dashboard")) {
        mockResponse = mockExpenseDashboard;
      }
      // Practice Expenses: staffing
      else if (url.includes("/api/expenses/staffing")) {
        mockResponse = mockStaffingAnalysis;
      }
      // Practice Expenses: trends
      else if (url.includes("/api/expenses/trends")) {
        mockResponse = mockExpenseTrends;
      }
      // Practice Expenses: efficiency
      else if (url.includes("/api/expenses/efficiency")) {
        mockResponse = mockEfficiencyMetrics;
      }
      // Practice Expenses: hiring analysis
      else if (url.includes("/api/expenses/hiring-analysis")) {
        mockResponse = mockHiringAnalysis;
      }
      // Practice Expenses: staff list
      else if (url.includes("/api/expenses/staff")) {
        mockResponse = mockStaffMembers;
      }
      // Practice Expenses: entries
      else if (url.includes("/api/expenses/entries")) {
        mockResponse = mockExpenseEntries;
      }

      // BOI: recommendations
      else if (url.includes("/api/boi/recommendations")) {
        mockResponse = mockBOIRecommendations;
      }
      // BOI: calculate-roi
      else if (url.includes("/api/boi/calculate-roi")) {
        mockResponse = { roi_percentage: 340, investment: 18500, actual_return: 81400 };
      }
      // BOI: intervention detail
      else if (url.match(/\/api\/boi\/interventions\/\d+/)) {
        const idMatch = url.match(/\/interventions\/(\d+)/);
        const id = idMatch ? parseInt(idMatch[1]) : 1;
        mockResponse = mockInterventions.find((i: any) => i.id === id) || mockInterventions[0];
      }
      // BOI: interventions list
      else if (url.includes("/api/boi/interventions")) {
        mockResponse = mockInterventions;
      }
      // BOI: dashboard
      else if (url.includes("/api/boi/dashboard")) {
        mockResponse = mockBOIDashboard;
      }

      // Clinical Exchange: package detail
      else if (url.match(/\/api\/exchange\/package\/\d+/)) {
        mockResponse = mockEvidencePackageExample;
      }
      // Clinical Exchange: dashboard
      else if (url.includes("/api/exchange/dashboard")) {
        mockResponse = mockExchangeDashboard;
      }
      // Clinical Exchange: requests
      else if (url.includes("/api/exchange/requests")) {
        mockResponse = mockExchangeRequests;
      }

      // Risk Accounting: dashboard
      else if (url.includes("/api/risk/dashboard")) {
        mockResponse = mockRiskDashboard;
      }
      // Risk Accounting: capitation
      else if (url.includes("/api/risk/capitation")) {
        mockResponse = { period: null, payments: mockCapitationPayments, total: mockCapitationPayments.reduce((s: number, p: any) => s + p.total_payment, 0) };
      }
      // Risk Accounting: subcap
      else if (url.includes("/api/risk/subcap")) {
        mockResponse = { period: null, payments: mockSubcapPayments, total: mockSubcapPayments.reduce((s: number, p: any) => s + p.total_payment, 0) };
      }
      // Risk Accounting: pools
      else if (url.includes("/api/risk/pools")) {
        mockResponse = mockRiskPools;
      }
      // Risk Accounting: ibnr
      else if (url.includes("/api/risk/ibnr")) {
        mockResponse = mockRiskIBNR;
      }
      // Risk Accounting: surplus-deficit
      else if (url.includes("/api/risk/surplus-deficit")) {
        mockResponse = { by_plan: mockSurplusDeficitByPlan, by_group: mockSurplusDeficitByGroup };
      }
      // Risk Accounting: risk-corridor
      else if (url.includes("/api/risk/risk-corridor")) {
        mockResponse = mockRiskCorridorAnalysis;
      }

      // Care Plans
      else if (url.includes("/api/care-plans/summary")) {
        mockResponse = mockCarePlanSummary;
      }
      else if (url.match(/\/api\/care-plans\/\d+$/)) {
        mockResponse = mockCarePlanDetail;
      }
      else if (url.includes("/api/care-plans")) {
        mockResponse = mockCarePlans;
      }

      // Case Management
      else if (url.includes("/api/cases/dashboard")) {
        mockResponse = mockCaseDashboard;
      }
      else if (url.includes("/api/cases/workload")) {
        mockResponse = mockCaseWorkload;
      }
      else if (url.match(/\/api\/cases\/\d+$/)) {
        mockResponse = mockCaseDetail;
      }
      else if (url.includes("/api/cases")) {
        mockResponse = mockCaseAssignments;
      }

      // Prior Auth / UM
      else if (url.includes("/api/auth-requests/dashboard")) {
        mockResponse = mockAuthDashboard;
      }
      else if (url.includes("/api/auth-requests/compliance")) {
        mockResponse = mockAuthCompliance;
      }
      else if (url.includes("/api/auth-requests/overdue")) {
        mockResponse = mockAuthOverdue;
      }
      else if (url.match(/\/api\/auth-requests\/\d+$/)) {
        mockResponse = mockAuthRequests[0];
      }
      else if (url.includes("/api/auth-requests")) {
        mockResponse = mockAuthRequests;
      }

      // Expenditure: Part A/B/C/D and period
      else if (url.includes("/api/expenditure/by-part")) {
        mockResponse = mockPartAnalysis;
      }
      else if (url.includes("/api/expenditure/by-period")) {
        mockResponse = mockExpenditureByPeriod;
      }

      // Dashboard actions
      else if (url.includes("/api/dashboard/actions")) {
        mockResponse = mockDashboardActions;
      }

      // Utilization Command Center
      else if (url.includes("/api/utilization/follow-up-needed")) {
        mockResponse = mockUtilizationDashboard.follow_up_needed;
      }
      else if (url.includes("/api/utilization/dashboard")) {
        mockResponse = mockUtilizationDashboard;
      }
      else if (url.includes("/api/utilization/facilities")) {
        mockResponse = mockFacilityIntelligence;
      }
      else if (url.includes("/api/utilization/calendar")) {
        mockResponse = mockAdmissionCalendar;
      }
      else if (url.includes("/api/utilization/patterns")) {
        mockResponse = mockAdmissionPatterns;
      }

      // Avoidable Admission Analysis
      else if (url.includes("/api/avoidable/er-detail")) {
        mockResponse = mockAvoidableERDetail;
      }
      else if (url.includes("/api/avoidable/education")) {
        mockResponse = mockAvoidableEducation;
      }
      else if (url.includes("/api/avoidable/analysis")) {
        mockResponse = mockAvoidableAnalysis;
      }

      // FHIR
      else if (url.includes("/api/fhir/capability")) {
        mockResponse = mockFHIRCapability;
      }

      // Interfaces — Universal Integration Layer
      else if (url.match(/\/api\/interfaces\/\d+\/logs/)) {
        const idMatch = url.match(/\/api\/interfaces\/(\d+)\/logs/);
        const ifaceId = idMatch ? parseInt(idMatch[1]) : 0;
        mockResponse = mockInterfaceLogs[ifaceId] || [];
      }
      else if (url.includes("/api/interfaces/status")) {
        mockResponse = mockInterfaceStatus;
      }
      else if (url.match(/\/api\/interfaces\/?$/) || url.match(/\/api\/interfaces\?/)) {
        mockResponse = mockDataInterfaces;
      }

      // Skills / Automation
      else if (url.match(/\/api\/skills\/\d+\/executions/)) {
        const idMatch = url.match(/\/api\/skills\/(\d+)\/executions/);
        const skillId = idMatch ? parseInt(idMatch[1]) : 0;
        mockResponse = mockSkillExecutions.filter((e: any) => e.skill_id === skillId);
      }
      else if (url.includes("/api/skills/presets")) {
        mockResponse = mockSkillPresets;
      }
      else if (url.includes("/api/skills/actions")) {
        mockResponse = mockSkillActions;
      }
      else if (url.includes("/api/skills/suggest")) {
        mockResponse = mockSkillSuggestions;
      }
      else if (url.includes("/api/skills/executions")) {
        mockResponse = mockSkillExecutions;
      }
      else if (url.match(/\/api\/skills\/\d+$/)) {
        const idMatch = url.match(/\/api\/skills\/(\d+)/);
        const skillId = idMatch ? parseInt(idMatch[1]) : 0;
        mockResponse = mockSkills.find((s: any) => s.id === skillId) || null;
      }
      else if (url.match(/\/api\/skills\/?$/) || url.match(/\/api\/skills\?/)) {
        mockResponse = mockSkills;
      }

      // AI Pipeline
      else if (url.match(/\/api\/pipeline\/runs\/\d+/)) {
        const idMatch = url.match(/\/api\/pipeline\/runs\/(\d+)/);
        const runId = idMatch ? parseInt(idMatch[1]) : 0;
        mockResponse = mockPipelineRuns.find((r: any) => r.id === runId) || null;
      }
      else if (url.includes("/api/pipeline/dashboard")) {
        mockResponse = mockPipelineDashboard;
      }
      else if (url.includes("/api/pipeline/rules")) {
        mockResponse = mockPipelineRules;
      }
      else if (url.includes("/api/pipeline/runs")) {
        mockResponse = mockPipelineRuns;
      }

      // Data Protection
      else if (url.includes("/api/data-protection/dashboard")) {
        mockResponse = mockProtectionDashboard;
      }
      else if (url.includes("/api/data-protection/fingerprints")) {
        mockResponse = mockFingerprints;
      }
      else if (url.includes("/api/data-protection/contracts")) {
        mockResponse = mockDataContracts;
      }
      else if (url.includes("/api/data-protection/golden-records")) {
        const params = config.params || {};
        const memberId = params.member_id ? parseInt(params.member_id) : 1001;
        mockResponse = mockGoldenRecords.filter((r: any) => r.member_id === memberId);
      }
      else if (url.includes("/api/data-protection/batches")) {
        mockResponse = mockIngestionBatches;
      }

      // Generic insights
      else if (url.includes("/api/insights")) {
        mockResponse = mockInsights;
      }

      // Onboarding
      else if (url.includes("/api/onboarding/progress")) {
        mockResponse = {
          requirements: [
            { key: "member_roster", name: "Member Roster", priority: "required", status: "complete", row_count: 1423, description: "Demographics, health plan, PCP assignment", where_to_find: "Health plan portal → Member Reports", unlocks: ["Dashboard metrics", "HCC analysis", "Care gap detection"] },
            { key: "medical_claims", name: "Medical Claims (12+ months)", priority: "required", status: "complete", row_count: 48721, date_range: { min: "2025-01-15", max: "2026-03-01" }, description: "Professional, facility, and outpatient claims", where_to_find: "Health plan portal → Claims Extract, or Availity", unlocks: ["HCC suspect detection", "Expenditure analytics", "Utilization patterns"] },
            { key: "provider_roster", name: "Provider Roster", priority: "required", status: "complete", row_count: 47, description: "NPI, specialty, office/TIN assignment", where_to_find: "Internal HR/credentialing, or CAQH ProView", unlocks: ["Provider scorecards", "Practice group comparison"] },
            { key: "eligibility", name: "Eligibility / Enrollment", priority: "recommended", status: "complete", row_count: 1423, description: "Coverage start/end dates, plan product", where_to_find: "Health plan → Eligibility Reports, 834 files", unlocks: ["Accurate member-months", "Coverage gaps", "Churn analysis"] },
            { key: "pharmacy_claims", name: "Pharmacy Claims", priority: "recommended", status: "partial", row_count: 12340, description: "NDC codes, drug names, days supply", where_to_find: "PBM portal (CVS Caremark, Express Scripts, OptumRx)", unlocks: ["Medication-diagnosis gaps", "PDC quality measures"] },
            { key: "prior_year_hcc", name: "Prior Year HCC Captures", priority: "recommended", status: "complete", row_count: 892, description: "Last year's confirmed HCC codes per member", where_to_find: "Prior year RAF report from health plan", unlocks: ["Recapture gap detection"] },
            { key: "capitation", name: "Capitation / Premium Data", priority: "enhances", status: "complete", row_count: 24, description: "Monthly capitation payments by plan", where_to_find: "Monthly capitation statements from health plan", unlocks: ["P&L dashboard", "MLR tracking"] },
            { key: "adt_config", name: "ADT Feed Configuration", priority: "enhances", status: "not_loaded", row_count: 0, description: "Real-time hospital admit/discharge alerts", where_to_find: "Bamboo Health, Availity Patient Alerts", unlocks: ["Live census", "TCM case management"] },
            { key: "historical_claims", name: "Historical Claims (24-36 months)", priority: "enhances", status: "partial", row_count: 48721, months_loaded: 14, description: "Extended claims for trending", where_to_find: "Same as medical claims, broader date range", unlocks: ["Year-over-year trending", "Seasonal patterns"] },
            { key: "lab_results", name: "Lab Results", priority: "enhances", status: "not_loaded", row_count: 0, description: "HbA1c, eGFR, lipid panels", where_to_find: "Reference lab portal (Quest, LabCorp) or EMR", unlocks: ["Clinical decision support"] },
          ],
          required_complete: 3,
          required_total: 3,
          recommended_complete: 2,
          recommended_total: 3,
          overall_pct: 78,
          phase: "core_complete",
          hcc_analysis_run: true,
          ready_for_analytics: true,
        };
      }
      else if (url.includes("/api/onboarding/requirements")) {
        mockResponse = []; // progress endpoint has the full data
      }
      else if (url.includes("/api/onboarding/org-structure")) {
        mockResponse = {
          groups: [
            { id: 1, name: "Pinellas Primary Care", group_type: "practice", relationship_type: "owned", tin: "***-***4567", city: "St. Petersburg", state: "FL", zip_code: "33701", county_code: "10510", bonus_pct: 5.0, provider_count: 12, providers: [] },
            { id: 2, name: "Clearwater Family Medicine", group_type: "practice", relationship_type: "owned", tin: "***-***8901", city: "Clearwater", state: "FL", zip_code: "33755", county_code: "10510", bonus_pct: 5.0, provider_count: 8, providers: [] },
            { id: 3, name: "Palm Harbor Specialists", group_type: "practice", relationship_type: "affiliated", tin: "***-***2345", city: "Palm Harbor", state: "FL", zip_code: "34683", county_code: "10510", bonus_pct: 5.0, provider_count: 6, providers: [] },
          ],
          unassigned_providers: [],
          total_groups: 3,
          total_providers: 26,
          total_unassigned: 0,
        };
      }
      else if (url.includes("/api/onboarding/payer-guidance")) {
        mockResponse = { payer: "Humana", data_type: "claims", guidance: "In the Humana portal, go to Availity → Reports → Claims Detail → select 'All Claims' and date range of last 24 months → Export CSV." };
      }
    }

    const data = mockResponse !== null ? mockResponse : null;

    return Promise.resolve({
      data,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    } as any);
  };
}
