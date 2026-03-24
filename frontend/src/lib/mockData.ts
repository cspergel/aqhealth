// ---------------------------------------------------------------------------
// Realistic mock data for demo mode
// Every shape matches the EXACT interfaces consumed by page components.
// ---------------------------------------------------------------------------

// ---- Dashboard ----

export const mockDashboard = {
  metrics: {
    total_lives: 4832,
    avg_raf: 1.247,
    recapture_rate: 68.4,
    suspect_inventory: { count: 1847, total_raf_value: 312.5, total_annual_value: 3437500 },
    total_pmpm: 1247,
    mlr: 84.2,
  },
  raf_distribution: [
    { range: "0-0.5", count: 820 },
    { range: "0.5-1.0", count: 1450 },
    { range: "1.0-1.5", count: 1230 },
    { range: "1.5-2.0", count: 680 },
    { range: "2.0-2.5", count: 380 },
    { range: "2.5-3.0", count: 172 },
    { range: "3.0+", count: 100 },
  ],
  revenue_opportunities: [
    { hcc_code: 18, hcc_label: "Diabetes with Complications", member_count: 342, total_raf: 103.2, total_value: 1135200 },
    { hcc_code: 85, hcc_label: "CHF / Heart Failure", member_count: 189, total_raf: 61.0, total_value: 671000 },
    { hcc_code: 138, hcc_label: "CKD Stage 3-5", member_count: 267, total_raf: 18.4, total_value: 202400 },
    { hcc_code: 111, hcc_label: "COPD / Chronic Lung", member_count: 198, total_raf: 55.4, total_value: 609400 },
    { hcc_code: 107, hcc_label: "Vascular Disease", member_count: 156, total_raf: 42.1, total_value: 463100 },
    { hcc_code: 59, hcc_label: "Depression / Behavioral", member_count: 284, total_raf: 87.8, total_value: 965800 },
    { hcc_code: 22, hcc_label: "Morbid Obesity", member_count: 134, total_raf: 33.5, total_value: 368500 },
    { hcc_code: 21, hcc_label: "Malnutrition", member_count: 91, total_raf: 41.4, total_value: 455400 },
  ],
  cost_hotspots: [
    { category: "inpatient", total_spend: 5940000, claim_count: 412, pmpm: 412, benchmark_pmpm: 380, variance_pct: 8.4 },
    { category: "ed_observation", total_spend: 2695000, claim_count: 1840, pmpm: 187, benchmark_pmpm: 155, variance_pct: 20.6 },
    { category: "pharmacy", total_spend: 2851000, claim_count: 9200, pmpm: 198, benchmark_pmpm: 175, variance_pct: 13.1 },
  ],
  provider_leaderboard: {
    top: [
      { id: 1, name: "Dr. Sarah Patel", specialty: "Internal Medicine", panel_size: 342, capture_rate: 84.2 },
      { id: 2, name: "Dr. James Rivera", specialty: "Family Medicine", panel_size: 289, capture_rate: 79.8 },
      { id: 3, name: "Dr. Lisa Chen", specialty: "Geriatrics", panel_size: 198, capture_rate: 77.1 },
      { id: 4, name: "Dr. Michael Torres", specialty: "Internal Medicine", panel_size: 267, capture_rate: 75.4 },
      { id: 5, name: "Dr. Angela Brooks", specialty: "Family Medicine", panel_size: 312, capture_rate: 73.9 },
    ],
    bottom: [
      { id: 8, name: "Dr. Robert Kim", specialty: "Internal Medicine", panel_size: 234, capture_rate: 42.1 },
      { id: 9, name: "Dr. David Wilson", specialty: "Family Medicine", panel_size: 178, capture_rate: 45.8 },
      { id: 7, name: "Dr. Karen Murphy", specialty: "Internal Medicine", panel_size: 291, capture_rate: 48.3 },
      { id: 6, name: "Dr. Thomas Lee", specialty: "Family Medicine", panel_size: 156, capture_rate: 51.2 },
      { id: 10, name: "Dr. Jennifer Adams", specialty: "Geriatrics", panel_size: 203, capture_rate: 53.7 },
    ],
  },
  care_gap_summary: [
    { measure_code: "CDC-HbA1c", measure_name: "Diabetes HbA1c Control", category: "Diabetes", total_gaps: 892, open_count: 284, closed_count: 608, closure_rate: 68.2 },
    { measure_code: "BCS", measure_name: "Breast Cancer Screening", category: "Cancer", total_gaps: 1240, open_count: 322, closed_count: 918, closure_rate: 74.0 },
    { measure_code: "COL", measure_name: "Colorectal Screening", category: "Cancer", total_gaps: 2100, open_count: 601, closed_count: 1499, closure_rate: 71.4 },
    { measure_code: "SPD", measure_name: "Statin Adherence (Diabetes)", category: "Diabetes", total_gaps: 780, open_count: 147, closed_count: 633, closure_rate: 81.2 },
    { measure_code: "KED", measure_name: "Kidney Health Evaluation", category: "Diabetes", total_gaps: 892, open_count: 524, closed_count: 368, closure_rate: 41.2 },
  ],
};

