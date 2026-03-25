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
  scan_type?: string;
}[] = [
  {
    id: 1, category: "cost", title: "SNF LOS for CHF jumped 4 days at Sunrise this quarter \u2014 investigating",
    description: "Anomaly scan detected Sunrise SNF averaging 22.3 days LOS for CHF patients vs 18-day benchmark. This is a 24% deviation affecting 31 admits. Estimated excess spend: $186K.",
    dollar_impact: 186000, recommended_action: "Request utilization review meeting with Sunrise SNF discharge planning team.", confidence: 91, scan_type: "anomaly",
  },
  {
    id: 2, category: "revenue", title: "65% of UTI SNF patients could have gone home with HH \u2014 $365K savings",
    description: "Opportunity scan found 47 UTI patients admitted to SNF facilities who met home health eligibility criteria. Average SNF stay cost $11,800 vs estimated HH episode of $4,100.",
    dollar_impact: 365000, recommended_action: "Implement HH diversion protocol for low-acuity UTI patients at admission.", confidence: 87, scan_type: "opportunity",
  },
  {
    id: 3, category: "provider", title: "Brookdale captures HCCs at 41% vs Sunrise at 12% \u2014 same patient mix",
    description: "Comparative scan revealed a 29 percentage point gap in HCC capture rates between Brookdale Medical Group (41.2%) and Sunrise Health Partners (12.4%) despite similar RAF distributions.",
    dollar_impact: 289000, recommended_action: "Deploy Brookdale's coding workflows to Sunrise. Schedule peer-to-peer education sessions.", confidence: 88, scan_type: "comparative",
  },
  {
    id: 4, category: "trend", title: "Pharmacy spend up 18% QoQ \u2014 driven by 3 new specialty drug starts",
    description: "Temporal scan detected pharmacy PMPM increased from $198 to $234 quarter-over-quarter. Root cause: 3 members started Humira ($72K/yr each) and 8 started GLP-1 agonists ($15K/yr each).",
    dollar_impact: 336000, recommended_action: "Review specialty drug prior auth criteria. Evaluate biosimilar alternatives for Humira starts.", confidence: 93, scan_type: "temporal",
  },
  {
    id: 5, category: "revenue", title: "47 members have 3+ suspect HCCs AND 2+ care gaps AND recent admission",
    description: "Cross-module scan identified 47 members flagged across all three alert categories simultaneously. These members represent $412K in RAF uplift, $890K in claims, and 94 open care gaps.",
    dollar_impact: 412000, recommended_action: "Prioritize these 47 members for comprehensive care coordinator visits this week.", confidence: 94, scan_type: "cross_module",
  },
  {
    id: 6, category: "cost", title: "142 claims filed >90 days \u2014 $89K at risk of timely filing denial",
    description: "Revenue cycle scan found 142 claims still in pending status more than 90 days after service date. These claims total $89K and are at immediate risk of timely filing denial.",
    dollar_impact: 89000, recommended_action: "Escalate to billing team for immediate resubmission. Audit claims workflow for bottlenecks.", confidence: 96, scan_type: "revenue_cycle",
  },
  {
    id: 7, category: "quality", title: "Statin adherence dropping \u2014 4-star threshold at risk",
    description: "PDC for statin adherence (D12) dropped 4.1 points this quarter to 78.3%. You\u2019re now within 2 points of falling below the 4-star cutpoint (76%). This is a triple-weighted measure.",
    dollar_impact: null, recommended_action: "Launch pharmacist outreach campaign targeting 89 members below 80% PDC.", confidence: 94, scan_type: "anomaly",
  },
  {
    id: 8, category: "provider", title: "3 PCPs code unspecified diabetes 78% of the time",
    description: "Drs. Kim, Wilson, and Murphy code E11.9 (Type 2 diabetes unspecified) on 78% of their diabetic patients. Network peers specify complications 44% of the time. Specificity upgrade value: $67K.",
    dollar_impact: 67000, recommended_action: "Schedule coding education sessions with these three providers.", confidence: 88, scan_type: "opportunity",
  },
];

export const mockDiscoveryLatest = {
  total_findings: 34,
  scan_summary: { anomaly: 8, opportunity: 12, comparative: 5, temporal: 4, cross_module: 3, revenue_cycle: 2 },
  last_scan_at: "2026-03-24T06:00:00Z",
  findings: mockInsights.map((i) => ({ ...i, scan: i.scan_type })),
};

