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

// ---- Expenditure Drill-Down (Deep) ----
// Each category returns: kpis[], sections[] where sections can be table or insights type

export const mockExpenditureDrillDowns: Record<string, {
  category: string;
  label: string;
  total_spend: number;
  pmpm: number;
  claim_count: number;
  unique_members: number;
  kpis: { label: string; value: string; benchmark?: string; status?: string }[];
  sections: {
    id: string;
    title: string;
    type: "table" | "insights";
    columns?: { key: string; label: string; numeric?: boolean; format?: string; benchmark?: number; invertBenchmark?: boolean }[];
    rows?: Record<string, unknown>[];
    items?: { title: string; description: string; dollar_impact: number | null; category: "cost" | "revenue" | "quality" }[];
  }[];
}> = {
  inpatient: {
    category: "inpatient",
    label: "Inpatient",
    total_spend: 5940000,
    pmpm: 412,
    claim_count: 412,
    unique_members: 247,
    kpis: [
      { label: "Admits / 1K", value: "85.3", benchmark: "72.0", status: "over" },
      { label: "Cost / Admit", value: "$14,417", benchmark: "$12,800", status: "over" },
      { label: "ALOS", value: "4.8 days", benchmark: "4.2 days", status: "over" },
      { label: "Readmit Rate (30d)", value: "14.2%", benchmark: "11.0%", status: "over" },
      { label: "HCC Capture During Admit", value: "62.4%", benchmark: "75.0%", status: "under" },
      { label: "Total Spend", value: "$5.9M" },
    ],
    sections: [
      {
        id: "facilities",
        title: "Facility Comparison",
        type: "table",
        columns: [
          { key: "name", label: "Facility" },
          { key: "admits", label: "Admits", numeric: true },
          { key: "alos", label: "ALOS", numeric: true },
          { key: "cost_per_admit", label: "Cost/Admit", numeric: true, format: "dollar" },
          { key: "readmit_rate", label: "Readmit %", numeric: true, format: "pct", benchmark: 11.0 },
          { key: "hcc_capture_rate", label: "HCC Capture %", numeric: true, format: "pct", benchmark: 75.0, invertBenchmark: true },
          { key: "top_drgs", label: "Top DRGs" },
        ],
        rows: [
          { name: "Memorial Regional Medical Center", admits: 98, alos: 5.4, cost_per_admit: 18200, readmit_rate: 16.2, hcc_capture_rate: 54.1, top_drgs: "DRG 291, 470, 392" },
          { name: "St. Joseph Hospital", admits: 84, alos: 4.6, cost_per_admit: 14800, readmit_rate: 12.8, hcc_capture_rate: 68.3, top_drgs: "DRG 470, 291, 766" },
          { name: "University Health System", admits: 72, alos: 5.1, cost_per_admit: 16400, readmit_rate: 11.2, hcc_capture_rate: 71.2, top_drgs: "DRG 291, 871, 470" },
          { name: "Community General Hospital", admits: 64, alos: 4.2, cost_per_admit: 12100, readmit_rate: 10.4, hcc_capture_rate: 72.8, top_drgs: "DRG 392, 470, 291" },
          { name: "Mercy Medical Center", admits: 52, alos: 4.0, cost_per_admit: 11500, readmit_rate: 9.8, hcc_capture_rate: 76.4, top_drgs: "DRG 470, 766, 392" },
          { name: "Lakeside Health", admits: 42, alos: 4.8, cost_per_admit: 13200, readmit_rate: 14.7, hcc_capture_rate: 58.9, top_drgs: "DRG 871, 291, 190" },
        ],
      },
      {
        id: "provider_patterns",
        title: "Admitting Provider Patterns",
        type: "table",
        columns: [
          { key: "pcp", label: "PCP" },
          { key: "panel_size", label: "Panel", numeric: true },
          { key: "admits", label: "Admits", numeric: true },
          { key: "admit_rate_per_1k", label: "Admits/1K", numeric: true, benchmark: 72.0 },
          { key: "preferred_facility", label: "Primary Facility" },
          { key: "avg_cost_per_admit", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "readmit_rate", label: "Readmit %", numeric: true, format: "pct", benchmark: 11.0 },
        ],
        rows: [
          { pcp: "Dr. Robert Kim", panel_size: 234, admits: 38, admit_rate_per_1k: 162.4, preferred_facility: "Memorial Regional", avg_cost_per_admit: 17800, readmit_rate: 18.4 },
          { pcp: "Dr. Karen Murphy", panel_size: 291, admits: 42, admit_rate_per_1k: 144.3, preferred_facility: "Memorial Regional", avg_cost_per_admit: 16200, readmit_rate: 16.7 },
          { pcp: "Dr. David Wilson", panel_size: 178, admits: 22, admit_rate_per_1k: 123.6, preferred_facility: "St. Joseph", avg_cost_per_admit: 14100, readmit_rate: 13.6 },
          { pcp: "Dr. Sarah Patel", panel_size: 342, admits: 24, admit_rate_per_1k: 70.2, preferred_facility: "Mercy Medical", avg_cost_per_admit: 11800, readmit_rate: 8.3 },
          { pcp: "Dr. James Rivera", panel_size: 289, admits: 18, admit_rate_per_1k: 62.3, preferred_facility: "Community General", avg_cost_per_admit: 12400, readmit_rate: 11.1 },
          { pcp: "Dr. Lisa Chen", panel_size: 198, admits: 14, admit_rate_per_1k: 70.7, preferred_facility: "University Health", avg_cost_per_admit: 15200, readmit_rate: 7.1 },
        ],
      },
      {
        id: "drg_analysis",
        title: "Top DRGs by Cost",
        type: "table",
        columns: [
          { key: "drg", label: "DRG" },
          { key: "description", label: "Description" },
          { key: "cases", label: "Cases", numeric: true },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "benchmark_cost", label: "Benchmark", numeric: true, format: "dollar" },
          { key: "excess_spend", label: "Excess Spend", numeric: true, format: "dollar" },
        ],
        rows: [
          { drg: "291", description: "Heart Failure & Shock w/ MCC", cases: 48, avg_cost: 18400, benchmark_cost: 15200, excess_spend: 153600 },
          { drg: "470", description: "Major Hip/Knee Joint Replacement", cases: 42, avg_cost: 22100, benchmark_cost: 19500, excess_spend: 109200 },
          { drg: "392", description: "Esophagitis & GI Misc w/o MCC", cases: 38, avg_cost: 8200, benchmark_cost: 7100, excess_spend: 41800 },
          { drg: "871", description: "Septicemia w/o MV >96hrs w/ MCC", cases: 32, avg_cost: 24800, benchmark_cost: 22000, excess_spend: 89600 },
          { drg: "766", description: "Cesarean Section w/o CC/MCC", cases: 28, avg_cost: 12400, benchmark_cost: 11800, excess_spend: 16800 },
          { drg: "190", description: "COPD w/ MCC", cases: 26, avg_cost: 14200, benchmark_cost: 12600, excess_spend: 41600 },
          { drg: "689", description: "Kidney & UTI w/o MCC", cases: 24, avg_cost: 7800, benchmark_cost: 7200, excess_spend: 14400 },
          { drg: "683", description: "Renal Failure w/ CC", cases: 22, avg_cost: 11200, benchmark_cost: 10100, excess_spend: 24200 },
          { drg: "194", description: "Simple Pneumonia w/ CC", cases: 20, avg_cost: 9600, benchmark_cost: 8800, excess_spend: 16000 },
          { drg: "378", description: "GI Hemorrhage w/ CC", cases: 18, avg_cost: 10400, benchmark_cost: 9200, excess_spend: 21600 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Redirect Memorial Regional admissions to lower-cost facilities", description: "Memorial Regional's cost/admit is $18,200 vs $11,500 at Mercy Medical. Redirecting 40 non-emergent admits could save $268K/year. Memorial also has the lowest HCC capture rate (54.1%).", dollar_impact: 268000, category: "cost" },
          { title: "Readmission reduction program for CHF patients", description: "DRG 291 (Heart Failure) has 48 cases with a 16.2% readmission rate at Memorial. A post-discharge care transition program targeting CHF patients could reduce readmissions by 30%, saving $154K.", dollar_impact: 154000, category: "cost" },
          { title: "HCC capture opportunity during inpatient stays", description: "Inpatient HCC capture rate is only 62.4% vs 75% benchmark. 98 admits at Memorial had missed HCC coding opportunities. Embedding a coder reviewer during discharge could capture an estimated $340K in RAF value.", dollar_impact: 340000, category: "revenue" },
          { title: "Clinical pathway optimization for DRG 470", description: "Joint replacement cases average $22,100 vs $19,500 benchmark. Implementing a standardized clinical pathway with same-day mobilization and home discharge could reduce ALOS by 0.8 days.", dollar_impact: 109200, category: "cost" },
        ],
      },
    ],
  },

  ed_observation: {
    category: "ed_observation",
    label: "ED / Observation",
    total_spend: 2695000,
    pmpm: 187,
    claim_count: 1840,
    unique_members: 1104,
    kpis: [
      { label: "ED Visits / 1K", value: "380.8", benchmark: "310.0", status: "over" },
      { label: "Cost / Visit", value: "$1,464", benchmark: "$1,280", status: "over" },
      { label: "Avoidable ED %", value: "34.2%", benchmark: "25.0%", status: "over" },
      { label: "Obs Rate", value: "18.4%", benchmark: "15.0%", status: "over" },
      { label: "2-Midnight Compliance", value: "71.2%", benchmark: "85.0%", status: "under" },
      { label: "Total Spend", value: "$2.7M" },
    ],
    sections: [
      {
        id: "avoidable_ed",
        title: "Avoidable ED Visits",
        type: "table",
        columns: [
          { key: "diagnosis_group", label: "Diagnosis Group" },
          { key: "ed_visits", label: "ED Visits", numeric: true },
          { key: "total_cost", label: "Total Cost", numeric: true, format: "dollar" },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "uc_avg_cost", label: "Urgent Care Avg", numeric: true, format: "dollar" },
          { key: "potential_savings", label: "Potential Savings", numeric: true, format: "dollar" },
        ],
        rows: [
          { diagnosis_group: "Upper Respiratory Infection", ed_visits: 142, total_cost: 184600, avg_cost: 1300, uc_avg_cost: 185, potential_savings: 158370 },
          { diagnosis_group: "Urinary Tract Infection", ed_visits: 98, total_cost: 137200, avg_cost: 1400, uc_avg_cost: 210, potential_savings: 116620 },
          { diagnosis_group: "Back Pain (non-traumatic)", ed_visits: 87, total_cost: 113100, avg_cost: 1300, uc_avg_cost: 195, potential_savings: 96135 },
          { diagnosis_group: "Headache / Migraine", ed_visits: 64, total_cost: 89600, avg_cost: 1400, uc_avg_cost: 175, potential_savings: 78400 },
          { diagnosis_group: "Skin Infection / Abscess", ed_visits: 52, total_cost: 67600, avg_cost: 1300, uc_avg_cost: 220, potential_savings: 56160 },
          { diagnosis_group: "Otitis / Sinusitis", ed_visits: 46, total_cost: 55200, avg_cost: 1200, uc_avg_cost: 160, potential_savings: 47840 },
          { diagnosis_group: "Minor Laceration", ed_visits: 40, total_cost: 52000, avg_cost: 1300, uc_avg_cost: 280, potential_savings: 40800 },
          { diagnosis_group: "Sprain / Strain", ed_visits: 38, total_cost: 49400, avg_cost: 1300, uc_avg_cost: 240, potential_savings: 40280 },
        ],
      },
      {
        id: "frequent_utilizers",
        title: "Frequent ED Utilizers (Top 20)",
        type: "table",
        columns: [
          { key: "member_name", label: "Member" },
          { key: "member_id", label: "ID" },
          { key: "visits", label: "ED Visits", numeric: true },
          { key: "total_cost", label: "Total Cost", numeric: true, format: "dollar" },
          { key: "top_diagnoses", label: "Top Diagnoses" },
          { key: "pcp", label: "PCP" },
          { key: "has_care_plan", label: "Care Plan" },
        ],
        rows: [
          { member_name: "Gerald Foster", member_id: "M1006", visits: 14, total_cost: 28400, top_diagnoses: "CHF exacerbation, COPD, Chest pain", pcp: "Dr. Rivera", has_care_plan: "No" },
          { member_name: "Frank Nguyen", member_id: "M1008", visits: 11, total_cost: 22100, top_diagnoses: "Chest pain, AFib, Anxiety", pcp: "Dr. Kim", has_care_plan: "No" },
          { member_name: "Helen Washington", member_id: "M1007", visits: 9, total_cost: 18900, top_diagnoses: "Fall, UTI, Confusion", pcp: "Dr. Patel", has_care_plan: "Yes" },
          { member_name: "William Davis", member_id: "M1010", visits: 8, total_cost: 16800, top_diagnoses: "COPD, Pneumonia, Back pain", pcp: "Dr. Wilson", has_care_plan: "No" },
          { member_name: "Barbara Johnson", member_id: "M1009", visits: 7, total_cost: 13300, top_diagnoses: "Diabetes crisis, UTI, Cellulitis", pcp: "Dr. Chen", has_care_plan: "Yes" },
          { member_name: "Margaret Chen", member_id: "M1001", visits: 6, total_cost: 12600, top_diagnoses: "CHF, Shortness of breath", pcp: "Dr. Rivera", has_care_plan: "Yes" },
          { member_name: "Robert Williams", member_id: "M1002", visits: 6, total_cost: 11400, top_diagnoses: "Depression crisis, Chest pain", pcp: "Dr. Patel", has_care_plan: "No" },
          { member_name: "Dorothy Martinez", member_id: "M1003", visits: 5, total_cost: 10500, top_diagnoses: "CKD complications, Fall", pcp: "Dr. Chen", has_care_plan: "Yes" },
        ],
      },
      {
        id: "pcp_ed_rates",
        title: "PCP Panel ED Utilization",
        type: "table",
        columns: [
          { key: "pcp", label: "PCP" },
          { key: "panel_size", label: "Panel", numeric: true },
          { key: "ed_visits", label: "ED Visits", numeric: true },
          { key: "ed_rate_per_1k", label: "ED/1K", numeric: true, benchmark: 310.0 },
          { key: "avoidable_pct", label: "Avoidable %", numeric: true, format: "pct", benchmark: 25.0 },
          { key: "after_hours_access", label: "After-Hrs Access" },
        ],
        rows: [
          { pcp: "Dr. Robert Kim", panel_size: 234, ed_visits: 148, ed_rate_per_1k: 632.5, avoidable_pct: 42.1, after_hours_access: "None" },
          { pcp: "Dr. David Wilson", panel_size: 178, ed_visits: 98, ed_rate_per_1k: 550.6, avoidable_pct: 38.8, after_hours_access: "None" },
          { pcp: "Dr. Karen Murphy", panel_size: 291, ed_visits: 124, ed_rate_per_1k: 426.1, avoidable_pct: 36.3, after_hours_access: "Nurse line" },
          { pcp: "Dr. Thomas Lee", panel_size: 156, ed_visits: 58, ed_rate_per_1k: 371.8, avoidable_pct: 31.0, after_hours_access: "Nurse line" },
          { pcp: "Dr. Angela Brooks", panel_size: 312, ed_visits: 98, ed_rate_per_1k: 314.1, avoidable_pct: 28.6, after_hours_access: "On-call MD" },
          { pcp: "Dr. Sarah Patel", panel_size: 342, ed_visits: 82, ed_rate_per_1k: 239.8, avoidable_pct: 22.0, after_hours_access: "On-call MD" },
          { pcp: "Dr. James Rivera", panel_size: 289, ed_visits: 64, ed_rate_per_1k: 221.5, avoidable_pct: 20.3, after_hours_access: "On-call MD" },
          { pcp: "Dr. Lisa Chen", panel_size: 198, ed_visits: 38, ed_rate_per_1k: 191.9, avoidable_pct: 18.4, after_hours_access: "On-call MD" },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Implement 24/7 nurse triage line for high-ED PCPs", description: "Dr. Kim and Dr. Wilson have no after-hours access and ED rates 2x the benchmark. A shared nurse triage line could divert 40% of avoidable visits, saving $198K/year.", dollar_impact: 198000, category: "cost" },
          { title: "Frequent utilizer care management program", description: "Top 20 ED utilizers account for 152 visits ($284K). Assigning dedicated care coordinators with ED alert notifications could reduce visits by 50%.", dollar_impact: 142000, category: "cost" },
          { title: "Urgent care network expansion for URI/UTI", description: "240 ED visits for URI and UTI could have been managed at urgent care. Expanding the preferred urgent care network and member education could save $275K.", dollar_impact: 275000, category: "cost" },
          { title: "Observation status review program", description: "2-midnight rule compliance is only 71.2%. Implementing concurrent review could reclassify 48 observation stays to outpatient, reducing denied claims by $86K.", dollar_impact: 86000, category: "cost" },
        ],
      },
    ],
  },

  professional: {
    category: "professional",
    label: "Professional",
    total_spend: 3225000,
    pmpm: 224,
    claim_count: 14200,
    unique_members: 3840,
    kpis: [
      { label: "Total Spend", value: "$3.2M" },
      { label: "PMPM", value: "$224", benchmark: "$195", status: "over" },
      { label: "Unique Providers", value: "284" },
      { label: "Avg Cost / Visit", value: "$227", benchmark: "$198", status: "over" },
      { label: "OON Leakage", value: "18.4%", benchmark: "10.0%", status: "over" },
      { label: "Referral Loop Closure", value: "42.1%", benchmark: "75.0%", status: "under" },
    ],
    sections: [
      {
        id: "specialty_spend",
        title: "Spend by Specialty",
        type: "table",
        columns: [
          { key: "specialty", label: "Specialty" },
          { key: "total_spend", label: "Total Spend", numeric: true, format: "dollar" },
          { key: "visits", label: "Visits", numeric: true },
          { key: "avg_cost_per_visit", label: "Avg/Visit", numeric: true, format: "dollar" },
          { key: "benchmark_cost", label: "Benchmark", numeric: true, format: "dollar" },
          { key: "unique_members", label: "Members", numeric: true },
          { key: "oon_pct", label: "OON %", numeric: true, format: "pct", benchmark: 10.0 },
        ],
        rows: [
          { specialty: "Cardiology", total_spend: 624000, visits: 1840, avg_cost_per_visit: 339, benchmark_cost: 285, unique_members: 620, oon_pct: 22.4 },
          { specialty: "Orthopedics", total_spend: 518000, visits: 1420, avg_cost_per_visit: 365, benchmark_cost: 310, unique_members: 480, oon_pct: 18.1 },
          { specialty: "Gastroenterology", total_spend: 412000, visits: 1680, avg_cost_per_visit: 245, benchmark_cost: 218, unique_members: 540, oon_pct: 14.2 },
          { specialty: "Nephrology", total_spend: 342000, visits: 1240, avg_cost_per_visit: 276, benchmark_cost: 242, unique_members: 380, oon_pct: 8.4 },
          { specialty: "Pulmonology", total_spend: 298000, visits: 1120, avg_cost_per_visit: 266, benchmark_cost: 235, unique_members: 340, oon_pct: 12.8 },
          { specialty: "Neurology", total_spend: 264000, visits: 980, avg_cost_per_visit: 269, benchmark_cost: 248, unique_members: 310, oon_pct: 24.1 },
          { specialty: "Endocrinology", total_spend: 218000, visits: 1420, avg_cost_per_visit: 154, benchmark_cost: 142, unique_members: 480, oon_pct: 6.2 },
          { specialty: "Dermatology", total_spend: 186000, visits: 1480, avg_cost_per_visit: 126, benchmark_cost: 118, unique_members: 620, oon_pct: 28.4 },
          { specialty: "Ophthalmology", total_spend: 168000, visits: 1240, avg_cost_per_visit: 135, benchmark_cost: 128, unique_members: 540, oon_pct: 16.8 },
          { specialty: "Psychiatry", total_spend: 195000, visits: 780, avg_cost_per_visit: 250, benchmark_cost: 220, unique_members: 280, oon_pct: 32.1 },
        ],
      },
      {
        id: "referral_patterns",
        title: "PCP Referral Patterns",
        type: "table",
        columns: [
          { key: "pcp", label: "PCP" },
          { key: "total_referrals", label: "Referrals", numeric: true },
          { key: "in_network_pct", label: "In-Network %", numeric: true, format: "pct", benchmark: 90.0, invertBenchmark: true },
          { key: "oon_pct", label: "OON %", numeric: true, format: "pct", benchmark: 10.0 },
          { key: "loop_closure_pct", label: "Loop Closure %", numeric: true, format: "pct", benchmark: 75.0, invertBenchmark: true },
          { key: "top_oon_specialty", label: "Top OON Specialty" },
        ],
        rows: [
          { pcp: "Dr. Robert Kim", total_referrals: 342, in_network_pct: 72.8, oon_pct: 27.2, loop_closure_pct: 31.4, top_oon_specialty: "Cardiology" },
          { pcp: "Dr. Karen Murphy", total_referrals: 418, in_network_pct: 78.4, oon_pct: 21.6, loop_closure_pct: 38.2, top_oon_specialty: "Orthopedics" },
          { pcp: "Dr. David Wilson", total_referrals: 248, in_network_pct: 80.2, oon_pct: 19.8, loop_closure_pct: 42.8, top_oon_specialty: "Neurology" },
          { pcp: "Dr. Thomas Lee", total_referrals: 198, in_network_pct: 82.4, oon_pct: 17.6, loop_closure_pct: 48.1, top_oon_specialty: "Dermatology" },
          { pcp: "Dr. Angela Brooks", total_referrals: 384, in_network_pct: 88.2, oon_pct: 11.8, loop_closure_pct: 52.4, top_oon_specialty: "Psychiatry" },
          { pcp: "Dr. Sarah Patel", total_referrals: 412, in_network_pct: 94.2, oon_pct: 5.8, loop_closure_pct: 68.4, top_oon_specialty: "Dermatology" },
          { pcp: "Dr. James Rivera", total_referrals: 348, in_network_pct: 92.8, oon_pct: 7.2, loop_closure_pct: 72.1, top_oon_specialty: "Psychiatry" },
          { pcp: "Dr. Lisa Chen", total_referrals: 264, in_network_pct: 96.2, oon_pct: 3.8, loop_closure_pct: 78.4, top_oon_specialty: "Ophthalmology" },
        ],
      },
      {
        id: "high_cost_outliers",
        title: "High-Cost Specialist Outliers",
        type: "table",
        columns: [
          { key: "provider", label: "Specialist" },
          { key: "specialty", label: "Specialty" },
          { key: "total_spend", label: "Total Spend", numeric: true, format: "dollar" },
          { key: "visits", label: "Visits", numeric: true },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "peer_avg", label: "Peer Avg", numeric: true, format: "dollar" },
          { key: "pct_above_peers", label: "% Above Peers", numeric: true, format: "pct" },
        ],
        rows: [
          { provider: "Dr. A. Hernandez", specialty: "Cardiology", total_spend: 142000, visits: 280, avg_cost: 507, peer_avg: 339, pct_above_peers: 49.6 },
          { provider: "Dr. B. Okonkwo", specialty: "Orthopedics", total_spend: 118000, visits: 210, avg_cost: 562, peer_avg: 365, pct_above_peers: 54.0 },
          { provider: "Dr. C. Zhang", specialty: "Gastroenterology", total_spend: 98000, visits: 320, avg_cost: 306, peer_avg: 245, pct_above_peers: 24.9 },
          { provider: "Dr. D. Patel", specialty: "Neurology", total_spend: 84000, visits: 240, avg_cost: 350, peer_avg: 269, pct_above_peers: 30.1 },
          { provider: "Dr. E. Washington", specialty: "Pulmonology", total_spend: 72000, visits: 180, avg_cost: 400, peer_avg: 266, pct_above_peers: 50.4 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Specialist steerage program for Cardiology and Orthopedics", description: "22.4% of Cardiology and 18.1% of Orthopedics visits are OON. Steering to preferred in-network specialists could save $186K from lower unit costs plus eliminate OON balance billing.", dollar_impact: 186000, category: "cost" },
          { title: "eConsult program for low-acuity referrals", description: "Analysis shows 34% of specialty referrals result in a single visit with no procedure. An eConsult platform could resolve these without an in-person visit, saving $124K and improving access.", dollar_impact: 124000, category: "cost" },
          { title: "Referral loop closure automation", description: "Only 42.1% of referrals result in a consult note back to the PCP. Implementing automated consult note routing could improve care coordination and reduce duplicate testing.", dollar_impact: 68000, category: "quality" },
          { title: "High-cost specialist engagement for Dr. Hernandez and Dr. Okonkwo", description: "These two specialists are 50%+ above peer averages. Peer comparison data sharing and utilization review could normalize costs, saving $142K.", dollar_impact: 142000, category: "cost" },
        ],
      },
    ],
  },

  snf_postacute: {
    category: "snf_postacute",
    label: "SNF / Post-Acute",
    total_spend: 2246000,
    pmpm: 156,
    claim_count: 320,
    unique_members: 192,
    kpis: [
      { label: "Total Episodes", value: "320" },
      { label: "Cost / Episode", value: "$7,019", benchmark: "$5,800", status: "over" },
      { label: "Avg LOS", value: "22.4 days", benchmark: "18.0 days", status: "over" },
      { label: "Rehospitalization Rate", value: "18.8%", benchmark: "14.0%", status: "over" },
      { label: "Discharge to Home %", value: "62.4%", benchmark: "72.0%", status: "under" },
      { label: "HCC Capture Rate", value: "38.2%", benchmark: "65.0%", status: "under" },
    ],
    sections: [
      {
        id: "facility_comparison",
        title: "SNF Facility Comparison",
        type: "table",
        columns: [
          { key: "name", label: "Facility" },
          { key: "episodes", label: "Episodes", numeric: true },
          { key: "avg_los", label: "Avg LOS", numeric: true, benchmark: 18.0 },
          { key: "cost_per_episode", label: "Cost/Episode", numeric: true, format: "dollar" },
          { key: "rehospitalization_rate", label: "Rehosp %", numeric: true, format: "pct", benchmark: 14.0 },
          { key: "discharge_home_pct", label: "Home %", numeric: true, format: "pct", benchmark: 72.0, invertBenchmark: true },
          { key: "hcc_capture_rate", label: "HCC Capture %", numeric: true, format: "pct", benchmark: 65.0, invertBenchmark: true },
        ],
        rows: [
          { name: "Sunrise Skilled Nursing", episodes: 72, avg_los: 28.4, cost_per_episode: 9200, rehospitalization_rate: 24.3, discharge_home_pct: 48.6, hcc_capture_rate: 28.4 },
          { name: "Valley Care Center", episodes: 64, avg_los: 24.1, cost_per_episode: 7800, rehospitalization_rate: 19.5, discharge_home_pct: 56.3, hcc_capture_rate: 34.2 },
          { name: "Greenwood Rehabilitation", episodes: 58, avg_los: 20.2, cost_per_episode: 6400, rehospitalization_rate: 15.5, discharge_home_pct: 65.5, hcc_capture_rate: 42.1 },
          { name: "Heritage Health Center", episodes: 52, avg_los: 18.8, cost_per_episode: 5900, rehospitalization_rate: 13.5, discharge_home_pct: 71.2, hcc_capture_rate: 48.8 },
          { name: "Oakview Nursing & Rehab", episodes: 42, avg_los: 17.2, cost_per_episode: 5200, rehospitalization_rate: 11.9, discharge_home_pct: 78.6, hcc_capture_rate: 52.4 },
          { name: "Pinecrest Care Facility", episodes: 32, avg_los: 16.4, cost_per_episode: 4800, rehospitalization_rate: 12.5, discharge_home_pct: 81.3, hcc_capture_rate: 44.1 },
        ],
      },
      {
        id: "hospital_snf_patterns",
        title: "Hospital-to-SNF Referral Patterns",
        type: "table",
        columns: [
          { key: "hospital", label: "Admitting Hospital" },
          { key: "primary_snf", label: "Primary SNF" },
          { key: "episodes", label: "Episodes", numeric: true },
          { key: "avg_snf_los", label: "Avg SNF LOS", numeric: true },
          { key: "avg_total_cost", label: "Avg Total Cost", numeric: true, format: "dollar" },
        ],
        rows: [
          { hospital: "Memorial Regional", primary_snf: "Sunrise Skilled Nursing", episodes: 42, avg_snf_los: 28.8, avg_total_cost: 9400 },
          { hospital: "Memorial Regional", primary_snf: "Valley Care Center", episodes: 28, avg_snf_los: 24.2, avg_total_cost: 7600 },
          { hospital: "St. Joseph Hospital", primary_snf: "Greenwood Rehabilitation", episodes: 34, avg_snf_los: 19.8, avg_total_cost: 6200 },
          { hospital: "University Health", primary_snf: "Heritage Health Center", episodes: 26, avg_snf_los: 18.4, avg_total_cost: 5800 },
          { hospital: "Community General", primary_snf: "Oakview Nursing & Rehab", episodes: 22, avg_snf_los: 17.0, avg_total_cost: 5100 },
        ],
      },
      {
        id: "hh_alternative",
        title: "Home Health Alternative Analysis",
        type: "table",
        columns: [
          { key: "category", label: "Patient Category" },
          { key: "snf_episodes", label: "SNF Episodes", numeric: true },
          { key: "hh_eligible", label: "HH Eligible", numeric: true },
          { key: "avg_snf_cost", label: "Avg SNF Cost", numeric: true, format: "dollar" },
          { key: "avg_hh_cost", label: "Avg HH Cost", numeric: true, format: "dollar" },
          { key: "potential_savings", label: "Potential Savings", numeric: true, format: "dollar" },
        ],
        rows: [
          { category: "Joint Replacement (functional)", snf_episodes: 38, hh_eligible: 28, avg_snf_cost: 6200, avg_hh_cost: 2400, potential_savings: 106400 },
          { category: "CHF (stable at discharge)", snf_episodes: 32, hh_eligible: 18, avg_snf_cost: 7800, avg_hh_cost: 3200, potential_savings: 82800 },
          { category: "Pneumonia (ambulatory)", snf_episodes: 24, hh_eligible: 16, avg_snf_cost: 5400, avg_hh_cost: 2100, potential_savings: 52800 },
          { category: "COPD (stable)", snf_episodes: 18, hh_eligible: 12, avg_snf_cost: 6100, avg_hh_cost: 2800, potential_savings: 39600 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Preferred SNF network with quality tiers", description: "Sunrise Skilled Nursing has 28.4-day ALOS, 24.3% rehospitalization, and only 28.4% HCC capture. Steering to Oakview and Heritage could save $312K/year with better outcomes.", dollar_impact: 312000, category: "cost" },
          { title: "Home health diversion for eligible SNF patients", description: "74 SNF episodes involved patients eligible for home health. Diverting these could save $282K while maintaining outcomes. Joint replacement patients are the best candidates.", dollar_impact: 282000, category: "cost" },
          { title: "HCC capture improvement at SNF facilities", description: "SNF HCC capture is only 38.2% vs 65% benchmark. Embedding coding support at the top 3 SNFs could capture an additional $180K in RAF value from documented but uncoded conditions.", dollar_impact: 180000, category: "revenue" },
          { title: "Memorial Regional discharge planning intervention", description: "Memorial sends 70 patients to the two worst-performing SNFs. Joint discharge planning with preferred SNF selection criteria could improve outcomes and reduce total episode costs.", dollar_impact: 148000, category: "cost" },
        ],
      },
    ],
  },

  pharmacy: {
    category: "pharmacy",
    label: "Pharmacy",
    total_spend: 2851000,
    pmpm: 198,
    claim_count: 9200,
    unique_members: 3420,
    kpis: [
      { label: "Total Spend", value: "$2.9M" },
      { label: "PMPM", value: "$198", benchmark: "$175", status: "over" },
      { label: "Generic Dispense Rate", value: "78.4%", benchmark: "88.0%", status: "under" },
      { label: "Total Fills", value: "9,200" },
      { label: "Members Below 80% PDC", value: "412", status: "over" },
      { label: "Rx Without Matching Dx", value: "186", status: "over" },
    ],
    sections: [
      {
        id: "drug_class_spend",
        title: "Top Drug Classes by Spend",
        type: "table",
        columns: [
          { key: "drug_class", label: "Drug Class" },
          { key: "total_spend", label: "Total Spend", numeric: true, format: "dollar" },
          { key: "fills", label: "Fills", numeric: true },
          { key: "unique_members", label: "Members", numeric: true },
          { key: "avg_cost_per_fill", label: "Avg/Fill", numeric: true, format: "dollar" },
          { key: "brand_pct", label: "Brand %", numeric: true, format: "pct" },
          { key: "trend_vs_prior", label: "Trend", numeric: true, format: "pct" },
        ],
        rows: [
          { drug_class: "GLP-1 Receptor Agonists", total_spend: 624000, fills: 480, unique_members: 142, avg_cost_per_fill: 1300, brand_pct: 100.0, trend_vs_prior: 34.2 },
          { drug_class: "Anticoagulants (DOACs)", total_spend: 412000, fills: 1240, unique_members: 380, avg_cost_per_fill: 332, brand_pct: 82.4, trend_vs_prior: 8.1 },
          { drug_class: "Insulin Products", total_spend: 348000, fills: 1680, unique_members: 420, avg_cost_per_fill: 207, brand_pct: 64.2, trend_vs_prior: -2.4 },
          { drug_class: "Biologic DMARDs", total_spend: 298000, fills: 180, unique_members: 48, avg_cost_per_fill: 1656, brand_pct: 100.0, trend_vs_prior: 12.8 },
          { drug_class: "Statins", total_spend: 186000, fills: 2400, unique_members: 1240, avg_cost_per_fill: 78, brand_pct: 12.4, trend_vs_prior: -1.2 },
          { drug_class: "ACE Inhibitors / ARBs", total_spend: 142000, fills: 2100, unique_members: 980, avg_cost_per_fill: 68, brand_pct: 8.1, trend_vs_prior: 0.4 },
          { drug_class: "Antidepressants (SSRI/SNRI)", total_spend: 124000, fills: 1420, unique_members: 620, avg_cost_per_fill: 87, brand_pct: 14.8, trend_vs_prior: 3.2 },
          { drug_class: "Beta Blockers", total_spend: 98000, fills: 1800, unique_members: 840, avg_cost_per_fill: 54, brand_pct: 6.2, trend_vs_prior: -0.8 },
          { drug_class: "PPI / H2 Blockers", total_spend: 84000, fills: 1240, unique_members: 580, avg_cost_per_fill: 68, brand_pct: 18.4, trend_vs_prior: 1.4 },
          { drug_class: "Bronchodilators / Inhalers", total_spend: 162000, fills: 980, unique_members: 420, avg_cost_per_fill: 165, brand_pct: 42.1, trend_vs_prior: 6.8 },
        ],
      },
      {
        id: "brand_generic",
        title: "Brand-to-Generic Substitution Opportunities",
        type: "table",
        columns: [
          { key: "brand_drug", label: "Brand Drug" },
          { key: "generic_alternative", label: "Generic Alternative" },
          { key: "members_on_brand", label: "Members", numeric: true },
          { key: "annual_brand_cost", label: "Brand Cost/Yr", numeric: true, format: "dollar" },
          { key: "annual_generic_cost", label: "Generic Cost/Yr", numeric: true, format: "dollar" },
          { key: "savings_per_member", label: "Savings/Member", numeric: true, format: "dollar" },
          { key: "total_potential_savings", label: "Total Savings", numeric: true, format: "dollar" },
        ],
        rows: [
          { brand_drug: "Eliquis 5mg", generic_alternative: "Apixaban (authorized generic)", members_on_brand: 248, annual_brand_cost: 6200, annual_generic_cost: 1800, savings_per_member: 4400, total_potential_savings: 1091200 },
          { brand_drug: "Lantus SoloStar", generic_alternative: "Insulin Glargine (Semglee)", members_on_brand: 142, annual_brand_cost: 4800, annual_generic_cost: 1400, savings_per_member: 3400, total_potential_savings: 482800 },
          { brand_drug: "Symbicort", generic_alternative: "Budesonide/Formoterol", members_on_brand: 98, annual_brand_cost: 3600, annual_generic_cost: 1200, savings_per_member: 2400, total_potential_savings: 235200 },
          { brand_drug: "Nexium 40mg", generic_alternative: "Esomeprazole", members_on_brand: 84, annual_brand_cost: 2400, annual_generic_cost: 240, savings_per_member: 2160, total_potential_savings: 181440 },
          { brand_drug: "Crestor 20mg", generic_alternative: "Rosuvastatin", members_on_brand: 62, annual_brand_cost: 3200, annual_generic_cost: 180, savings_per_member: 3020, total_potential_savings: 187240 },
        ],
      },
      {
        id: "adherence",
        title: "Medication Adherence (PDC by Class)",
        type: "table",
        columns: [
          { key: "drug_class", label: "Drug Class" },
          { key: "eligible_members", label: "Eligible", numeric: true },
          { key: "avg_pdc", label: "Avg PDC", numeric: true, format: "pct", benchmark: 80.0, invertBenchmark: true },
          { key: "below_80_pct", label: "Below 80%", numeric: true },
          { key: "stars_measure", label: "Stars Measure" },
          { key: "stars_impact", label: "Stars Impact" },
        ],
        rows: [
          { drug_class: "Statins (Diabetes)", eligible_members: 780, avg_pdc: 78.3, below_80_pct: 147, stars_measure: "SPD (D12)", stars_impact: "At risk: 2pts from 4-star drop" },
          { drug_class: "Statins (Cardiovascular)", eligible_members: 460, avg_pdc: 81.2, below_80_pct: 89, stars_measure: "SPC (D12)", stars_impact: "Meets 4-star threshold" },
          { drug_class: "ACE/ARB (Diabetes)", eligible_members: 620, avg_pdc: 82.4, below_80_pct: 74, stars_measure: "N/A", stars_impact: "Quality indicator" },
          { drug_class: "Oral Diabetes Medications", eligible_members: 540, avg_pdc: 76.8, below_80_pct: 142, stars_measure: "N/A", stars_impact: "Clinical concern" },
          { drug_class: "Antidepressants", eligible_members: 380, avg_pdc: 68.4, below_80_pct: 186, stars_measure: "AMM", stars_impact: "Below 3-star threshold" },
        ],
      },
      {
        id: "drug_dx_gaps",
        title: "Drug-Diagnosis Alignment Gaps (HCC Suspects)",
        type: "table",
        columns: [
          { key: "medication", label: "Medication" },
          { key: "expected_diagnosis", label: "Expected Diagnosis" },
          { key: "hcc_code", label: "HCC" },
          { key: "members_without_dx", label: "Members w/o Dx", numeric: true },
          { key: "potential_raf_value", label: "RAF Value", numeric: true, format: "dollar" },
        ],
        rows: [
          { medication: "Warfarin / Apixaban", expected_diagnosis: "Atrial Fibrillation (I48.x)", hcc_code: "HCC 96", members_without_dx: 142, potential_raf_value: 86000 },
          { medication: "Furosemide + Carvedilol", expected_diagnosis: "Heart Failure (I50.x)", hcc_code: "HCC 85", members_without_dx: 38, potential_raf_value: 42000 },
          { medication: "Insulin", expected_diagnosis: "Diabetes w/ Complications", hcc_code: "HCC 18", members_without_dx: 24, potential_raf_value: 28000 },
          { medication: "Albuterol + ICS", expected_diagnosis: "COPD (J44.x)", hcc_code: "HCC 111", members_without_dx: 18, potential_raf_value: 16000 },
          { medication: "Donepezil / Memantine", expected_diagnosis: "Dementia (F03.x)", hcc_code: "HCC 51", members_without_dx: 12, potential_raf_value: 38000 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Generic substitution campaign for Eliquis and Lantus", description: "390 members are on brand drugs with available generic/biosimilar alternatives. A pharmacy-led therapeutic interchange program could save $1.57M in the first year.", dollar_impact: 1574000, category: "cost" },
          { title: "Statin adherence intervention to protect Stars rating", description: "SPD measure PDC dropped to 78.3%, just 2 points above the 4-star drop threshold. Pharmacist outreach to 147 members below 80% PDC is critical. This is a triple-weighted measure.", dollar_impact: null, category: "quality" },
          { title: "Drug-diagnosis gap capture for HCC revenue", description: "186 members are on medications without matching diagnoses. Converting these to HCC suspect flags could capture $210K in RAF value. Warfarin/apixaban without AFib is the largest group.", dollar_impact: 210000, category: "revenue" },
          { title: "90-day supply and mail order optimization", description: "62% of chronic medication fills are still 30-day retail. Converting to 90-day mail order could save $148K in dispensing fees and improve adherence.", dollar_impact: 148000, category: "cost" },
        ],
      },
    ],
  },

  home_health: {
    category: "home_health",
    label: "Home Health",
    total_spend: 842000,
    pmpm: 58,
    claim_count: 480,
    unique_members: 186,
    kpis: [
      { label: "Total Spend", value: "$842K" },
      { label: "Episodes", value: "480" },
      { label: "Cost / Episode", value: "$1,754", benchmark: "$1,520", status: "over" },
      { label: "PMPM", value: "$58", benchmark: "$48", status: "over" },
      { label: "Unique Members", value: "186" },
      { label: "Avg Visits / Episode", value: "14.2", benchmark: "12.0", status: "over" },
    ],
    sections: [
      {
        id: "vendor_comparison",
        title: "Home Health Vendor Comparison",
        type: "table",
        columns: [
          { key: "name", label: "Vendor" },
          { key: "episodes", label: "Episodes", numeric: true },
          { key: "cost_per_episode", label: "Cost/Episode", numeric: true, format: "dollar" },
          { key: "avg_visits", label: "Avg Visits", numeric: true },
          { key: "readmission_rate", label: "Readmit %", numeric: true, format: "pct", benchmark: 12.0 },
          { key: "patient_satisfaction", label: "Satisfaction", numeric: true },
        ],
        rows: [
          { name: "ABC Home Health", episodes: 142, cost_per_episode: 2100, avg_visits: 18.4, readmission_rate: 16.2, patient_satisfaction: 3.2 },
          { name: "CareFirst Home Services", episodes: 118, cost_per_episode: 1800, avg_visits: 14.8, readmission_rate: 12.4, patient_satisfaction: 4.1 },
          { name: "Premier Home Care", episodes: 98, cost_per_episode: 1520, avg_visits: 12.1, readmission_rate: 10.8, patient_satisfaction: 4.4 },
          { name: "Comfort Care Agency", episodes: 72, cost_per_episode: 1400, avg_visits: 11.2, readmission_rate: 9.2, patient_satisfaction: 4.6 },
          { name: "HealthBridge Home", episodes: 50, cost_per_episode: 1340, avg_visits: 10.4, readmission_rate: 8.8, patient_satisfaction: 4.5 },
        ],
      },
      {
        id: "referral_patterns",
        title: "Ordering Provider Patterns",
        type: "table",
        columns: [
          { key: "provider", label: "Provider" },
          { key: "orders", label: "HH Orders", numeric: true },
          { key: "avg_episodes_per_patient", label: "Avg Episodes/Pt", numeric: true },
          { key: "preferred_vendor", label: "Preferred Vendor" },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
        ],
        rows: [
          { provider: "Dr. Robert Kim", orders: 48, avg_episodes_per_patient: 2.4, preferred_vendor: "ABC Home Health", avg_cost: 2200 },
          { provider: "Dr. Karen Murphy", orders: 42, avg_episodes_per_patient: 2.1, preferred_vendor: "ABC Home Health", avg_cost: 1980 },
          { provider: "Dr. Lisa Chen", orders: 38, avg_episodes_per_patient: 1.8, preferred_vendor: "Premier Home Care", avg_cost: 1520 },
          { provider: "Dr. Sarah Patel", orders: 32, avg_episodes_per_patient: 1.4, preferred_vendor: "Comfort Care Agency", avg_cost: 1380 },
          { provider: "Dr. James Rivera", orders: 28, avg_episodes_per_patient: 1.6, preferred_vendor: "CareFirst Home Services", avg_cost: 1640 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Preferred vendor network for home health", description: "ABC Home Health has the highest cost/episode ($2,100), most visits (18.4), worst readmission rate (16.2%), and lowest satisfaction (3.2). Steering to Premier or Comfort Care could save $168K.", dollar_impact: 168000, category: "cost" },
          { title: "Utilization review for high-ordering providers", description: "Dr. Kim and Dr. Murphy order 2.2x more HH episodes per patient than peers and predominantly use the most expensive vendor. Concurrent utilization review could reduce unnecessary episodes.", dollar_impact: 84000, category: "cost" },
        ],
      },
    ],
  },

  dme: {
    category: "dme",
    label: "DME",
    total_spend: 441000,
    pmpm: 31,
    claim_count: 1420,
    unique_members: 680,
    kpis: [
      { label: "Total Spend", value: "$441K" },
      { label: "PMPM", value: "$31", benchmark: "$24", status: "over" },
      { label: "Claims", value: "1,420" },
      { label: "Unique Members", value: "680" },
      { label: "Avg Cost / Claim", value: "$311", benchmark: "$265", status: "over" },
      { label: "Rental vs Purchase", value: "42% rental" },
    ],
    sections: [
      {
        id: "vendor_comparison",
        title: "DME Vendor Comparison",
        type: "table",
        columns: [
          { key: "name", label: "Vendor" },
          { key: "claims", label: "Claims", numeric: true },
          { key: "total_spend", label: "Total Spend", numeric: true, format: "dollar" },
          { key: "avg_cost_per_claim", label: "Avg/Claim", numeric: true, format: "dollar" },
          { key: "top_items", label: "Top Items" },
        ],
        rows: [
          { name: "National DME Supply", claims: 420, total_spend: 148000, avg_cost_per_claim: 352, top_items: "CPAP, Wheelchairs, Walkers" },
          { name: "MedEquip Solutions", claims: 340, total_spend: 112000, avg_cost_per_claim: 329, top_items: "CPAP, Oxygen, Hospital beds" },
          { name: "HomeCare Medical", claims: 280, total_spend: 82000, avg_cost_per_claim: 293, top_items: "Walkers, Braces, CPAP" },
          { name: "LifeCare DME", claims: 220, total_spend: 58000, avg_cost_per_claim: 264, top_items: "Oxygen, Wheelchairs" },
          { name: "Valley Medical Supply", claims: 160, total_spend: 41000, avg_cost_per_claim: 256, top_items: "Braces, Walkers, Canes" },
        ],
      },
      {
        id: "ordering_providers",
        title: "Ordering Provider Patterns",
        type: "table",
        columns: [
          { key: "provider", label: "Provider" },
          { key: "dme_orders", label: "Orders", numeric: true },
          { key: "total_cost", label: "Total Cost", numeric: true, format: "dollar" },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "preferred_vendor", label: "Preferred Vendor" },
        ],
        rows: [
          { provider: "Dr. Robert Kim", dme_orders: 84, total_cost: 32000, avg_cost: 381, preferred_vendor: "National DME Supply" },
          { provider: "Dr. Karen Murphy", dme_orders: 72, total_cost: 26000, avg_cost: 361, preferred_vendor: "National DME Supply" },
          { provider: "Dr. Thomas Lee", dme_orders: 48, total_cost: 14400, avg_cost: 300, preferred_vendor: "MedEquip Solutions" },
          { provider: "Dr. Sarah Patel", dme_orders: 42, total_cost: 11200, avg_cost: 267, preferred_vendor: "LifeCare DME" },
          { provider: "Dr. Lisa Chen", dme_orders: 38, total_cost: 9800, avg_cost: 258, preferred_vendor: "HomeCare Medical" },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "DME vendor optimization", description: "National DME Supply charges 37% more per claim than Valley Medical Supply for comparable items. Steering CPAP and wheelchair orders to lower-cost vendors could save $62K.", dollar_impact: 62000, category: "cost" },
          { title: "Competitive bidding for CPAP supplies", description: "CPAP supplies account for 34% of DME spend. Implementing competitive bidding for CPAP equipment and supplies could reduce costs by 18%.", dollar_impact: 28000, category: "cost" },
        ],
      },
    ],
  },

  other: {
    category: "other",
    label: "Ancillary / Other",
    total_spend: 1283000,
    pmpm: 70,
    claim_count: 3100,
    unique_members: 2480,
    kpis: [
      { label: "Total Spend", value: "$1.3M" },
      { label: "PMPM", value: "$70" },
      { label: "Claims", value: "3,100" },
      { label: "Unique Members", value: "2,480" },
    ],
    sections: [
      {
        id: "subcategory_spend",
        title: "Spend by Subcategory",
        type: "table",
        columns: [
          { key: "subcategory", label: "Subcategory" },
          { key: "total_spend", label: "Total Spend", numeric: true, format: "dollar" },
          { key: "claims", label: "Claims", numeric: true },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
        ],
        rows: [
          { subcategory: "Lab / Pathology", total_spend: 412000, claims: 1240, avg_cost: 332 },
          { subcategory: "Radiology / Imaging", total_spend: 348000, claims: 620, avg_cost: 561 },
          { subcategory: "Ambulance / Transport", total_spend: 186000, claims: 280, avg_cost: 664 },
          { subcategory: "Dialysis", total_spend: 218000, claims: 480, avg_cost: 454 },
          { subcategory: "Other Ancillary", total_spend: 119000, claims: 480, avg_cost: 248 },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "Lab utilization review for duplicate testing", description: "Analysis identified 180 instances of duplicate lab orders within 14 days. Implementing a duplicate check at the PCP level could save $42K.", dollar_impact: 42000, category: "cost" },
          { title: "Advanced imaging prior authorization", description: "38% of advanced imaging (MRI/CT) did not have a prior conservative treatment trial. Implementing clinical decision support could reduce unnecessary imaging by 20%.", dollar_impact: 68000, category: "cost" },
        ],
      },
    ],
  },
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