// ---- Dashboard Insights ----
// InsightPanel + InsightCard expect category: "revenue" | "cost" | "quality" | "provider" | "trend"

export const mockInsights: {
  id: number;
  category: "revenue" | "cost" | "quality" | "provider" | "trend";
  title: string;
  description: string;
  dollar_impact: number | null;
  recommended_action: string | null;
  confidence: number | null;
}[] = [
  {
    id: 1, category: "revenue", title: "High-value member cluster needs immediate attention",
    description: "47 members have 3+ suspect HCCs, 2+ open care gaps, AND a hospital admission in the last 90 days. Combined RAF uplift opportunity: $412K/year.",
    dollar_impact: 412000, recommended_action: "Prioritize these 47 members for care coordinator outreach this week.", confidence: 0.89,
  },
  {
    id: 2, category: "cost", title: "Memorial Hospital readmission rate 47% above benchmark",
    description: "Memorial Hospital's 30-day readmission rate is 16.2% vs 11% network average. 23 potentially avoidable readmissions in the past 12 months. Estimated excess spend: $423K.",
    dollar_impact: 423000, recommended_action: "Engage Memorial Hospital care management team for joint readmission review.", confidence: 0.92,
  },
  {
    id: 3, category: "revenue", title: "142 members on anticoagulants without AFib coded",
    description: "Population scan found 142 members filling warfarin or apixaban prescriptions with no atrial fibrillation (I48.x) diagnosis in current year claims.",
    dollar_impact: 86000, recommended_action: "Generate suspect flags for these 142 members and route to their PCPs.", confidence: 0.85,
  },
  {
    id: 4, category: "quality", title: "Statin adherence dropping \u2014 4-star threshold at risk",
    description: "PDC for statin adherence (D12) dropped 4.1 points this quarter to 78.3%. You\u2019re now within 2 points of falling below the 4-star cutpoint (76%). This is a triple-weighted measure.",
    dollar_impact: null, recommended_action: "Launch pharmacist outreach campaign targeting 89 members below 80% PDC.", confidence: 0.94,
  },
  {
    id: 5, category: "provider", title: "3 PCPs code unspecified diabetes 78% of the time",
    description: "Drs. Kim, Wilson, and Murphy code E11.9 (Type 2 diabetes unspecified) on 78% of their diabetic patients. Network peers specify complications 44% of the time.",
    dollar_impact: 67000, recommended_action: "Schedule coding education sessions with these three providers.", confidence: 0.88,
  },
];

// ---- Suspects Page ----
// SuspectsPage expects: summary -> res.data (Summary), suspects -> res.data.items + res.data.total_pages

export const mockSuspectsSummary = {
  total_suspects: 1847,
  total_raf_opportunity: 312.5,
  estimated_annual_value: 3437500,
  capture_rate: 32.4,
  providers: [
    { id: "1", name: "Dr. Sarah Patel" },
    { id: "2", name: "Dr. James Rivera" },
    { id: "3", name: "Dr. Lisa Chen" },
    { id: "4", name: "Dr. Michael Torres" },
    { id: "5", name: "Dr. Angela Brooks" },
    { id: "8", name: "Dr. Robert Kim" },
    { id: "9", name: "Dr. David Wilson" },
  ],
};