export const mockDiscoveryRevenueCycle = {
  total_findings: 2,
  findings: [
    { scan: "revenue_cycle", issue: "timely_filing_risk", affected_claims: 142, financial_impact: 89000, root_cause: "Claims pending >90 days from service date", dollar_impact: 89000, description: "142 claims filed >90 days \u2014 $89K at risk of timely filing denial" },
    { scan: "revenue_cycle", issue: "denial_pattern", affected_claims: 38, financial_impact: 52000, root_cause: "High denial rate in snf_postacute", dollar_impact: 52000, description: "38 denied claims in snf_postacute \u2014 $52K impact" },
  ],
};

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
          { drg: "689", description: "Kidney & UTI w/ MCC", cases: 24, avg_cost: 7800, benchmark_cost: 7200, excess_spend: 14400 },
          { drg: "683", description: "Renal Failure w/ MCC", cases: 22, avg_cost: 11200, benchmark_cost: 10100, excess_spend: 24200 },
          { drg: "194", description: "Pneumonia w/ CC", cases: 20, avg_cost: 9600, benchmark_cost: 8800, excess_spend: 16000 },
          { drg: "378", description: "GI Hemorrhage w/ CC", cases: 18, avg_cost: 10400, benchmark_cost: 9200, excess_spend: 21600 },
        ],
      },
      {
        id: "hospital_disposition",
        title: "Hospital Disposition Comparison",
        type: "table",
        columns: [
          { key: "hospital", label: "Hospital" },
          { key: "total_discharges", label: "Total Discharges", numeric: true },
          { key: "discharged_home_pct", label: "Discharged Home %", numeric: true, format: "pct", benchmark: 55.0, invertBenchmark: true },
          { key: "discharged_snf_pct", label: "Discharged to SNF %", numeric: true, format: "pct", benchmark: 18.0 },
          { key: "discharged_hh_pct", label: "Discharged to HH %", numeric: true, format: "pct" },
          { key: "readmit_rate", label: "Readmit Rate", numeric: true, format: "pct", benchmark: 11.0 },
          { key: "avg_drg_cost", label: "Avg DRG Cost", numeric: true, format: "dollar", benchmark: 14000 },
          { key: "hcc_capture_rate", label: "HCC Capture %", numeric: true, format: "pct", benchmark: 75.0, invertBenchmark: true },
        ],
        rows: [
          { hospital: "Memorial Regional Medical Center", total_discharges: 98, discharged_home_pct: 36.7, discharged_snf_pct: 28.6, discharged_hh_pct: 24.5, readmit_rate: 16.2, avg_drg_cost: 18200, hcc_capture_rate: 54.1 },
          { hospital: "St. Joseph Hospital", total_discharges: 84, discharged_home_pct: 52.4, discharged_snf_pct: 19.0, discharged_hh_pct: 20.2, readmit_rate: 12.8, avg_drg_cost: 14800, hcc_capture_rate: 68.3 },
          { hospital: "University Health System", total_discharges: 72, discharged_home_pct: 48.6, discharged_snf_pct: 22.2, discharged_hh_pct: 18.1, readmit_rate: 11.2, avg_drg_cost: 16400, hcc_capture_rate: 71.2 },
          { hospital: "Community General Hospital", total_discharges: 64, discharged_home_pct: 62.5, discharged_snf_pct: 14.1, discharged_hh_pct: 15.6, readmit_rate: 10.4, avg_drg_cost: 12100, hcc_capture_rate: 72.8 },
          { hospital: "Mercy Medical Center", total_discharges: 52, discharged_home_pct: 63.5, discharged_snf_pct: 11.5, discharged_hh_pct: 17.3, readmit_rate: 9.8, avg_drg_cost: 11500, hcc_capture_rate: 76.4 },
          { hospital: "Lakeside Health", total_discharges: 42, discharged_home_pct: 40.5, discharged_snf_pct: 26.2, discharged_hh_pct: 21.4, readmit_rate: 14.7, avg_drg_cost: 13200, hcc_capture_rate: 58.9 },
        ],
      },
      {
        id: "drg_cost_by_hospital",
        title: "DRG Cost by Hospital",
        type: "table",
        columns: [
          { key: "drg", label: "DRG" },
          { key: "description", label: "Description" },
          { key: "hospital", label: "Hospital" },
          { key: "cases", label: "Cases", numeric: true },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "network_avg", label: "Network Avg", numeric: true, format: "dollar" },
          { key: "variance", label: "Variance $", numeric: true, format: "dollar" },
        ],
        rows: [
          { drg: "291", description: "Heart Failure & Shock w/ MCC", hospital: "Memorial Regional", cases: 18, avg_cost: 21400, network_avg: 17200, variance: 4200 },
          { drg: "291", description: "Heart Failure & Shock w/ MCC", hospital: "St. Joseph", cases: 12, avg_cost: 17800, network_avg: 17200, variance: 600 },
          { drg: "291", description: "Heart Failure & Shock w/ MCC", hospital: "Bayfront Health", cases: 10, avg_cost: 14200, network_avg: 17200, variance: -3000 },
          { drg: "291", description: "Heart Failure & Shock w/ MCC", hospital: "Community General", cases: 8, avg_cost: 15600, network_avg: 17200, variance: -1600 },
          { drg: "470", description: "Major Hip/Knee Joint Replacement", hospital: "Memorial Regional", cases: 14, avg_cost: 25800, network_avg: 21200, variance: 4600 },
          { drg: "470", description: "Major Hip/Knee Joint Replacement", hospital: "St. Joseph", cases: 10, avg_cost: 21400, network_avg: 21200, variance: 200 },
          { drg: "470", description: "Major Hip/Knee Joint Replacement", hospital: "Mercy Medical", cases: 12, avg_cost: 18200, network_avg: 21200, variance: -3000 },
          { drg: "470", description: "Major Hip/Knee Joint Replacement", hospital: "Community General", cases: 6, avg_cost: 19800, network_avg: 21200, variance: -1400 },
          { drg: "871", description: "Septicemia w/o MV >96hrs w/ MCC", hospital: "University Health", cases: 14, avg_cost: 26200, network_avg: 24800, variance: 1400 },
          { drg: "871", description: "Septicemia w/o MV >96hrs w/ MCC", hospital: "Memorial Regional", cases: 10, avg_cost: 28400, network_avg: 24800, variance: 3600 },
          { drg: "871", description: "Septicemia w/o MV >96hrs w/ MCC", hospital: "Lakeside Health", cases: 8, avg_cost: 22100, network_avg: 24800, variance: -2700 },
          { drg: "190", description: "COPD w/ MCC", hospital: "Memorial Regional", cases: 8, avg_cost: 16800, network_avg: 14200, variance: 2600 },
          { drg: "190", description: "COPD w/ MCC", hospital: "University Health", cases: 10, avg_cost: 14600, network_avg: 14200, variance: 400 },
          { drg: "190", description: "COPD w/ MCC", hospital: "Mercy Medical", cases: 8, avg_cost: 12200, network_avg: 14200, variance: -2000 },
        ],
      },
      {
        id: "quality_by_hospital_diagnosis",
        title: "Quality by Hospital per Diagnosis",
        type: "table",
        columns: [
          { key: "hospital", label: "Hospital" },
          { key: "diagnosis_group", label: "Diagnosis Group" },
          { key: "cases", label: "Cases", numeric: true },
          { key: "readmit_rate", label: "Readmit Rate", numeric: true, format: "pct", benchmark: 11.0 },
          { key: "alos", label: "ALOS", numeric: true, benchmark: 4.2 },
          { key: "mortality_rate", label: "Mortality %", numeric: true, format: "pct", benchmark: 3.0 },
          { key: "cost_per_case", label: "Cost/Case", numeric: true, format: "dollar" },
        ],
        rows: [
          { hospital: "Memorial Regional", diagnosis_group: "CHF", cases: 18, readmit_rate: 22.2, alos: 6.1, mortality_rate: 4.2, cost_per_case: 21400 },
          { hospital: "Bayfront Health", diagnosis_group: "CHF", cases: 10, readmit_rate: 10.0, alos: 4.4, mortality_rate: 2.1, cost_per_case: 14200 },
          { hospital: "St. Joseph", diagnosis_group: "CHF", cases: 12, readmit_rate: 16.7, alos: 5.2, mortality_rate: 3.4, cost_per_case: 17800 },
          { hospital: "Mercy Medical", diagnosis_group: "CHF", cases: 8, readmit_rate: 12.5, alos: 4.6, mortality_rate: 2.8, cost_per_case: 15200 },
          { hospital: "Memorial Regional", diagnosis_group: "Pneumonia", cases: 12, readmit_rate: 16.7, alos: 5.8, mortality_rate: 3.8, cost_per_case: 16200 },
          { hospital: "University Health", diagnosis_group: "Pneumonia", cases: 10, readmit_rate: 10.0, alos: 4.2, mortality_rate: 2.2, cost_per_case: 12800 },
          { hospital: "Community General", diagnosis_group: "Pneumonia", cases: 8, readmit_rate: 12.5, alos: 4.0, mortality_rate: 1.8, cost_per_case: 11400 },
          { hospital: "Memorial Regional", diagnosis_group: "Hip Replacement", cases: 14, readmit_rate: 7.1, alos: 3.8, mortality_rate: 0.4, cost_per_case: 25800 },
          { hospital: "Mercy Medical", diagnosis_group: "Hip Replacement", cases: 12, readmit_rate: 8.3, alos: 2.4, mortality_rate: 0.2, cost_per_case: 18200 },
          { hospital: "St. Joseph", diagnosis_group: "Hip Replacement", cases: 10, readmit_rate: 10.0, alos: 3.2, mortality_rate: 0.3, cost_per_case: 21400 },
          { hospital: "Community General", diagnosis_group: "Hip Replacement", cases: 6, readmit_rate: 0.0, alos: 2.2, mortality_rate: 0.0, cost_per_case: 19800 },
          { hospital: "Memorial Regional", diagnosis_group: "COPD", cases: 8, readmit_rate: 25.0, alos: 5.4, mortality_rate: 3.6, cost_per_case: 16800 },
          { hospital: "University Health", diagnosis_group: "COPD", cases: 10, readmit_rate: 10.0, alos: 4.1, mortality_rate: 2.0, cost_per_case: 14600 },
          { hospital: "Mercy Medical", diagnosis_group: "COPD", cases: 8, readmit_rate: 12.5, alos: 3.8, mortality_rate: 1.6, cost_per_case: 12200 },
          { hospital: "University Health", diagnosis_group: "Septicemia", cases: 14, readmit_rate: 14.3, alos: 7.2, mortality_rate: 8.4, cost_per_case: 26200 },
          { hospital: "Memorial Regional", diagnosis_group: "Septicemia", cases: 10, readmit_rate: 20.0, alos: 8.1, mortality_rate: 10.2, cost_per_case: 28400 },
          { hospital: "Lakeside Health", diagnosis_group: "Septicemia", cases: 8, readmit_rate: 12.5, alos: 6.4, mortality_rate: 6.8, cost_per_case: 22100 },
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
          { title: "Memorial SNF discharge rate is 2.5x Mercy Medical", description: "Memorial sends 28.6% of patients to SNF vs 11.5% at Mercy Medical, driving post-acute costs. Only 36.7% of Memorial patients go home vs 63.5% at Mercy. A discharge planning intervention targeting home-with-services could shift 15 SNF discharges to home health, saving $187K in post-acute spend.", dollar_impact: 187000, category: "cost" },
          { title: "Memorial CHF patients cost 51% more with 2.2x readmit rate vs Bayfront", description: "Memorial's CHF patients cost $21,400/case vs Bayfront's $14,200, with 22.2% readmit rate vs 10.0%. ALOS is 6.1 days vs 4.4. Bayfront achieves better CHF outcomes at 34% lower cost. Evaluating Bayfront's CHF care pathway for network-wide adoption could save $129K annually.", dollar_impact: 129000, category: "quality" },
          { title: "DRG 470 cost variance: Memorial $25,800 vs Mercy $18,200", description: "Hip/knee replacement at Memorial costs $7,600 more per case than Mercy Medical. Memorial's ALOS for hip replacement is 3.8 days vs 2.4 at Mercy. Standardizing on Mercy's rapid-recovery protocol across the network saves an estimated $91K on current volume.", dollar_impact: 91000, category: "cost" },
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
        id: "er_disposition",
        title: "ER Disposition Analysis",
        type: "table",
        columns: [
          { key: "hospital_er", label: "Hospital ER" },
          { key: "total_visits", label: "Total Visits", numeric: true },
          { key: "discharged_home_pct", label: "Discharged Home %", numeric: true, format: "pct" },
          { key: "observation_pct", label: "Observation %", numeric: true, format: "pct", benchmark: 15.0 },
          { key: "admitted_inpatient_pct", label: "Admitted Inpatient %", numeric: true, format: "pct", benchmark: 18.0 },
          { key: "avg_cost_discharge", label: "Avg Cost (Discharge)", numeric: true, format: "dollar" },
          { key: "avg_cost_obs", label: "Avg Cost (Obs)", numeric: true, format: "dollar" },
          { key: "avg_cost_admit", label: "Avg Cost (Admit)", numeric: true, format: "dollar" },
        ],
        rows: [
          { hospital_er: "Memorial Regional ER", total_visits: 480, discharged_home_pct: 52.1, observation_pct: 22.3, admitted_inpatient_pct: 25.6, avg_cost_discharge: 1180, avg_cost_obs: 4200, avg_cost_admit: 14800 },
          { hospital_er: "St. Joseph ER", total_visits: 362, discharged_home_pct: 58.3, observation_pct: 18.8, admitted_inpatient_pct: 22.9, avg_cost_discharge: 1050, avg_cost_obs: 3800, avg_cost_admit: 13200 },
          { hospital_er: "University Health ER", total_visits: 298, discharged_home_pct: 61.7, observation_pct: 16.4, admitted_inpatient_pct: 21.9, avg_cost_discharge: 1120, avg_cost_obs: 3600, avg_cost_admit: 15100 },
          { hospital_er: "Community General ER", total_visits: 274, discharged_home_pct: 68.2, observation_pct: 14.2, admitted_inpatient_pct: 17.6, avg_cost_discharge: 980, avg_cost_obs: 3400, avg_cost_admit: 11800 },
          { hospital_er: "Mercy Medical ER", total_visits: 228, discharged_home_pct: 70.6, observation_pct: 13.6, admitted_inpatient_pct: 15.8, avg_cost_discharge: 920, avg_cost_obs: 3200, avg_cost_admit: 11200 },
          { hospital_er: "Lakeside Health ER", total_visits: 198, discharged_home_pct: 55.6, observation_pct: 20.7, admitted_inpatient_pct: 23.7, avg_cost_discharge: 1060, avg_cost_obs: 4100, avg_cost_admit: 12800 },
        ],
      },
      {
        id: "er_visits_by_diagnosis",
        title: "ER Visits by Diagnosis",
        type: "table",
        columns: [
          { key: "diagnosis_group", label: "Diagnosis Group" },
          { key: "visits", label: "Visits", numeric: true },
          { key: "avg_cost", label: "Avg Cost", numeric: true, format: "dollar" },
          { key: "discharged_pct", label: "Discharged %", numeric: true, format: "pct" },
          { key: "admitted_pct", label: "Admitted %", numeric: true, format: "pct" },
          { key: "avoidable_pct", label: "Avoidable %", numeric: true, format: "pct", benchmark: 25.0 },
          { key: "top_hospital", label: "Top Hospital" },
        ],
        rows: [
          { diagnosis_group: "Chest Pain", visits: 284, avg_cost: 2840, discharged_pct: 62.0, admitted_pct: 38.0, avoidable_pct: 14.8, top_hospital: "Memorial Regional" },
          { diagnosis_group: "Abdominal Pain", visits: 218, avg_cost: 1920, discharged_pct: 74.3, admitted_pct: 25.7, avoidable_pct: 28.4, top_hospital: "St. Joseph" },
          { diagnosis_group: "CHF Exacerbation", visits: 164, avg_cost: 4200, discharged_pct: 18.3, admitted_pct: 81.7, avoidable_pct: 32.9, top_hospital: "Memorial Regional" },
          { diagnosis_group: "COPD Exacerbation", visits: 142, avg_cost: 3100, discharged_pct: 38.0, admitted_pct: 62.0, avoidable_pct: 36.6, top_hospital: "University Health" },
          { diagnosis_group: "UTI", visits: 128, avg_cost: 1400, discharged_pct: 82.8, admitted_pct: 17.2, avoidable_pct: 68.0, top_hospital: "Memorial Regional" },
          { diagnosis_group: "Fall / Injury", visits: 116, avg_cost: 2200, discharged_pct: 64.7, admitted_pct: 35.3, avoidable_pct: 22.4, top_hospital: "Lakeside Health" },
          { diagnosis_group: "Shortness of Breath", visits: 108, avg_cost: 2680, discharged_pct: 48.1, admitted_pct: 51.9, avoidable_pct: 18.5, top_hospital: "Memorial Regional" },
          { diagnosis_group: "Syncope", visits: 72, avg_cost: 3400, discharged_pct: 55.6, admitted_pct: 44.4, avoidable_pct: 12.5, top_hospital: "St. Joseph" },
        ],
      },
      {
        id: "frequent_er_utilizers",
        title: "Frequent ER Utilizers (Top 10)",
        type: "table",
        columns: [
          { key: "member", label: "Member" },
          { key: "visits_12mo", label: "Visits (12mo)", numeric: true },
          { key: "total_cost", label: "Total Cost", numeric: true, format: "dollar" },
          { key: "top_diagnoses", label: "Top Diagnoses" },
          { key: "pcp", label: "PCP" },
          { key: "has_care_manager", label: "Has Care Manager" },
        ],
        rows: [
          { member: "Gerald Foster", visits_12mo: 14, total_cost: 28400, top_diagnoses: "CHF exacerbation, COPD, Chest pain", pcp: "Dr. Rivera", has_care_manager: "No" },
          { member: "Frank Nguyen", visits_12mo: 11, total_cost: 22100, top_diagnoses: "Chest pain, AFib, Anxiety", pcp: "Dr. Kim", has_care_manager: "No" },
          { member: "Helen Washington", visits_12mo: 9, total_cost: 18900, top_diagnoses: "Fall, UTI, Confusion", pcp: "Dr. Patel", has_care_manager: "Yes" },
          { member: "William Davis", visits_12mo: 8, total_cost: 16800, top_diagnoses: "COPD, Pneumonia, Back pain", pcp: "Dr. Wilson", has_care_manager: "No" },
          { member: "Barbara Johnson", visits_12mo: 7, total_cost: 13300, top_diagnoses: "Diabetes crisis, UTI, Cellulitis", pcp: "Dr. Chen", has_care_manager: "Yes" },
          { member: "Margaret Chen", visits_12mo: 6, total_cost: 12600, top_diagnoses: "CHF, Shortness of breath", pcp: "Dr. Rivera", has_care_manager: "Yes" },
          { member: "Robert Williams", visits_12mo: 6, total_cost: 11400, top_diagnoses: "Depression crisis, Chest pain", pcp: "Dr. Patel", has_care_manager: "No" },
          { member: "Dorothy Martinez", visits_12mo: 5, total_cost: 10500, top_diagnoses: "CKD complications, Fall", pcp: "Dr. Chen", has_care_manager: "Yes" },
          { member: "James Thompson", visits_12mo: 5, total_cost: 9800, top_diagnoses: "COPD exacerbation, Anxiety", pcp: "Dr. Kim", has_care_manager: "No" },
          { member: "Patricia Howard", visits_12mo: 5, total_cost: 9200, top_diagnoses: "Abdominal pain, Nausea, UTI", pcp: "Dr. Murphy", has_care_manager: "No" },
        ],
      },
      {
        id: "obs_vs_inpatient_classification",
        title: "Obs vs Inpatient Classification",
        type: "table",
        columns: [
          { key: "hospital", label: "Hospital" },
          { key: "obs_stays", label: "Obs Stays", numeric: true },
          { key: "should_have_been_inpatient", label: "Should Have Been IP", numeric: true },
          { key: "inpatient_stays", label: "Inpatient Stays", numeric: true },
          { key: "could_have_been_obs", label: "Could Have Been Obs", numeric: true },
          { key: "two_midnight_violations", label: "2-Midnight Violations", numeric: true },
          { key: "financial_impact", label: "Financial Impact", numeric: true, format: "dollar" },
        ],
        rows: [
          { hospital: "Memorial Regional", obs_stays: 107, should_have_been_inpatient: 24, inpatient_stays: 98, could_have_been_obs: 12, two_midnight_violations: 31, financial_impact: 186000 },
          { hospital: "St. Joseph", obs_stays: 68, should_have_been_inpatient: 11, inpatient_stays: 84, could_have_been_obs: 8, two_midnight_violations: 14, financial_impact: 92000 },
          { hospital: "University Health", obs_stays: 49, should_have_been_inpatient: 6, inpatient_stays: 72, could_have_been_obs: 10, two_midnight_violations: 12, financial_impact: 78000 },
          { hospital: "Community General", obs_stays: 39, should_have_been_inpatient: 4, inpatient_stays: 64, could_have_been_obs: 6, two_midnight_violations: 8, financial_impact: 48000 },
          { hospital: "Mercy Medical", obs_stays: 31, should_have_been_inpatient: 3, inpatient_stays: 52, could_have_been_obs: 4, two_midnight_violations: 5, financial_impact: 32000 },
          { hospital: "Lakeside Health", obs_stays: 41, should_have_been_inpatient: 8, inpatient_stays: 42, could_have_been_obs: 5, two_midnight_violations: 11, financial_impact: 64000 },
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
          { title: "Memorial ER converts to inpatient at highest rate in network", description: "Memorial Regional admits 25.6% of ER visits vs 15.8% at Mercy Medical. Their observation rate is also highest at 22.3%. Only 52.1% of Memorial ER visits discharge home vs 70.6% at Mercy. Case management review of Memorial admissions could prevent 40+ unnecessary admits, saving $592K.", dollar_impact: 592000, category: "cost" },
          { title: "847 low-acuity ER visits cost $423K — nurse triage line saves estimated $280K", description: "URI, UTI, back pain, headache, skin infections, and otitis account for 847 avoidable ER visits at an average cost of $1,300. Deploying a 24/7 nurse triage line with warm transfers to next-day PCP appointments could redirect 65% of these visits to appropriate care settings.", dollar_impact: 280000, category: "cost" },
          { title: "Obs/inpatient misclassification costs $500K across the network", description: "56 observation stays should have been classified as inpatient, and 45 inpatient stays could have been observation. Memorial alone has 31 two-midnight violations worth $186K. Concurrent utilization review at the top 3 hospitals could recover $356K in misclassification costs.", dollar_impact: 356000, category: "cost" },
          { title: "CHF exacerbation ER visits are 32.9% avoidable", description: "164 CHF exacerbation ER visits cost $4,200 each on average. 54 were potentially avoidable with better outpatient management. Remote patient monitoring with daily weight checks for CHF patients could prevent 40+ ER visits annually, saving $168K.", dollar_impact: 168000, category: "quality" },
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
      { label: "HCC Capture Rate", value: "23.1%", benchmark: "65.0%", status: "under" },
    ],
    sections: [
      {
        id: "snf_los_by_diagnosis",
        title: "SNF LOS by Diagnosis",
        type: "table",
        columns: [
          { key: "diagnosis", label: "Diagnosis Group" },
          { key: "avg_los", label: "Avg LOS (days)", numeric: true },
          { key: "median_los", label: "Median LOS", numeric: true },
          { key: "benchmark_los", label: "Network Benchmark LOS", numeric: true },
          { key: "cases", label: "Cases", numeric: true },
          { key: "cost_per_day", label: "Cost/Day", numeric: true, format: "dollar" },
          { key: "total_cost", label: "Total Cost", numeric: true, format: "dollar" },
          { key: "hh_diversion_pct", label: "HH Diversion Potential %", numeric: true, format: "pct" },
        ],
        rows: [
          { diagnosis: "CHF", avg_los: 21, median_los: 19, benchmark_los: 16, cases: 68, cost_per_day: 485, total_cost: 692580, hh_diversion_pct: 28 },
          { diagnosis: "Hip/Knee Replacement", avg_los: 18, median_los: 16, benchmark_los: 14, cases: 54, cost_per_day: 520, total_cost: 505440, hh_diversion_pct: 30 },
          { diagnosis: "Pneumonia", avg_los: 14, median_los: 12, benchmark_los: 10, cases: 42, cost_per_day: 460, total_cost: 270480, hh_diversion_pct: 40 },
          { diagnosis: "Stroke/CVA", avg_los: 28, median_los: 26, benchmark_los: 24, cases: 36, cost_per_day: 540, total_cost: 544320, hh_diversion_pct: 10 },
          { diagnosis: "COPD", avg_los: 12, median_los: 10, benchmark_los: 9, cases: 38, cost_per_day: 445, total_cost: 202920, hh_diversion_pct: 45 },
          { diagnosis: "UTI/Sepsis", avg_los: 8, median_los: 7, benchmark_los: 5, cases: 134, cost_per_day: 410, total_cost: 439520, hh_diversion_pct: 65 },
          { diagnosis: "Cellulitis", avg_los: 6, median_los: 5, benchmark_los: 4, cases: 46, cost_per_day: 395, total_cost: 109020, hh_diversion_pct: 70 },
          { diagnosis: "Wound Care", avg_los: 19, median_los: 17, benchmark_los: 15, cases: 32, cost_per_day: 475, total_cost: 288800, hh_diversion_pct: 35 },
        ],
      },
      {
        id: "facility_comparison",
        title: "SNF Facility Comparison",
        type: "table",
        columns: [
          { key: "name", label: "Facility" },
          { key: "admits", label: "Admits", numeric: true },
          { key: "avg_los", label: "Avg LOS", numeric: true, benchmark: 18.0 },
          { key: "cost_per_day", label: "Cost/Day", numeric: true, format: "dollar" },
          { key: "rehospitalization_rate", label: "Rehospitalization %", numeric: true, format: "pct", benchmark: 14.0 },
          { key: "discharge_home_pct", label: "Discharge Home %", numeric: true, format: "pct", benchmark: 72.0, invertBenchmark: true },
          { key: "hcc_capture_rate", label: "HCC Capture Rate", numeric: true, format: "pct", benchmark: 65.0, invertBenchmark: true },
          { key: "quality_score", label: "Quality Score", numeric: true },
        ],
        rows: [
          { name: "Sunrise Skilled Nursing", admits: 72, avg_los: 28.4, cost_per_day: 520, rehospitalization_rate: 24.3, discharge_home_pct: 48.6, hcc_capture_rate: 18.2, quality_score: 2.1 },
          { name: "Valley Care Center", admits: 64, avg_los: 24.1, cost_per_day: 480, rehospitalization_rate: 19.5, discharge_home_pct: 56.3, hcc_capture_rate: 22.4, quality_score: 2.8 },
          { name: "Greenwood Rehabilitation", admits: 58, avg_los: 20.2, cost_per_day: 455, rehospitalization_rate: 15.5, discharge_home_pct: 65.5, hcc_capture_rate: 28.6, quality_score: 3.4 },
          { name: "Brookdale Health & Rehab", admits: 52, avg_los: 16.8, cost_per_day: 410, rehospitalization_rate: 10.2, discharge_home_pct: 78.8, hcc_capture_rate: 41.0, quality_score: 4.2 },
          { name: "Oakview Nursing & Rehab", admits: 42, avg_los: 17.2, cost_per_day: 430, rehospitalization_rate: 11.9, discharge_home_pct: 76.2, hcc_capture_rate: 24.8, quality_score: 3.9 },
          { name: "Pinecrest Care Facility", admits: 32, avg_los: 16.4, cost_per_day: 395, rehospitalization_rate: 12.5, discharge_home_pct: 81.3, hcc_capture_rate: 19.6, quality_score: 3.6 },
        ],
      },
      {
        id: "hh_diversion",
        title: "Home Health Diversion Opportunities",
        type: "table",
        columns: [
          { key: "diagnosis", label: "Diagnosis" },
          { key: "snf_patients", label: "SNF Patients", numeric: true },
          { key: "avg_snf_los", label: "Avg SNF LOS", numeric: true },
          { key: "avg_snf_cost", label: "Avg SNF Cost", numeric: true, format: "dollar" },
          { key: "est_hh_cost", label: "Est. HH Cost", numeric: true, format: "dollar" },
          { key: "savings_per_patient", label: "Savings/Patient", numeric: true, format: "dollar" },
          { key: "divertible_pct", label: "Divertible %", numeric: true, format: "pct" },
          { key: "total_savings", label: "Total Savings Potential", numeric: true, format: "dollar" },
        ],
        rows: [
          { diagnosis: "UTI/Sepsis", snf_patients: 134, avg_snf_los: 8, avg_snf_cost: 6560, est_hh_cost: 2360, savings_per_patient: 4200, divertible_pct: 65, total_savings: 365820 },
          { diagnosis: "Hip/Knee Replacement", snf_patients: 54, avg_snf_los: 18, avg_snf_cost: 14040, est_hh_cost: 5540, savings_per_patient: 8500, divertible_pct: 30, total_savings: 137700 },
          { diagnosis: "Cellulitis", snf_patients: 46, avg_snf_los: 6, avg_snf_cost: 4740, est_hh_cost: 940, savings_per_patient: 3800, divertible_pct: 70, total_savings: 122360 },
          { diagnosis: "COPD", snf_patients: 38, avg_snf_los: 12, avg_snf_cost: 8010, est_hh_cost: 3210, savings_per_patient: 4800, divertible_pct: 45, total_savings: 82080 },
          { diagnosis: "Pneumonia", snf_patients: 42, avg_snf_los: 14, avg_snf_cost: 9660, est_hh_cost: 3860, savings_per_patient: 5800, divertible_pct: 40, total_savings: 97440 },
          { diagnosis: "Wound Care", snf_patients: 32, avg_snf_los: 19, avg_snf_cost: 13538, est_hh_cost: 6038, savings_per_patient: 7500, divertible_pct: 35, total_savings: 84000 },
        ],
      },
      {
        id: "irf_vs_snf",
        title: "Acute Rehab (IRF) vs SNF Analysis",
        type: "table",
        columns: [
          { key: "diagnosis", label: "Diagnosis" },
          { key: "irf_patients", label: "IRF Patients", numeric: true },
          { key: "irf_avg_cost", label: "IRF Avg Cost", numeric: true, format: "dollar" },
          { key: "irf_functional_gain", label: "IRF Outcomes (FIM Gain)" },
          { key: "snf_patients", label: "SNF Patients", numeric: true },
          { key: "snf_avg_cost", label: "SNF Avg Cost", numeric: true, format: "dollar" },
          { key: "snf_outcomes", label: "SNF Outcomes (FIM Gain)" },
          { key: "recommended", label: "Recommended Setting" },
          { key: "cost_difference", label: "Cost Difference", numeric: true, format: "dollar" },
        ],
        rows: [
          { diagnosis: "Stroke/CVA", irf_patients: 28, irf_avg_cost: 32400, irf_functional_gain: "+28 FIM pts, 6% readmit", snf_patients: 36, snf_avg_cost: 22800, snf_outcomes: "+14 FIM pts, 18% readmit", recommended: "IRF (net savings via fewer readmits)", cost_difference: 9600 },
          { diagnosis: "Hip/Knee Replacement", irf_patients: 12, irf_avg_cost: 24600, irf_functional_gain: "+22 FIM pts, 4% readmit", snf_patients: 54, snf_avg_cost: 14040, snf_outcomes: "+18 FIM pts, 9% readmit", recommended: "SNF for most; IRF for complex", cost_difference: 10560 },
          { diagnosis: "Brain Injury", irf_patients: 8, irf_avg_cost: 48200, irf_functional_gain: "+32 FIM pts, 5% readmit", snf_patients: 6, snf_avg_cost: 28600, snf_outcomes: "+12 FIM pts, 22% readmit", recommended: "IRF (clearly superior outcomes)", cost_difference: 19600 },
          { diagnosis: "Spinal Cord Injury", irf_patients: 5, irf_avg_cost: 52800, irf_functional_gain: "+26 FIM pts, 8% readmit", snf_patients: 3, snf_avg_cost: 31200, snf_outcomes: "+10 FIM pts, 28% readmit", recommended: "IRF (superior functional recovery)", cost_difference: 21600 },
          { diagnosis: "Major Joint (complex)", irf_patients: 6, irf_avg_cost: 28400, irf_functional_gain: "+24 FIM pts, 3% readmit", snf_patients: 8, snf_avg_cost: 18200, snf_outcomes: "+16 FIM pts, 14% readmit", recommended: "IRF for BMI>40 or bilateral", cost_difference: 10200 },
        ],
      },
      {
        id: "los_facility_diagnosis",
        title: "LOS by Facility by Diagnosis",
        type: "table",
        columns: [
          { key: "facility", label: "Facility" },
          { key: "diagnosis", label: "Diagnosis" },
          { key: "cases", label: "Cases", numeric: true },
          { key: "avg_los", label: "Avg LOS", numeric: true },
          { key: "cost", label: "Cost", numeric: true, format: "dollar" },
          { key: "readmit_rate", label: "Readmit Rate", numeric: true, format: "pct", benchmark: 14.0 },
        ],
        rows: [
          { facility: "Sunrise Skilled Nursing", diagnosis: "CHF", cases: 18, avg_los: 24, cost: 12480, readmit_rate: 28.0 },
          { facility: "Brookdale Health & Rehab", diagnosis: "CHF", cases: 14, avg_los: 16, cost: 6560, readmit_rate: 10.5 },
          { facility: "Sunrise Skilled Nursing", diagnosis: "Hip/Knee Replacement", cases: 12, avg_los: 22, cost: 11440, readmit_rate: 16.7 },
          { facility: "Oakview Nursing & Rehab", diagnosis: "Hip/Knee Replacement", cases: 10, avg_los: 15, cost: 6450, readmit_rate: 8.0 },
          { facility: "Valley Care Center", diagnosis: "Pneumonia", cases: 11, avg_los: 18, cost: 8280, readmit_rate: 22.0 },
          { facility: "Pinecrest Care Facility", diagnosis: "Pneumonia", cases: 8, avg_los: 11, cost: 4345, readmit_rate: 10.0 },
          { facility: "Sunrise Skilled Nursing", diagnosis: "Stroke/CVA", cases: 10, avg_los: 34, cost: 18360, readmit_rate: 20.0 },
          { facility: "Greenwood Rehabilitation", diagnosis: "Stroke/CVA", cases: 8, avg_los: 26, cost: 11830, readmit_rate: 12.5 },
          { facility: "Valley Care Center", diagnosis: "UTI/Sepsis", cases: 22, avg_los: 10, cost: 4100, readmit_rate: 18.2 },
          { facility: "Brookdale Health & Rehab", diagnosis: "UTI/Sepsis", cases: 28, avg_los: 6, cost: 2460, readmit_rate: 7.1 },
          { facility: "Sunrise Skilled Nursing", diagnosis: "COPD", cases: 8, avg_los: 16, cost: 7120, readmit_rate: 25.0 },
          { facility: "Pinecrest Care Facility", diagnosis: "COPD", cases: 6, avg_los: 9, cost: 3555, readmit_rate: 8.3 },
        ],
      },
      {
        id: "care_pathway_tracking",
        title: "Post-Acute Care Pathway Tracking",
        type: "table",
        columns: [
          { key: "pathway", label: "Pathway" },
          { key: "patient_count", label: "Patient Count", numeric: true },
          { key: "avg_total_cost", label: "Avg Total Cost", numeric: true, format: "dollar" },
          { key: "readmit_rate", label: "Readmit Rate", numeric: true, format: "pct", benchmark: 14.0 },
          { key: "outcome_90d", label: "90-Day Outcome" },
        ],
        rows: [
          { pathway: "Hospital → SNF → Home", patient_count: 340, avg_total_cost: 42000, readmit_rate: 14.0, outcome_90d: "72% independent at 90 days" },
          { pathway: "Hospital → Home + HH", patient_count: 180, avg_total_cost: 18000, readmit_rate: 8.0, outcome_90d: "84% independent at 90 days" },
          { pathway: "Hospital → IRF → Home", patient_count: 45, avg_total_cost: 56000, readmit_rate: 6.0, outcome_90d: "88% independent at 90 days" },
          { pathway: "Hospital → SNF → IRF → Home", patient_count: 12, avg_total_cost: 78000, readmit_rate: 22.0, outcome_90d: "52% independent at 90 days" },
          { pathway: "ER → Obs → Home", patient_count: 230, avg_total_cost: 4000, readmit_rate: 3.0, outcome_90d: "96% independent at 90 days" },
        ],
      },
      {
        id: "ai_recommendations",
        title: "AI Recommendations",
        type: "insights",
        items: [
          { title: "CHF LOS variation across facilities", description: "CHF patients at Sunrise SNF average 24 days vs 16 at Brookdale — same acuity profile. Shifting 40 CHF patients saves $320K/year.", dollar_impact: 320000, category: "cost" },
          { title: "UTI home health diversion opportunity", description: "65% of UTI SNF admissions (87 patients) could have been managed with home health. Estimated savings: $365K.", dollar_impact: 365000, category: "cost" },
          { title: "Acute rehab for stroke yields net savings", description: "Acute rehab for stroke patients costs 40% more than SNF but produces 22% fewer readmissions — net savings of $89K when accounting for readmission costs.", dollar_impact: 89000, category: "cost" },
          { title: "HCC capture rate critically low at SNFs", description: "Only 23% of SNF patients get HCC codes captured. Top facility (Brookdale) captures at 41%. Deploying coding pipeline to all SNFs: estimated $156K RAF uplift.", dollar_impact: 156000, category: "revenue" },
          { title: "Care pathway optimization — HH diversion", description: "Hospital → SNF → Home pathway costs $42K avg. Hospital → Home + HH costs $18K avg with LOWER readmission rate. Potential to divert 120 patients: $2.9M savings.", dollar_impact: 2900000, category: "cost" },
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

// ---- AI Query ("Ask the Data") ----

export const mockQuerySuggestions: Record<string, string[]> = {
  "/": [
    "What are the biggest revenue opportunities this quarter?",
    "Which providers need the most improvement in capture rate?",
    "What's driving our MLR above target?",
    "How does our recapture rate compare to benchmarks?",
    "Which care gaps have the highest financial impact?",
  ],
  "/expenditure": [
    "Which facility has the highest readmission rate?",
    "What's driving pharmacy cost increases?",
    "Which patients could be redirected from ER to urgent care?",
    "How does our inpatient PMPM compare to benchmark?",
    "What are the top 5 high-cost claimants this year?",
  ],
  "/suspects": [
    "Which suspect HCCs have the highest RAF value?",
    "How many diabetic patients have unconfirmed complications?",
    "Which providers have the most suspect HCC opportunities?",
  ],
  "/providers": [
    "Which providers have improved capture rate the most?",
    "Who are the bottom performers in gap closure?",
    "How does Dr. Patel compare to network averages?",
  ],
  "/care-gaps": [
    "Which care gaps have the lowest closure rate?",
    "How many diabetic patients are missing eye exams?",
    "What's the financial impact of open care gaps?",
  ],
  "/intelligence": [
    "What coding patterns differentiate top performers?",
    "Which playbook interventions have the best ROI?",
    "What are the most common coding errors?",
  ],
  "/groups": [
    "Which group has the best cost performance?",
    "How do group PMPM trends compare year-over-year?",
    "Which group has the most room for RAF improvement?",
  ],
};

export const mockQueryAnswers: Record<string, {
  answer: string;
  data_points: { label: string; value: string }[];
  related_members: { id: string; name: string; reason: string }[];
  recommended_actions: string[];
  follow_up_questions: string[];
}> = {
  readmission: {
    answer:
      "Memorial Hospital has the highest readmission rate in your network at 18.4%, which is significantly above the CMS benchmark of 15.2%. The primary drivers are CHF (28% of readmissions), COPD exacerbations (19%), and post-surgical infections (12%). This is costing approximately $1.2M annually in avoidable spend.\n\nNotably, 34 of the 67 readmitted patients lacked a follow-up visit within 7 days of discharge, suggesting a care transition gap.",
    data_points: [
      { label: "Readmission Rate", value: "18.4%" },
      { label: "CMS Benchmark", value: "15.2%" },
      { label: "Annual Avoidable Spend", value: "$1.2M" },
      { label: "Patients w/o 7-day F/U", value: "34 of 67" },
    ],
    related_members: [
      { id: "M1001", name: "Margaret Chen", reason: "CHF readmission x3 in 6 months" },
      { id: "M1023", name: "Robert Williams", reason: "COPD readmission, no PCP follow-up" },
      { id: "M1045", name: "Dorothy Martinez", reason: "Post-surgical infection readmission" },
    ],
    recommended_actions: [
      "Implement mandatory 48-hour post-discharge phone call for CHF and COPD patients",
      "Coordinate with Memorial Hospital to establish a transitional care nurse program",
      "Flag patients with 2+ readmissions for care management enrollment",
      "Review surgical site infection protocols at Memorial Hospital",
    ],
    follow_up_questions: [
      "Which providers are referring the most patients to Memorial Hospital?",
      "What's the cost comparison between Memorial and other facilities?",
      "Show me CHF patients at highest risk of readmission",
    ],
  },
  diabetic: {
    answer:
      "There are currently 127 diabetic patients in your population who are overdue for a retinal eye exam. This represents a 38% non-compliance rate for the Diabetic Eye Exam (DRE) HEDIS measure.\n\nOf these 127 patients, 43 have not had any eye exam in over 24 months, and 18 have documented diabetic retinopathy history making them highest priority. Closing these gaps would improve your Stars rating on this measure from 3 to 4 stars.",
    data_points: [
      { label: "Missing Eye Exams", value: "127 patients" },
      { label: "Non-compliance Rate", value: "38%" },
      { label: "No Exam in 24+ Mo", value: "43 patients" },
      { label: "Stars Impact", value: "3 \u2192 4 stars" },
    ],
    related_members: [
      { id: "M1089", name: "James Thompson", reason: "T2DM, no eye exam in 30 months, retinopathy hx" },
      { id: "M1102", name: "Patricia Davis", reason: "T1DM, no eye exam in 26 months" },
      { id: "M1134", name: "Linda Garcia", reason: "T2DM w/ nephropathy, no eye exam in 24 months" },
    ],
    recommended_actions: [
      "Generate outreach list for 18 patients with retinopathy history (highest priority)",
      "Schedule mobile retinal screening event at high-volume PCP offices",
      "Send bulk patient reminders for the 127 overdue members",
      "Coordinate with ophthalmology network to open same-week appointment slots",
    ],
    follow_up_questions: [
      "Which providers have the most diabetic patients with open eye exam gaps?",
      "What's the financial impact of improving this Stars measure?",
      "Show me all open care gaps for diabetic patients",
    ],
  },
  pharmacy: {
    answer:
      "Pharmacy costs have increased 13.1% year-over-year, now at $198 PMPM vs the benchmark of $175 PMPM. The top three drivers are:\n\n1. GLP-1 agonists (Ozempic, Mounjaro): 42 new starts in Q4, adding $680K annualized spend\n2. Specialty biologics for autoimmune conditions: 8% volume increase, $340K impact\n3. Brand-name statin prescribing: 23% of statin scripts are brand vs 8% benchmark\n\nThe GLP-1 growth alone accounts for 58% of the total pharmacy increase.",
    data_points: [
      { label: "Pharmacy PMPM", value: "$198" },
      { label: "Benchmark PMPM", value: "$175" },
      { label: "YoY Increase", value: "13.1%" },
      { label: "GLP-1 New Starts (Q4)", value: "42" },
      { label: "Brand Statin Rate", value: "23%" },
    ],
    related_members: [],
    recommended_actions: [
      "Implement prior authorization for GLP-1 agonists with BMI and A1c criteria",
      "Launch generic statin conversion program targeting 23% brand prescribers",
      "Review specialty biologic step therapy protocols",
      "Identify GLP-1 patients who may qualify for manufacturer copay assistance",
    ],
    follow_up_questions: [
      "Which providers have the highest brand-name prescribing rates?",
      "What's the projected pharmacy spend for next quarter?",
      "How do our GLP-1 utilization rates compare to regional benchmarks?",
    ],
  },
};

// ---- Learning / Self-Learning System ----

export const mockLearningReport = {
  generated_date: "2026-03-24",
  accuracy_over_time: [
    { month: "Oct", accuracy: 58.2, total: 312 },
    { month: "Nov", accuracy: 61.7, total: 347 },
    { month: "Dec", accuracy: 64.3, total: 389 },
    { month: "Jan", accuracy: 68.1, total: 421 },
    { month: "Feb", accuracy: 71.4, total: 456 },
    { month: "Mar", accuracy: 74.8, total: 498 },
  ],
  accuracy_by_type: [
    { type: "hcc_suspect", label: "HCC Suspect Predictions", accuracy: 76.3, total: 1847, confirmed: 1410 },
    { type: "cost_recommendation", label: "Cost Recommendations", accuracy: 68.5, total: 234, confirmed: 160 },
    { type: "gap_prediction", label: "Care Gap Predictions", accuracy: 82.1, total: 512, confirmed: 420 },
    { type: "pattern_match", label: "Pattern Matches", accuracy: 71.2, total: 189, confirmed: 135 },
  ],
  lessons: [
    {
      text: "CHF + CKD comorbidity predictions have 92% accuracy. When both conditions are suspected, confidence should be weighted 20% higher than baseline.",
      category: "strength" as const,
    },
    {
      text: "Depression predictions in patients under 50 have only 58% accuracy — many are anxiety-only cases. Consider requiring PHQ-9 evidence before flagging depression suspects in this cohort.",
      category: "blind_spot" as const,
    },
    {
      text: "Medication-diagnosis gap suspects (e.g., patient on metformin without diabetes code) have improved from 61% to 78% accuracy after incorporating pharmacy claims history.",
      category: "improvement" as const,
    },
    {
      text: "Provider coding pattern analysis shows that specificity predictions are most accurate for endocrinology (89%) and least accurate for behavioral health (52%).",
      category: "improvement" as const,
    },
  ],
  blind_spots: [
    { area: "Depression (under 50)", accuracy: 58, description: "Often anxiety-only cases misclassified as depression suspects" },
    { area: "Obesity (BMI 30-35)", accuracy: 52, description: "Borderline BMI cases frequently not coded even when flagged" },
    { area: "Vascular Disease", accuracy: 61, description: "Peripheral vascular suspects have high false-positive rate" },
  ],
  improving_areas: [
    { area: "CHF + CKD Comorbidity", accuracy: 92, trend: 8, description: "Dual-condition predictions consistently confirmed" },
    { area: "Diabetes Specificity", accuracy: 87, trend: 12, description: "Upgraded from unspecified to specific codes at high rates" },
    { area: "Med-Dx Gap Detection", accuracy: 78, trend: 17, description: "Pharmacy-driven suspects improving with claims history" },
    { area: "CKD Staging", accuracy: 84, trend: 6, description: "eGFR-based staging predictions reliably confirmed" },
  ],
};

export const mockLearningAccuracy = {
  evaluated_date: "2026-03-24",
  hcc_suspects: {
    total: 1847,
    confirmed: 1410,
    rejected: 289,
    expired: 148,
    accuracy_rate: 76.3,
  },
  gap_predictions: { closed: 420, still_open: 92, closure_rate: 82.0 },
  overall: { total_predictions_evaluated: 2782, total_correct: 2125, overall_accuracy: 76.4 },
};

export const mockLearningInteractions = {
  engagement_by_target: { insight: 342, suspect: 567, query: 189, playbook: 78, chase_list: 45 },
  dismissals_by_target: { insight: 89, suspect: 134 },
  top_pages: [
    { page: "/hcc", interactions: 423 },
    { page: "/dashboard", interactions: 312 },
    { page: "/expenditure", interactions: 198 },
    { page: "/providers", interactions: 167 },
    { page: "/care-gaps", interactions: 134 },
  ],
  recent_questions: [
    "Which providers have the most suspect HCCs?",
    "What's driving high ED utilization?",
    "Show me patients with CHF and open care gaps",
  ],
  has_preference_data: true,
};

// ---- Improvement Areas (Needs Improvement tab) ----

export const mockImprovementAreas = [
  {
    id: "ckd-staging",
    title: "CKD Staging Specificity — Declining",
    priority: "high" as const,
    current_metric: "72% unspecified (N18.9)",
    target_metric: "45% unspecified (top groups)",
    trend: "Declining 3% QoQ",
    root_cause: "Providers are not ordering eGFR consistently for their diabetic and hypertensive patients. Without recent eGFR results in the chart, coders default to unspecified CKD (N18.9) instead of staging to N18.3/N18.4. Lab ordering rates for eGFR are 38% below the network's top-performing groups.",
    recommended_fix: "Add eGFR to the standard diabetic lab panel so it is automatically ordered at every annual wellness visit. This gives coders the data they need to assign stage-specific CKD codes without additional provider burden.",
    expected_impact: "$89K",
    expected_impact_value: 89000,
    category: "HCC Coding",
  },
  {
    id: "snf-hcc-capture",
    title: "SNF HCC Capture Rate — Low",
    priority: "critical" as const,
    current_metric: "23% capture rate",
    target_metric: "55% capture rate",
    trend: "Flat — no improvement in 3 quarters",
    root_cause: "The AQTracker coding pipeline is not connected to SNF encounter data. When members are admitted to skilled nursing facilities, their diagnoses during the stay are not flowing into the HCC suspect identification workflow. This creates a blind spot for your highest-acuity members.",
    recommended_fix: "Deploy the SNF Admit Assist integration at the top 3 facilities (Suncoast, Bayfront SNF, Palm Gardens) which account for 68% of your SNF days. This connects SNF encounter feeds to the existing AQTracker pipeline.",
    expected_impact: "$156K",
    expected_impact_value: 156000,
    category: "HCC Capture",
  },
  {
    id: "statin-adherence",
    title: "Statin Adherence — Dropping Below 4-Star",
    priority: "critical" as const,
    current_metric: "PDC 78.3%",
    target_metric: "PDC 82%+ (4-star)",
    trend: "Dropped 4 pts this quarter",
    root_cause: "89 members switched from mail-order 90-day supply to retail 30-day supply in the last quarter. The 30-day fill pattern creates more refill events and more opportunities for gaps, which is depressing the proportion of days covered (PDC) calculation.",
    recommended_fix: "Launch a pharmacist outreach campaign to convert those 89 members back to 90-day mail-order supply. Target members with PDC between 70-80% first — they are closest to threshold and most impactful to move. Estimated 6-week timeline to full conversion.",
    expected_impact: "Triple-weighted Stars measure saved",
    expected_impact_value: 250000,
    category: "Stars / Quality",
  },
  {
    id: "fmg-st-pete",
    title: "FMG St. Pete — Capture Rate 47% Below Target",
    priority: "high" as const,
    current_metric: "28% capture rate",
    target_metric: "75% capture rate",
    trend: "Declining 5% QoQ",
    root_cause: "Only 1 of 3 providers at the FMG St. Pete office has been trained on HCC documentation requirements. The other two providers are coding at a specificity level consistent with fee-for-service patterns, missing HCC-relevant diagnoses on 72% of eligible encounters.",
    recommended_fix: "Schedule a coding education session for all three providers. Deploy the Diabetes Coding Playbook (which lifted capture rates 18 points at FMG Tampa). Assign a coding champion from the trained provider to do peer chart reviews for 60 days.",
    expected_impact: "$134K",
    expected_impact_value: 134000,
    category: "Provider Performance",
  },
  {
    id: "memorial-readmissions",
    title: "Memorial Hospital Readmissions — 47% Above Benchmark",
    priority: "critical" as const,
    current_metric: "16.2% readmit rate",
    target_metric: "11% network benchmark",
    trend: "Worsening — up 1.8 pts YoY",
    root_cause: "Insufficient discharge planning is the primary driver. 28% of CHF patients discharged from Memorial have no 7-day follow-up visit scheduled. The SNF transition process has no standardized handoff, and post-discharge medication reconciliation is happening in only 41% of cases.",
    recommended_fix: "Implement the SNF transition protocol at Memorial, including mandatory 48-hour post-discharge phone calls for all CHF and COPD patients. Require 7-day follow-up scheduling before discharge. Deploy the CHF discharge checklist that reduced readmissions 31% at St. Joseph.",
    expected_impact: "$423K",
    expected_impact_value: 423000,
    category: "Cost / Utilization",
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