// ---- Groups / Offices ----

export const mockGroups: {
  id: number;
  name: string;
  client_code: string;
  city: string;
  state: string;
  provider_count: number;
  total_panel_size: number;
  avg_capture_rate: number;
  avg_recapture_rate: number;
  avg_raf: number;
  group_pmpm: number;
  gap_closure_rate: number;
  tier: "green" | "amber" | "red";
  provider_ids: number[];
}[] = [
  { id: 1, name: "ISG Tampa", client_code: "ISG-TPA", city: "Tampa", state: "FL", provider_count: 4, total_panel_size: 1096, avg_capture_rate: 78.1, avg_recapture_rate: 84.6, avg_raf: 1.36, group_pmpm: 1150, gap_closure_rate: 71.5, tier: "green", provider_ids: [1, 2, 4, 5] },
  { id: 2, name: "FMG St. Petersburg", client_code: "FMG-SPB", city: "St. Petersburg", state: "FL", provider_count: 3, total_panel_size: 723, avg_capture_rate: 62.4, avg_recapture_rate: 68.1, avg_raf: 1.22, group_pmpm: 1280, gap_closure_rate: 58.7, tier: "amber", provider_ids: [6, 9, 10] },
  { id: 3, name: "ISG Brandon", client_code: "ISG-BDN", city: "Brandon", state: "FL", provider_count: 2, total_panel_size: 512, avg_capture_rate: 47.2, avg_recapture_rate: 53.8, avg_raf: 1.15, group_pmpm: 1420, gap_closure_rate: 45.0, tier: "red", provider_ids: [7, 8] },
  { id: 4, name: "FMG Clearwater", client_code: "FMG-CLW", city: "Clearwater", state: "FL", provider_count: 3, total_panel_size: 834, avg_capture_rate: 65.3, avg_recapture_rate: 71.4, avg_raf: 1.29, group_pmpm: 1190, gap_closure_rate: 62.4, tier: "amber", provider_ids: [3, 5, 10] },
  { id: 5, name: "TPSG Downtown", client_code: "TPSG-DT", city: "Tampa", state: "FL", provider_count: 2, total_panel_size: 445, avg_capture_rate: 81.0, avg_recapture_rate: 87.2, avg_raf: 1.52, group_pmpm: 1080, gap_closure_rate: 76.8, tier: "green", provider_ids: [1, 3] },
];