// ChaseList SuspectRow shape
export const mockSuspectsData = {
  items: [
    { member_id: "M1001", member_name: "Margaret Chen", dob: "1953-08-14", pcp: "Dr. Rivera", current_raf: 1.847, projected_raf: 2.312, uplift: 0.465, top_suspects: [{ condition_name: "CHF", suspect_type: "recapture" }, { condition_name: "Malnutrition", suspect_type: "med_dx_gap" }, { condition_name: "Morbid Obesity", suspect_type: "specificity" }], status: "open", suspect_count: 3 },
    { member_id: "M1002", member_name: "Robert Williams", dob: "1958-03-22", pcp: "Dr. Patel", current_raf: 1.234, projected_raf: 1.698, uplift: 0.464, top_suspects: [{ condition_name: "Depression", suspect_type: "recapture" }, { condition_name: "Vascular Disease", suspect_type: "historical" }], status: "open", suspect_count: 2 },
    { member_id: "M1003", member_name: "Dorothy Martinez", dob: "1945-11-07", pcp: "Dr. Chen", current_raf: 2.456, projected_raf: 2.812, uplift: 0.356, top_suspects: [{ condition_name: "CKD Stage 4", suspect_type: "specificity" }, { condition_name: "COPD", suspect_type: "recapture" }, { condition_name: "Malnutrition", suspect_type: "med_dx_gap" }, { condition_name: "AFib", suspect_type: "near_miss" }], status: "open", suspect_count: 4 },
    { member_id: "M1004", member_name: "James Thornton", dob: "1948-06-30", pcp: "Dr. Torres", current_raf: 0.800, projected_raf: 1.245, uplift: 0.445, top_suspects: [{ condition_name: "Diabetes w/ complications", suspect_type: "specificity" }, { condition_name: "CKD", suspect_type: "recapture" }], status: "open", suspect_count: 2 },
    { member_id: "M1005", member_name: "Patricia Okafor", dob: "1942-01-15", pcp: "Dr. Brooks", current_raf: 1.100, projected_raf: 1.380, uplift: 0.280, top_suspects: [{ condition_name: "Depression", suspect_type: "recapture" }], status: "captured", suspect_count: 1 },
    { member_id: "M1006", member_name: "Gerald Foster", dob: "1955-09-18", pcp: "Dr. Rivera", current_raf: 0.950, projected_raf: 1.502, uplift: 0.552, top_suspects: [{ condition_name: "CHF", suspect_type: "recapture" }, { condition_name: "Diabetes w/ CKD", suspect_type: "specificity" }, { condition_name: "COPD", suspect_type: "historical" }], status: "open", suspect_count: 3 },
    { member_id: "M1007", member_name: "Helen Washington", dob: "1940-04-25", pcp: "Dr. Patel", current_raf: 2.891, projected_raf: 3.234, uplift: 0.343, top_suspects: [{ condition_name: "Malnutrition", suspect_type: "med_dx_gap" }, { condition_name: "Pressure Ulcer", suspect_type: "near_miss" }], status: "open", suspect_count: 2 },
    { member_id: "M1008", member_name: "Frank Nguyen", dob: "1952-12-03", pcp: "Dr. Kim", current_raf: 1.456, projected_raf: 1.890, uplift: 0.434, top_suspects: [{ condition_name: "AFib", suspect_type: "recapture" }, { condition_name: "Vascular Disease", suspect_type: "historical" }, { condition_name: "Obesity", suspect_type: "specificity" }], status: "open", suspect_count: 3 },
    { member_id: "M1009", member_name: "Barbara Johnson", dob: "1947-07-21", pcp: "Dr. Chen", current_raf: 1.678, projected_raf: 2.012, uplift: 0.334, top_suspects: [{ condition_name: "Depression", suspect_type: "recapture" }, { condition_name: "Diabetes w/ complications", suspect_type: "specificity" }], status: "open", suspect_count: 2 },
    { member_id: "M1010", member_name: "William Davis", dob: "1950-10-09", pcp: "Dr. Wilson", current_raf: 1.123, projected_raf: 1.567, uplift: 0.444, top_suspects: [{ condition_name: "CKD Stage 3", suspect_type: "recapture" }, { condition_name: "COPD", suspect_type: "historical" }, { condition_name: "CHF", suspect_type: "near_miss" }], status: "open", suspect_count: 3 },
  ],
  total_pages: 185,
};

// MemberDetail expects: { suspects: Suspect[], medications: { name, dx_linked }[] }
// Suspect shape: id, condition_name, icd10_code, hcc_code, raf_value, annual_value, evidence_summary, confidence_score, suspect_type, status
export const mockMemberDetails: Record<string, { suspects: { id: string; condition_name: string; icd10_code: string; hcc_code: string; raf_value: number; annual_value: number; evidence_summary: string; confidence_score: number; suspect_type: string; status: string }[]; medications: { name: string; dx_linked: boolean }[] }> = {
  M1001: {
    suspects: [
      { id: "S1001", condition_name: "CHF / Heart Failure", icd10_code: "I50.9", hcc_code: "HCC 85", raf_value: 0.323, annual_value: 3553, evidence_summary: "Last coded in PY2024. Carvedilol and furosemide active. Echo shows EF 40%. High confidence recapture.", confidence_score: 0.92, suspect_type: "recapture", status: "open" },
      { id: "S1002", condition_name: "Malnutrition", icd10_code: "E44.1", hcc_code: "HCC 21", raf_value: 0.455, annual_value: 5005, evidence_summary: "BMI 17.2, albumin 2.8 g/dL. On Ensure supplements. No malnutrition Dx coded this year.", confidence_score: 0.87, suspect_type: "med_dx_gap", status: "open" },
      { id: "S1003", condition_name: "Morbid Obesity", icd10_code: "E66.01", hcc_code: "HCC 22", raf_value: 0.250, annual_value: 2750, evidence_summary: "BMI documented at 42.1 but coded as E66.9 (unspecified). Should be E66.01 for morbid obesity.", confidence_score: 0.81, suspect_type: "specificity", status: "open" },
    ],
    medications: [
      { name: "Carvedilol 25mg", dx_linked: true },
      { name: "Furosemide 40mg", dx_linked: true },
      { name: "Ensure Plus", dx_linked: false },
      { name: "Metformin 1000mg", dx_linked: true },
      { name: "Atorvastatin 40mg", dx_linked: true },
    ],
  },
  M1002: {
    suspects: [
      { id: "S2001", condition_name: "Major Depression", icd10_code: "F33.1", hcc_code: "HCC 59", raf_value: 0.309, annual_value: 3399, evidence_summary: "PHQ-9 score 18 documented. Sertraline active. Depression last coded in 2024.", confidence_score: 0.90, suspect_type: "recapture", status: "open" },
      { id: "S2002", condition_name: "Peripheral Vascular Disease", icd10_code: "I73.9", hcc_code: "HCC 107", raf_value: 0.288, annual_value: 3168, evidence_summary: "ABI 0.7 on file. On cilostazol. History of claudication. Not coded current year.", confidence_score: 0.84, suspect_type: "historical", status: "open" },
    ],
    medications: [
      { name: "Sertraline 100mg", dx_linked: true },
      { name: "Cilostazol 100mg", dx_linked: false },
      { name: "Lisinopril 20mg", dx_linked: true },
    ],
  },
};

// ---- Expenditure Page ----
// ExpenditurePage expects res.data -> Overview { total_spend, pmpm, mlr, member_count, categories[] }
// Category: { key, label, total_spend, pmpm, pct_of_total, claim_count, trend_vs_prior }