export const mockGroupInsights = [
  {
    id: 1, category: "group" as const,
    title: "TPSG Downtown leads in capture rate by 33.8 percentage points",
    description: "TPSG Downtown achieves 81.0% capture rate vs ISG Brandon's 47.2%. Consider sharing TPSG Downtown's coding workflows with underperforming offices.",
    recommended_action: "Arrange a best-practices session between TPSG Downtown and ISG Brandon.",
    confidence: 0.87,
  },
  {
    id: 2, category: "cost" as const,
    title: "$340 PMPM gap between most and least efficient offices",
    description: "TPSG Downtown runs at $1,080 PMPM while ISG Brandon is at $1,420. Investigate referral patterns and utilization differences.",
    recommended_action: "Deep-dive into ISG Brandon's ED and inpatient utilization.",
    confidence: 0.91,
  },
  {
    id: 3, category: "quality" as const,
    title: "TPSG Downtown leads gap closure at 76.8%",
    description: "TPSG Downtown has the highest gap closure rate across all offices. Their care coordination model should be documented and replicated.",
    recommended_action: "Document and standardize top-performing group's gap closure workflow.",
    confidence: 0.85,
  },
];

export const mockGroupTrends = {
  quarters: ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026"],
  capture_rate: [72.1, 74.3, 75.8, 77.2, 78.1],
  recapture_rate: [79.4, 81.2, 82.5, 83.8, 84.6],
  group_pmpm: [1210, 1195, 1180, 1165, 1150],
  gap_closure_rate: [64.2, 66.1, 68.3, 70.0, 71.5],
};