export const mockExpenditure = {
  total_spend: 18240000,
  pmpm: 1247,
  mlr: 0.842,
  member_count: 4832,
  categories: [
    { key: "inpatient", label: "Inpatient", total_spend: 5940000, pmpm: 412, pct_of_total: 33, claim_count: 412, trend_vs_prior: 3.2 },
    { key: "ed_observation", label: "ED / Observation", total_spend: 2695000, pmpm: 187, pct_of_total: 15, claim_count: 1840, trend_vs_prior: -2.1 },
    { key: "professional", label: "Professional", total_spend: 3225000, pmpm: 224, pct_of_total: 18, claim_count: 14200, trend_vs_prior: 1.8 },
    { key: "snf_postacute", label: "SNF / Post-Acute", total_spend: 2246000, pmpm: 156, pct_of_total: 13, claim_count: 320, trend_vs_prior: -4.2 },
    { key: "pharmacy", label: "Pharmacy", total_spend: 2851000, pmpm: 198, pct_of_total: 16, claim_count: 9200, trend_vs_prior: 5.1 },
    { key: "other", label: "Ancillary / Other", total_spend: 1283000, pmpm: 70, pct_of_total: 5, claim_count: 3100, trend_vs_prior: 0.8 },
  ],
};

// ---- Providers Page ----
// ProviderTable ProviderRow: id, npi, name, specialty, panel_size, capture_rate, recapture_rate, avg_raf, panel_pmpm, gap_closure_rate, tier

export const mockProviders: {
  id: number;
  npi: string;
  name: string;
  specialty: string | null;
  panel_size: number;
  capture_rate: number | null;
  recapture_rate: number | null;
  avg_raf: number | null;
  panel_pmpm: number | null;
  gap_closure_rate: number | null;
  tier: "green" | "amber" | "red" | "gray";
}[] = [
  { id: 1, npi: "1234567890", name: "Dr. Sarah Patel", specialty: "Internal Medicine", panel_size: 342, capture_rate: 84.2, recapture_rate: 91.3, avg_raf: 1.45, panel_pmpm: 1180, gap_closure_rate: 78.4, tier: "green" },
  { id: 2, npi: "1234567891", name: "Dr. James Rivera", specialty: "Family Medicine", panel_size: 289, capture_rate: 79.8, recapture_rate: 85.2, avg_raf: 1.32, panel_pmpm: 1095, gap_closure_rate: 72.1, tier: "green" },
  { id: 3, npi: "1234567892", name: "Dr. Lisa Chen", specialty: "Geriatrics", panel_size: 198, capture_rate: 77.1, recapture_rate: 82.7, avg_raf: 1.89, panel_pmpm: 1420, gap_closure_rate: 81.2, tier: "green" },
  { id: 4, npi: "1234567893", name: "Dr. Michael Torres", specialty: "Internal Medicine", panel_size: 267, capture_rate: 75.4, recapture_rate: 79.8, avg_raf: 1.28, panel_pmpm: 1150, gap_closure_rate: 69.3, tier: "green" },
  { id: 5, npi: "1234567894", name: "Dr. Angela Brooks", specialty: "Family Medicine", panel_size: 312, capture_rate: 73.9, recapture_rate: 78.1, avg_raf: 1.21, panel_pmpm: 1210, gap_closure_rate: 65.8, tier: "amber" },
  { id: 6, npi: "1234567895", name: "Dr. Thomas Lee", specialty: "Family Medicine", panel_size: 156, capture_rate: 51.2, recapture_rate: 58.4, avg_raf: 1.05, panel_pmpm: 1340, gap_closure_rate: 52.1, tier: "red" },
  { id: 7, npi: "1234567896", name: "Dr. Karen Murphy", specialty: "Internal Medicine", panel_size: 291, capture_rate: 48.3, recapture_rate: 54.2, avg_raf: 1.18, panel_pmpm: 1480, gap_closure_rate: 48.7, tier: "red" },
  { id: 8, npi: "1234567897", name: "Dr. Robert Kim", specialty: "Internal Medicine", panel_size: 234, capture_rate: 42.1, recapture_rate: 48.9, avg_raf: 1.12, panel_pmpm: 1520, gap_closure_rate: 41.3, tier: "red" },
  { id: 9, npi: "1234567898", name: "Dr. David Wilson", specialty: "Family Medicine", panel_size: 178, capture_rate: 45.8, recapture_rate: 52.1, avg_raf: 0.98, panel_pmpm: 1380, gap_closure_rate: 44.9, tier: "red" },
  { id: 10, npi: "1234567899", name: "Dr. Jennifer Adams", specialty: "Geriatrics", panel_size: 203, capture_rate: 53.7, recapture_rate: 61.3, avg_raf: 1.67, panel_pmpm: 1560, gap_closure_rate: 55.2, tier: "amber" },
];

// ---- Care Gaps Page ----
// GapTable MeasureSummary: measure_id, code, name, category, stars_weight, total_eligible, open_gaps, closed_gaps, closure_rate, star_level, target_rate, gaps_to_next_star

export const mockCareGapSummaries = [
  { measure_id: 1, code: "CDC-HbA1c", name: "Comprehensive Diabetes Care \u2014 HbA1c", category: "Diabetes", stars_weight: 3, total_eligible: 892, open_gaps: 284, closed_gaps: 608, closure_rate: 68.2, star_level: 3, target_rate: 75.0, gaps_to_next_star: 61 },
  { measure_id: 2, code: "CDC-Eye", name: "Comprehensive Diabetes Care \u2014 Eye Exam", category: "Diabetes", stars_weight: 3, total_eligible: 892, open_gaps: 372, closed_gaps: 520, closure_rate: 58.3, star_level: 3, target_rate: 70.0, gaps_to_next_star: 105 },
  { measure_id: 3, code: "BCS", name: "Breast Cancer Screening", category: "Cancer Screening", stars_weight: 1, total_eligible: 1240, open_gaps: 322, closed_gaps: 918, closure_rate: 74.0, star_level: 4, target_rate: 80.0, gaps_to_next_star: 74 },
  { measure_id: 4, code: "COL", name: "Colorectal Cancer Screening", category: "Cancer Screening", stars_weight: 1, total_eligible: 2100, open_gaps: 601, closed_gaps: 1499, closure_rate: 71.4, star_level: 4, target_rate: 78.0, gaps_to_next_star: 139 },
  { measure_id: 5, code: "CBP", name: "Controlling High Blood Pressure", category: "Cardiovascular", stars_weight: 3, total_eligible: 1560, open_gaps: 435, closed_gaps: 1125, closure_rate: 72.1, star_level: 4, target_rate: 80.0, gaps_to_next_star: 123 },
  { measure_id: 6, code: "SPD", name: "Statin Therapy \u2014 Adherence (Diabetes)", category: "Diabetes", stars_weight: 3, total_eligible: 780, open_gaps: 147, closed_gaps: 633, closure_rate: 81.2, star_level: 4, target_rate: 85.0, gaps_to_next_star: 30 },
  { measure_id: 7, code: "KED", name: "Kidney Health Evaluation for Diabetes", category: "Diabetes", stars_weight: 1, total_eligible: 892, open_gaps: 524, closed_gaps: 368, closure_rate: 41.2, star_level: 2, target_rate: 55.0, gaps_to_next_star: 123 },
  { measure_id: 8, code: "COA-MedReview", name: "Care for Older Adults \u2014 Medication Review", category: "Geriatric", stars_weight: 1, total_eligible: 1800, open_gaps: 252, closed_gaps: 1548, closure_rate: 86.0, star_level: 4, target_rate: 90.0, gaps_to_next_star: 72 },
  { measure_id: 9, code: "MRP", name: "Medication Reconciliation Post-Discharge", category: "Transitions", stars_weight: 1, total_eligible: 420, open_gaps: 137, closed_gaps: 283, closure_rate: 67.4, star_level: 3, target_rate: 75.0, gaps_to_next_star: 32 },
  { measure_id: 10, code: "FMC", name: "Follow-Up After ED Visit (Chronic)", category: "Transitions", stars_weight: 1, total_eligible: 380, open_gaps: 182, closed_gaps: 198, closure_rate: 52.1, star_level: 3, target_rate: 65.0, gaps_to_next_star: 49 },
];

// MeasureConfig Measure: id, code, name, description, category, stars_weight, target_rate, star_3/4/5_cutpoint, is_custom, is_active, detection_logic