// Mock member-level care gaps for the detail view
// MemberGap: id, member_id, member_name, measure_code, measure_name, status, due_date, closed_date, measurement_year, stars_weight, provider_name
export const mockMemberGaps = [
  { id: 101, member_id: 1001, member_name: "Margaret Chen", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. James Rivera" },
  { id: 102, member_id: 1002, member_name: "Robert Williams", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Sarah Patel" },
  { id: 103, member_id: 1003, member_name: "Dorothy Martinez", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "closed", due_date: "2026-06-30", closed_date: "2026-02-15", measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Lisa Chen" },
  { id: 104, member_id: 1004, member_name: "James Thornton", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Michael Torres" },
  { id: 105, member_id: 1005, member_name: "Patricia Okafor", measure_code: "CDC-HbA1c", measure_name: "Comprehensive Diabetes Care \u2014 HbA1c", status: "open", due_date: "2026-06-30", closed_date: null, measurement_year: 2026, stars_weight: 3, provider_name: "Dr. Angela Brooks" },
];

// ---- Patterns / Intelligence ----

export const mockPlaybooks = [
  {
    id: "diabetes_coding",
    title: "Diabetes Coding Specificity Playbook",
    target_audience: "PCPs coding <60% diabetes specificity",
    steps: [
      "At every diabetic visit, assess for retinopathy, nephropathy, neuropathy, and peripheral vascular disease.",
      "If complications are present, code the specific complication (E11.21\u2013E11.65) instead of unspecified E11.9.",
      "Document laterality and severity for all diabetic complications.",
      "Use the HCC suspect list to identify patients with suspected but uncaptured complications.",
      "Review medication list for diabetes-related drugs that suggest undocumented conditions.",
    ],
    expected_impact: "+$23K RAF value per 100 diabetic patients",
    expected_dollar_value: 23000,
    evidence: "Based on analysis of 1,247 coding events across 8 top-performing providers in your network.",
    category: "coding",
  },
  {
    id: "depression_screening",
    title: "Depression Screening & Coding Playbook",
    target_audience: "All PCPs \u2014 especially those with <5% depression capture rate",
    steps: [
      "Implement universal PHQ-2 screening at all wellness and chronic care visits.",
      "For positive PHQ-2 (score >= 3), administer PHQ-9 and document the score.",
      "Code F32.x or F33.x with appropriate severity based on PHQ-9 score.",
      "Document treatment plan: therapy referral, medication, follow-up interval.",
      "Schedule PHQ-9 reassessment at 4\u20136 week follow-up.",
    ],
    expected_impact: "+$18K RAF value per 100 patients screened positive",
    expected_dollar_value: 18000,
    evidence: "Top-performing providers screen 92% of eligible patients; network average is 34%.",
    category: "screening",
  },
  {
    id: "chf_documentation",
    title: "CHF Documentation & Staging Playbook",
    target_audience: "Cardiologists and PCPs managing heart failure patients",
    steps: [
      "At every CHF visit, document current NYHA functional class (I\u2013IV).",
      "Code the specific type of heart failure: systolic (I50.2x), diastolic (I50.3x), or combined (I50.4x).",
      "Document ejection fraction when available \u2014 HFrEF vs HFpEF impacts coding.",
      "Assess and document acute vs chronic status; acute exacerbations carry higher RAF.",
      "Review for common comorbidities: CKD, diabetes, COPD \u2014 document all active conditions.",
    ],
    expected_impact: "+$41K RAF value per 100 CHF patients properly staged",
    expected_dollar_value: 41000,
    evidence: "68% of CHF patients in bottom-performing groups are coded as unspecified I50.9.",
    category: "documentation",
  },
  {
    id: "ckd_staging",
    title: "CKD Staging & Documentation Playbook",
    target_audience: "PCPs with patients on metformin, ACE inhibitors, or ARBs",
    steps: [
      "Order eGFR for all patients with diabetes, hypertension, or relevant medications.",
      "Stage CKD using eGFR: Stage 3a (45\u201359), 3b (30\u201344), Stage 4 (15\u201329), Stage 5 (<15).",
      "Code the specific CKD stage (N18.31, N18.32, N18.4, N18.5) \u2014 never use unspecified N18.9.",
      "Document albuminuria status (A1/A2/A3) alongside CKD stage.",
      "For Stage 3b+, document nephrology referral or reason for PCP management.",
    ],
    expected_impact: "+$31K RAF value per 100 CKD patients properly staged",
    expected_dollar_value: 31000,
    evidence: "42% of patients on CKD-related medications lack a CKD diagnosis code in claims.",
    category: "coding",
  },
];

export const mockCodeUtilization = {
  codes: [
    { code: "E11.21", description: "Type 2 diabetes with diabetic nephropathy", hcc_relevant: true, top_group_rate: 18.4, bottom_group_rate: 4.2, gap: 14.2, potential_captures: 87 },
    { code: "E11.22", description: "Type 2 diabetes with diabetic CKD", hcc_relevant: true, top_group_rate: 14.1, bottom_group_rate: 2.8, gap: 11.3, potential_captures: 64 },
    { code: "E11.65", description: "Type 2 diabetes with hyperglycemia", hcc_relevant: true, top_group_rate: 22.3, bottom_group_rate: 11.7, gap: 10.6, potential_captures: 52 },
    { code: "F33.1", description: "Major depressive disorder, recurrent, moderate", hcc_relevant: true, top_group_rate: 12.8, bottom_group_rate: 3.1, gap: 9.7, potential_captures: 71 },
    { code: "N18.31", description: "CKD Stage 3a", hcc_relevant: true, top_group_rate: 11.2, bottom_group_rate: 2.4, gap: 8.8, potential_captures: 58 },
    { code: "I50.22", description: "Chronic systolic heart failure", hcc_relevant: true, top_group_rate: 9.6, bottom_group_rate: 1.8, gap: 7.8, potential_captures: 43 },
    { code: "E11.40", description: "Type 2 diabetes with diabetic neuropathy, unspecified", hcc_relevant: true, top_group_rate: 16.7, bottom_group_rate: 9.3, gap: 7.4, potential_captures: 38 },
    { code: "J44.1", description: "COPD with acute exacerbation", hcc_relevant: true, top_group_rate: 8.9, bottom_group_rate: 2.1, gap: 6.8, potential_captures: 34 },
    { code: "N18.32", description: "CKD Stage 3b", hcc_relevant: true, top_group_rate: 7.4, bottom_group_rate: 1.2, gap: 6.2, potential_captures: 29 },
    { code: "E11.311", description: "Type 2 diabetes with unspecified diabetic retinopathy with macular edema", hcc_relevant: true, top_group_rate: 8.1, bottom_group_rate: 2.4, gap: 5.7, potential_captures: 26 },
    { code: "G20", description: "Parkinson's disease", hcc_relevant: true, top_group_rate: 3.2, bottom_group_rate: 0.4, gap: 2.8, potential_captures: 12 },
    { code: "I13.10", description: "Hypertensive heart and CKD without heart failure", hcc_relevant: true, top_group_rate: 6.8, bottom_group_rate: 4.1, gap: 2.7, potential_captures: 18 },
    { code: "E78.5", description: "Hyperlipidemia, unspecified", hcc_relevant: false, top_group_rate: 42.1, bottom_group_rate: 39.8, gap: 2.3, potential_captures: 14 },
    { code: "I10", description: "Essential hypertension", hcc_relevant: false, top_group_rate: 58.3, bottom_group_rate: 56.7, gap: 1.6, potential_captures: 9 },
  ],
  top_groups: ["ISG Tampa Office", "FMG St. Pete"],
  bottom_groups: ["Southside Medical Associates", "Clearwater Family Care"],
  summary: "Analyzed 847 unique ICD-10 codes across 6 practice groups.",
};

export const mockSuccessStories = [
  {
    id: "story_1",
    title: "Diabetes Complication Coding Initiative",
    description: "After implementing a pre-visit HCC suspect review workflow, Dr. Rivera's team increased specific diabetes complication coding from 23% to 71%, capturing an additional 142 HCCs across 89 patients.",
    metric_label: "Diabetes Specificity Rate",
    before_value: "23%",
    after_value: "71%",
    improvement: "+48pp",
    provider_name: "Dr. James Rivera",
    office_name: "ISG Tampa Office",
    intervention: "Pre-visit HCC suspect review",
    timeline: "Oct 2025 \u2013 Feb 2026",
    member_count: 89,
    total_value: 187000,
  },
  {
    id: "story_2",
    title: "Depression Screening Scale-Up",
    description: "FMG St. Pete implemented universal PHQ-2 screening at all chronic care visits, identifying 67 previously undocumented depression cases and properly coding severity levels.",
    metric_label: "Depression Capture Rate",
    before_value: "8%",
    after_value: "34%",
    improvement: "+26pp",
    provider_name: "Dr. Sarah Patel",
    office_name: "FMG St. Pete",
    intervention: "Universal PHQ-2 screening protocol",
    timeline: "Nov 2025 \u2013 Mar 2026",
    member_count: 67,
    total_value: 94000,
  },
  {
    id: "story_3",
    title: "CKD Staging from Lab Data",
    description: "By cross-referencing eGFR lab results with diagnosis codes, Dr. Chen's practice identified 134 patients with CKD evidence but no CKD diagnosis. After targeted outreach, 91 patients received proper staging.",
    metric_label: "CKD Capture Rate",
    before_value: "31%",
    after_value: "62%",
    improvement: "+31pp",
    provider_name: "Dr. Lisa Chen",
    office_name: "ISG Tampa Office",
    intervention: "Lab-to-diagnosis reconciliation",
    timeline: "Sep 2025 \u2013 Jan 2026",
    member_count: 91,
    total_value: 143000,
  },
  {
    id: "story_4",
    title: "CHF Documentation Improvement",
    description: "Cardiology team adopted structured CHF documentation templates capturing NYHA class, EF, and systolic vs diastolic type. Unspecified CHF coding dropped from 72% to 18%.",
    metric_label: "Unspecified CHF Rate",
    before_value: "72%",
    after_value: "18%",
    improvement: "-54pp",
    provider_name: "Dr. Robert Kim",
    office_name: "Heart & Vascular Specialists",
    intervention: "Structured CHF documentation template",
    timeline: "Aug 2025 \u2013 Dec 2025",
    member_count: 48,
    total_value: 112000,
  },
];

export const mockBenchmarks = {
  provider_count: 24,
  group_count: 6,
  provider_metrics: {
    capture_rate: { network_avg: 63.2, top_decile: 84.1, top_quartile: 78.5, median: 64.8, bottom_quartile: 48.1 },
    recapture_rate: { network_avg: 69.4, top_decile: 89.2, top_quartile: 84.0, median: 70.1, bottom_quartile: 52.3 },
    avg_raf: { network_avg: 1.31, top_decile: 1.82, top_quartile: 1.65, median: 1.28, bottom_quartile: 1.02 },
    panel_pmpm: { network_avg: 1310, top_decile: 980, top_quartile: 1120, median: 1280, bottom_quartile: 1480 },
    gap_closure_rate: { network_avg: 59.8, top_decile: 82.4, top_quartile: 75.2, median: 61.0, bottom_quartile: 44.1 },
  },
  group_metrics: {
    avg_capture_rate: { network_avg: 65.1, top_decile: 82.3, top_quartile: 77.4, median: 66.2, bottom_quartile: 51.8 },
    avg_raf: { network_avg: 1.34, top_decile: 1.78, top_quartile: 1.62, median: 1.31, bottom_quartile: 1.08 },
    group_pmpm: { network_avg: 1285, top_decile: 1010, top_quartile: 1130, median: 1260, bottom_quartile: 1440 },
  },
};