export const mockCareGapMeasures: {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  stars_weight: number;
  target_rate: number | null;
  star_3_cutpoint: number | null;
  star_4_cutpoint: number | null;
  star_5_cutpoint: number | null;
  is_custom: boolean;
  is_active: boolean;
  detection_logic: Record<string, unknown> | null;
}[] = [
  { id: 1, code: "CDC-HbA1c", name: "Comprehensive Diabetes Care \u2014 HbA1c", description: "Percentage of members with diabetes who had HbA1c control (<8.0%)", category: "Diabetes", stars_weight: 3, target_rate: 75.0, star_3_cutpoint: 60.0, star_4_cutpoint: 72.0, star_5_cutpoint: 82.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 2, code: "CDC-Eye", name: "Comprehensive Diabetes Care \u2014 Eye Exam", description: "Percentage of members with diabetes who had a retinal eye exam", category: "Diabetes", stars_weight: 3, target_rate: 70.0, star_3_cutpoint: 52.0, star_4_cutpoint: 65.0, star_5_cutpoint: 76.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 3, code: "BCS", name: "Breast Cancer Screening", description: "Percentage of women 50-74 who had a mammogram in past 2 years", category: "Cancer Screening", stars_weight: 1, target_rate: 80.0, star_3_cutpoint: 65.0, star_4_cutpoint: 74.0, star_5_cutpoint: 82.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 4, code: "COL", name: "Colorectal Cancer Screening", description: "Percentage of members 45-75 appropriately screened for colorectal cancer", category: "Cancer Screening", stars_weight: 1, target_rate: 78.0, star_3_cutpoint: 62.0, star_4_cutpoint: 71.0, star_5_cutpoint: 80.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 5, code: "CBP", name: "Controlling High Blood Pressure", description: "Percentage of members with hypertension whose BP was adequately controlled", category: "Cardiovascular", stars_weight: 3, target_rate: 80.0, star_3_cutpoint: 60.0, star_4_cutpoint: 72.0, star_5_cutpoint: 82.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 6, code: "SPD", name: "Statin Therapy \u2014 Adherence (Diabetes)", description: "Percentage of members with diabetes and statin Rx with PDC >= 80%", category: "Diabetes", stars_weight: 3, target_rate: 85.0, star_3_cutpoint: 72.0, star_4_cutpoint: 80.0, star_5_cutpoint: 88.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 7, code: "KED", name: "Kidney Health Evaluation for Diabetes", description: "Percentage of members with diabetes who had kidney health evaluation", category: "Diabetes", stars_weight: 1, target_rate: 55.0, star_3_cutpoint: 33.0, star_4_cutpoint: 45.0, star_5_cutpoint: 58.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 8, code: "COA-MedReview", name: "Care for Older Adults \u2014 Medication Review", description: "Percentage of adults 66+ who had a medication review", category: "Geriatric", stars_weight: 1, target_rate: 90.0, star_3_cutpoint: 78.0, star_4_cutpoint: 86.0, star_5_cutpoint: 92.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 9, code: "MRP", name: "Medication Reconciliation Post-Discharge", description: "Percentage of discharges with medication reconciliation within 30 days", category: "Transitions", stars_weight: 1, target_rate: 75.0, star_3_cutpoint: 55.0, star_4_cutpoint: 67.0, star_5_cutpoint: 78.0, is_custom: false, is_active: true, detection_logic: null },
  { id: 10, code: "FMC", name: "Follow-Up After ED Visit (Chronic)", description: "Percentage of ED visits for chronic conditions with follow-up within 7 days", category: "Transitions", stars_weight: 1, target_rate: 65.0, star_3_cutpoint: 42.0, star_4_cutpoint: 55.0, star_5_cutpoint: 68.0, is_custom: false, is_active: true, detection_logic: null },
];

// Mock member-level care gaps for the detail view
// MemberGap: id, member_id, member_name, measure_code, measure_name, status, due_date, closed_date, measurement_year, stars_weight, provider_name
export const mockMemberGaps = [
  { id: 101, member_id: 1001, member_name: "Margaret Chen", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. James Rivera" },
  { id: 102, member_id: 1002, member_name: "Robert Williams", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Sarah Patel" },
  { id: 103, member_id: 1003, member_name: "Dorothy Martinez", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "closed", due_date: "2026-06-30", closed_date: "2026-02-15", measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Lisa Chen" },
  { id: 104, member_id: 1004, member_name: "James Thornton", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Michael Torres" },
  { id: 105, member_id: 1005, member_name: "Patricia Okafor", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Angela Brooks" },
];
