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
    mlr: 0.842,
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
    { hcc_code: 37, hcc_label: "Diabetes with Complications", member_count: 342, total_raf: 103.2, total_value: 1135200 },
    { hcc_code: 226, hcc_label: "CHF / Heart Failure", member_count: 189, total_raf: 61.0, total_value: 671000 },
    { hcc_code: 328, hcc_label: "CKD Stage 3b", member_count: 112, total_raf: 14.2, total_value: 156200 },
    { hcc_code: 327, hcc_label: "CKD Stage 4", member_count: 67, total_raf: 34.4, total_value: 378400 },
    { hcc_code: 326, hcc_label: "CKD Stage 5 / ESRD", member_count: 23, total_raf: 18.7, total_value: 205700 },
    { hcc_code: 280, hcc_label: "COPD / Chronic Lung", member_count: 198, total_raf: 55.4, total_value: 609400 },
    { hcc_code: 155, hcc_label: "Depression / Behavioral", member_count: 284, total_raf: 87.8, total_value: 965800 },
    { hcc_code: 48, hcc_label: "Morbid Obesity", member_count: 134, total_raf: 33.5, total_value: 368500 },
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
      { id: "S1001", condition_name: "CHF / Heart Failure", icd10_code: "I50.9", hcc_code: "HCC 226", raf_value: 0.360, annual_value: 3960, evidence_summary: "Last coded in PY2024. Carvedilol and furosemide active. Echo shows EF 40%. High confidence recapture.", confidence_score: 0.92, suspect_type: "recapture", status: "open" },
      { id: "S1002", condition_name: "Malnutrition", icd10_code: "E44.1", hcc_code: "HCC 21", raf_value: 0.455, annual_value: 5005, evidence_summary: "BMI 17.2, albumin 2.8 g/dL. On Ensure supplements. No malnutrition Dx coded this year.", confidence_score: 0.87, suspect_type: "med_dx_gap", status: "open" },
      { id: "S1003", condition_name: "Morbid Obesity", icd10_code: "E66.01", hcc_code: "HCC 48", raf_value: 0.186, annual_value: 2046, evidence_summary: "BMI documented at 42.1 but coded as E66.9 (unspecified). Should be E66.01 for morbid obesity.", confidence_score: 0.81, suspect_type: "specificity", status: "open" },
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
          { medication: "Warfarin / Apixaban", expected_diagnosis: "Atrial Fibrillation (I48.x)", hcc_code: "HCC 238", members_without_dx: 142, potential_raf_value: 86000 },
          { medication: "Furosemide + Carvedilol", expected_diagnosis: "Heart Failure (I50.x)", hcc_code: "HCC 226", members_without_dx: 38, potential_raf_value: 42000 },
          { medication: "Insulin", expected_diagnosis: "Diabetes w/ Complications", hcc_code: "HCC 37", members_without_dx: 24, potential_raf_value: 28000 },
          { medication: "Albuterol + ICS", expected_diagnosis: "COPD (J44.x)", hcc_code: "HCC 280", members_without_dx: 18, potential_raf_value: 16000 },
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

export const mockSystemPerformance = {
  overall_accuracy: 91.3,
  overall_accuracy_trend: 2.0,
  cost_accuracy: 89.2,
  cost_accuracy_trend: 1.4,
  suspect_confirmation_rate: 72.4,
  suspect_confirmation_trend: 3.1,
  risk_prediction_hits: 8,
  risk_prediction_total: 11,
  risk_prediction_trend: 0,
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

// ---- Journey / Member Timeline ----

export const mockJourneyMembers = [
  { id: 1, member_id: "M1001", name: "Margaret Chen", dob: "1953-08-14", current_raf: 1.847 },
  { id: 2, member_id: "M1002", name: "Robert Williams", dob: "1958-03-22", current_raf: 1.234 },
  { id: 3, member_id: "M1003", name: "Dorothy Martinez", dob: "1945-11-07", current_raf: 2.456 },
  { id: 4, member_id: "M1004", name: "James Thornton", dob: "1948-06-30", current_raf: 0.800 },
  { id: 5, member_id: "M1005", name: "Patricia Okafor", dob: "1942-01-15", current_raf: 1.100 },
];

export const mockJourneyData: Record<number, {
  member: {
    id: number; member_id: string; name: string; dob: string; age: number;
    gender: string; health_plan: string | null; pcp: string | null;
    current_raf: number; projected_raf: number; risk_tier: string | null;
    total_spend_12m: number; open_suspects: number; open_gaps: number;
    conditions: string[];
  };
  timeline: {
    date: string; type: string; title: string; provider: string;
    facility: string; diagnoses: string[]; cost: number;
    description: string; flags: { type: string; message: string }[];
  }[];
  narrative: string;
}> = {
  1: {
    member: {
      id: 1,
      member_id: "M1001",
      name: "Margaret Chen",
      dob: "1953-08-14",
      age: 72,
      gender: "F",
      health_plan: "Aetna Medicare Advantage",
      pcp: "Dr. James Rivera",
      current_raf: 1.847,
      projected_raf: 2.312,
      risk_tier: "complex",
      total_spend_12m: 87420,
      open_suspects: 3,
      open_gaps: 2,
      conditions: ["CHF (HCC 226)", "Type 2 Diabetes w/ CKD (HCC 37)", "CKD Stage 3a (HCC 329)", "Major Depression (HCC 155)", "COPD (HCC 280)", "Morbid Obesity (HCC 48)"],
    },
    timeline: [
      // --- 2026 Events ---
      {
        date: "2026-03-18",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "N18.3", "E66.01"],
        cost: 185,
        description: "Follow-up for CHF management. Weight stable. Reviewed medication adherence. Ordered BNP and metabolic panel.",
        flags: [{ type: "missed", message: "Missed: CKD stage not updated — eGFR 38 suggests N18.3a or Stage 3b" }],
      },
      {
        date: "2026-03-15",
        type: "rx_fill",
        title: "Rx Fill — Carvedilol 25mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 12,
        description: "30-day supply. Beta-blocker for CHF.",
        flags: [],
      },
      {
        date: "2026-03-15",
        type: "rx_fill",
        title: "Rx Fill — Furosemide 40mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 8,
        description: "30-day supply. Loop diuretic for fluid management.",
        flags: [],
      },
      {
        date: "2026-03-10",
        type: "lab",
        title: "Lab Panel — Comprehensive Metabolic",
        provider: "Quest Diagnostics",
        facility: "Quest Diagnostics",
        diagnoses: ["Z00.00"],
        cost: 45,
        description: "eGFR 38 mL/min (Stage 3b CKD), BNP 420 pg/mL (elevated), A1c 7.8%, albumin 2.8 g/dL.",
        flags: [{ type: "missed", message: "Missed: eGFR 38 — CKD not coded during subsequent visit despite lab evidence" }],
      },
      {
        date: "2026-02-28",
        type: "specialist_visit",
        title: "Psychiatry Visit — Dr. Anita Desai",
        provider: "Dr. Anita Desai",
        facility: "Bayshore Behavioral Health",
        diagnoses: ["F33.1"],
        cost: 210,
        description: "Medication management for recurrent major depression. PHQ-9 score: 14. Adjusted sertraline to 150mg.",
        flags: [],
      },
      {
        date: "2026-02-20",
        type: "rx_fill",
        title: "Rx Fill — Sertraline 150mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 15,
        description: "30-day supply. SSRI for depression — dose increased.",
        flags: [],
      },
      {
        date: "2026-02-15",
        type: "rx_fill",
        title: "Rx Fill — Metformin 1000mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 10,
        description: "90-day supply. Biguanide for type 2 diabetes.",
        flags: [],
      },
      {
        date: "2026-02-10",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "J44.1"],
        cost: 185,
        description: "Routine follow-up. Discussed weight management. COPD exacerbation symptoms improving post-prednisone taper.",
        flags: [],
      },
      {
        date: "2026-01-28",
        type: "specialist_visit",
        title: "Pulmonology Visit — Dr. Kevin Park",
        provider: "Dr. Kevin Park",
        facility: "Tampa Pulmonary Associates",
        diagnoses: ["J44.1", "J96.11"],
        cost: 245,
        description: "COPD follow-up. PFTs show FEV1 52% predicted. Added tiotropium. Discussed pulmonary rehab referral.",
        flags: [],
      },
      {
        date: "2026-01-15",
        type: "gap_closed",
        title: "Care Gap Closed — BCS (Breast Cancer Screening)",
        provider: "Tampa Imaging Center",
        facility: "Tampa Imaging Center",
        diagnoses: [],
        cost: 0,
        description: "Annual mammogram completed. BIRADS 1 — negative.",
        flags: [{ type: "success", message: "BCS gap closed — screening up to date" }],
      },
      {
        date: "2026-01-12",
        type: "rx_fill",
        title: "Rx Fill — Atorvastatin 40mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 11,
        description: "90-day supply. Statin for cardiovascular risk reduction.",
        flags: [],
      },
      {
        date: "2026-01-05",
        type: "hcc_captured",
        title: "HCC Captured — Major Depression (HCC 59)",
        provider: "Dr. Anita Desai",
        facility: "Bayshore Behavioral Health",
        diagnoses: ["F33.1"],
        cost: 0,
        description: "Depression recaptured through psychiatry visit with PHQ-9 documentation.",
        flags: [{ type: "success", message: "Success: Depression captured, +0.309 RAF" }],
      },
      // --- 2025 Events ---
      {
        date: "2025-12-20",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "E66.01"],
        cost: 185,
        description: "Annual wellness visit. Reviewed all chronic conditions. Ordered screening labs and mammogram.",
        flags: [],
      },
      {
        date: "2025-12-05",
        type: "rx_fill",
        title: "Rx Fill — Lisinopril 20mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 9,
        description: "90-day supply. ACE inhibitor for heart failure and renal protection.",
        flags: [],
      },
      {
        date: "2025-11-18",
        type: "specialist_visit",
        title: "Nephrology Visit — Dr. Maria Santos",
        provider: "Dr. Maria Santos",
        facility: "Tampa Kidney Care",
        diagnoses: ["N18.3", "E11.22"],
        cost: 230,
        description: "CKD monitoring. eGFR 42. Discussed dietary modifications and ACE inhibitor continuation.",
        flags: [],
      },
      {
        date: "2025-11-02",
        type: "er_visit",
        title: "ER Visit at Memorial Hospital — Fall / Syncope",
        provider: "Dr. Emergency Staff",
        facility: "Memorial Hospital",
        diagnoses: ["R55", "W19.XXXA"],
        cost: 3840,
        description: "Presented with syncope and fall at home. CT head negative. Orthostatic hypotension identified. Furosemide dose adjusted.",
        flags: [],
      },
      {
        date: "2025-10-25",
        type: "gap_closed",
        title: "Care Gap Closed — CDC-HbA1c (Diabetes HbA1c Control)",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: [],
        cost: 0,
        description: "HbA1c 7.8% — within control range for her age/comorbidities.",
        flags: [{ type: "success", message: "CDC-HbA1c gap closed — A1c in target range" }],
      },
      {
        date: "2025-10-20",
        type: "lab",
        title: "Lab Panel — A1c + Lipids + CMP",
        provider: "Quest Diagnostics",
        facility: "Quest Diagnostics",
        diagnoses: ["Z00.00"],
        cost: 68,
        description: "A1c 7.8%, LDL 98, eGFR 42, K+ 4.1, Creatinine 1.4.",
        flags: [],
      },
      {
        date: "2025-10-12",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "J44.1"],
        cost: 185,
        description: "Chronic disease management. Ordered A1c and lipid panel. Discussed fall prevention.",
        flags: [],
      },
      {
        date: "2025-09-15",
        type: "hh_end",
        title: "Home Health Episode Completed",
        provider: "BayCare Home Health",
        facility: "BayCare Home Health",
        diagnoses: ["I50.9"],
        cost: 0,
        description: "6-week home health episode completed. Patient met goals for independent ADLs and medication management.",
        flags: [{ type: "success", message: "Home health episode completed — goals met" }],
      },
      {
        date: "2025-08-04",
        type: "hh_start",
        title: "Home Health Episode Started",
        provider: "BayCare Home Health",
        facility: "BayCare Home Health",
        diagnoses: ["I50.9", "M62.81"],
        cost: 4200,
        description: "Skilled nursing visits 3x/week, PT 2x/week. Post-SNF discharge for CHF deconditioning.",
        flags: [],
      },
      {
        date: "2025-08-02",
        type: "snf_discharge",
        title: "Discharged from Suncoast SNF",
        provider: "Suncoast Skilled Nursing",
        facility: "Suncoast SNF",
        diagnoses: ["I50.9"],
        cost: 0,
        description: "21-day SNF stay. Discharged to home with home health services.",
        flags: [],
      },
      {
        date: "2025-07-12",
        type: "snf_admit",
        title: "SNF Admission — Suncoast SNF",
        provider: "Suncoast Skilled Nursing",
        facility: "Suncoast SNF",
        diagnoses: ["I50.9", "M62.81", "E44.1"],
        cost: 18900,
        description: "Post-acute rehab after CHF hospitalization. PT/OT daily, nutritional support for malnutrition.",
        flags: [{ type: "missed", message: "Missed: Malnutrition (E44.1) documented but not captured as HCC 21 — albumin 2.6" }],
      },
      {
        date: "2025-07-10",
        type: "discharge",
        title: "Discharged from Memorial Hospital",
        provider: "Memorial Hospital",
        facility: "Memorial Hospital",
        diagnoses: ["I50.33"],
        cost: 0,
        description: "5-day inpatient stay for acute systolic CHF exacerbation. Discharged to SNF.",
        flags: [],
      },
      {
        date: "2025-07-05",
        type: "admission",
        title: "Admitted to Memorial Hospital — CHF Exacerbation",
        provider: "Dr. Robert Chen (Hospitalist)",
        facility: "Memorial Hospital",
        diagnoses: ["I50.33", "J81.0", "N18.3", "E11.65"],
        cost: 24500,
        description: "Acute systolic CHF with pulmonary edema. IV diuretics, cardiology consult. BNP 1,840.",
        flags: [{ type: "missed", message: "Missed: CKD not coded on discharge despite eGFR 38 in labs" }],
      },
      {
        date: "2025-07-04",
        type: "er_visit",
        title: "ER Visit at Memorial Hospital — Dyspnea / CHF",
        provider: "Dr. Emergency Staff",
        facility: "Memorial Hospital",
        diagnoses: ["R06.00", "I50.9"],
        cost: 4200,
        description: "Presented with acute dyspnea, bilateral rales, 8lb weight gain over 3 days. Admitted from ER.",
        flags: [],
      },
      {
        date: "2025-06-15",
        type: "specialist_visit",
        title: "Cardiology Visit — Dr. Ahmed Khan",
        provider: "Dr. Ahmed Khan",
        facility: "Tampa Cardiology Associates",
        diagnoses: ["I50.9", "I25.10"],
        cost: 280,
        description: "Pre-scheduled cardiology follow-up. Echo: EF 35% (down from 40%). Increased carvedilol dose. Discussed ICD.",
        flags: [],
      },
      {
        date: "2025-06-01",
        type: "rx_fill",
        title: "Rx Fill — Spironolactone 25mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 14,
        description: "30-day supply. Aldosterone antagonist added for heart failure.",
        flags: [],
      },
      {
        date: "2025-05-20",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "E66.01", "J44.1"],
        cost: 185,
        description: "Routine follow-up. Noted increasing peripheral edema. Referred to cardiology. Discussed dietary sodium.",
        flags: [],
      },
      {
        date: "2025-04-15",
        type: "rx_fill",
        title: "Rx Fill — Jardiance 10mg",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 485,
        description: "30-day supply. SGLT2 inhibitor for diabetes and heart failure benefit.",
        flags: [],
      },
      {
        date: "2025-04-01",
        type: "gap_closed",
        title: "Care Gap Closed — SPD (Statin Adherence Diabetes)",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 0,
        description: "PDC for statin reached 89% — gap closed.",
        flags: [{ type: "success", message: "SPD gap closed — statin adherence above threshold" }],
      },
      {
        date: "2025-03-22",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "N18.3"],
        cost: 185,
        description: "Chronic disease follow-up. Weight up 4 lbs. Adjusted furosemide. Ordered BNP.",
        flags: [],
      },
      {
        date: "2025-03-10",
        type: "hcc_captured",
        title: "HCC Captured — CHF (HCC 226)",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9"],
        cost: 0,
        description: "CHF recaptured during PCP visit with appropriate documentation.",
        flags: [{ type: "success", message: "Success: CHF recaptured, +0.360 RAF" }],
      },
      {
        date: "2025-02-28",
        type: "lab",
        title: "Lab Panel — BNP + CMP",
        provider: "Quest Diagnostics",
        facility: "Quest Diagnostics",
        diagnoses: ["Z00.00"],
        cost: 52,
        description: "BNP 380 pg/mL, eGFR 44, Creatinine 1.3, A1c 8.1%.",
        flags: [],
      },
      {
        date: "2025-02-15",
        type: "specialist_visit",
        title: "Nephrology Visit — Dr. Maria Santos",
        provider: "Dr. Maria Santos",
        facility: "Tampa Kidney Care",
        diagnoses: ["N18.3", "E11.22"],
        cost: 230,
        description: "CKD Stage 3 monitoring. eGFR stable at 44. Continue current regimen.",
        flags: [],
      },
      {
        date: "2025-01-20",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65"],
        cost: 185,
        description: "New year visit. Reviewed all meds. Stable. Referred to nephrology for CKD monitoring.",
        flags: [],
      },
      // --- 2024 Events ---
      {
        date: "2024-12-10",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "E66.01"],
        cost: 185,
        description: "Annual wellness visit. Comprehensive chronic disease review. All screenings ordered.",
        flags: [],
      },
      {
        date: "2024-11-20",
        type: "rx_fill",
        title: "Rx Fill — Ensure Plus (Nutritional Supplement)",
        provider: "CVS Pharmacy #4821",
        facility: "CVS Pharmacy",
        diagnoses: [],
        cost: 45,
        description: "30-day supply. Nutritional supplement for weight maintenance.",
        flags: [],
      },
      {
        date: "2024-11-05",
        type: "snf_discharge",
        title: "Discharged from Palm Gardens SNF",
        provider: "Palm Gardens Rehab",
        facility: "Palm Gardens SNF",
        diagnoses: ["J18.9"],
        cost: 0,
        description: "14-day SNF stay for post-pneumonia rehabilitation. Discharged to home.",
        flags: [],
      },
      {
        date: "2024-10-22",
        type: "snf_admit",
        title: "SNF Admission — Palm Gardens",
        provider: "Palm Gardens Rehab",
        facility: "Palm Gardens SNF",
        diagnoses: ["J18.9", "I50.9", "M62.81"],
        cost: 12600,
        description: "Post-acute rehabilitation after pneumonia hospitalization. Respiratory therapy + PT/OT.",
        flags: [],
      },
      {
        date: "2024-10-20",
        type: "discharge",
        title: "Discharged from St. Joseph Hospital",
        provider: "St. Joseph Hospital",
        facility: "St. Joseph Hospital",
        diagnoses: ["J18.9"],
        cost: 0,
        description: "4-day inpatient stay for community-acquired pneumonia. Discharged to SNF for rehab.",
        flags: [],
      },
      {
        date: "2024-10-16",
        type: "admission",
        title: "Admitted to St. Joseph Hospital — Pneumonia",
        provider: "Dr. Lisa Wong (Hospitalist)",
        facility: "St. Joseph Hospital",
        diagnoses: ["J18.9", "J96.01", "I50.9", "E11.65"],
        cost: 18200,
        description: "Community-acquired pneumonia with hypoxic respiratory failure. IV antibiotics, supplemental O2.",
        flags: [],
      },
      {
        date: "2024-10-15",
        type: "er_visit",
        title: "ER Visit at St. Joseph Hospital — Fever / Cough / Dyspnea",
        provider: "Dr. Emergency Staff",
        facility: "St. Joseph Hospital",
        diagnoses: ["R50.9", "R05.9", "R06.00"],
        cost: 3650,
        description: "Presented with 3-day fever, productive cough, worsening dyspnea. Chest X-ray: bilateral infiltrates. Admitted.",
        flags: [],
      },
      {
        date: "2024-09-15",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "J44.1"],
        cost: 185,
        description: "Routine follow-up. Stable. Flu vaccine administered.",
        flags: [],
      },
      {
        date: "2024-08-10",
        type: "lab",
        title: "Lab Panel — CMP + A1c + Lipids",
        provider: "Quest Diagnostics",
        facility: "Quest Diagnostics",
        diagnoses: ["Z00.00"],
        cost: 72,
        description: "eGFR 46, A1c 7.6%, LDL 102, Total cholesterol 198.",
        flags: [],
      },
      {
        date: "2024-07-20",
        type: "specialist_visit",
        title: "Cardiology Visit — Dr. Ahmed Khan",
        provider: "Dr. Ahmed Khan",
        facility: "Tampa Cardiology Associates",
        diagnoses: ["I50.9"],
        cost: 280,
        description: "Annual cardiology review. Echo: EF 40%. Stable on current regimen.",
        flags: [],
      },
      {
        date: "2024-06-15",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65"],
        cost: 185,
        description: "Routine visit. Discussed exercise tolerance. Stable.",
        flags: [],
      },
      {
        date: "2024-05-10",
        type: "admission",
        title: "Admitted to Memorial Hospital — Fall with Hip Contusion",
        provider: "Dr. Robert Chen (Hospitalist)",
        facility: "Memorial Hospital",
        diagnoses: ["W01.0XXA", "S70.01XA", "I50.9"],
        cost: 9800,
        description: "Fall at home with hip contusion. Observation 48hrs. X-ray negative for fracture. PT evaluation.",
        flags: [],
      },
      {
        date: "2024-04-20",
        type: "pcp_visit",
        title: "PCP Visit — Dr. James Rivera",
        provider: "Dr. James Rivera",
        facility: "Bayshore Primary Care",
        diagnoses: ["I50.9", "E11.65", "N18.3"],
        cost: 185,
        description: "Chronic disease management. Reviewed home BP log. Stable.",
        flags: [],
      },
    ],
    narrative: "Margaret Chen's 24-month journey shows 3 hospitalizations (CHF exacerbation, pneumonia, fall), 2 SNF stays totaling 35 days, a home health episode, and increasing acuity with EF declining from 40% to 35%. She has 12 PCP visits, 4 specialist visits (cardiology, nephrology, pulmonology, psychiatry), and monthly pharmacy fills across 8 medications. Positive outcomes include 2 HCC captures (+0.632 RAF) and 3 care gaps closed. Key missed opportunity: CKD was not coded during her July 2025 admission despite eGFR 38 in labs, and malnutrition (albumin 2.6) was documented at SNF but never captured as HCC 21. RAF trajectory shows steady increase from 1.2 to 1.847 with visible jumps at HCC capture events.",
  },
};

export const mockTrajectoryData: Record<number, {
  date: string; raf: number; cost: number;
  disease_raf: number; demographic_raf: number;
  hcc_count: number; event?: string;
}[]> = {
  1: [
    { date: "2024-04", raf: 1.200, cost: 1850, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-05", raf: 1.200, cost: 10200, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-06", raf: 1.200, cost: 1420, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-07", raf: 1.200, cost: 1680, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-08", raf: 1.200, cost: 1520, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-09", raf: 1.200, cost: 1340, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-10", raf: 1.200, cost: 34650, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-11", raf: 1.200, cost: 2100, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2024-12", raf: 1.200, cost: 1280, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2025-01", raf: 1.200, cost: 1340, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2025-02", raf: 1.200, cost: 1580, disease_raf: 0.750, demographic_raf: 0.450, hcc_count: 4 },
    { date: "2025-03", raf: 1.523, cost: 1420, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5, event: "HCC 226 Captured" },
    { date: "2025-04", raf: 1.523, cost: 1860, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-05", raf: 1.523, cost: 1540, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-06", raf: 1.523, cost: 1680, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-07", raf: 1.523, cost: 47600, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-08", raf: 1.523, cost: 23100, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-09", raf: 1.523, cost: 4200, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-10", raf: 1.523, cost: 1620, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-11", raf: 1.523, cost: 4280, disease_raf: 1.073, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2025-12", raf: 1.538, cost: 1340, disease_raf: 1.088, demographic_raf: 0.450, hcc_count: 5 },
    { date: "2026-01", raf: 1.847, cost: 1520, disease_raf: 1.397, demographic_raf: 0.450, hcc_count: 6, event: "HCC 59 Captured" },
    { date: "2026-02", raf: 1.847, cost: 1680, disease_raf: 1.397, demographic_raf: 0.450, hcc_count: 6 },
    { date: "2026-03", raf: 1.847, cost: 1420, disease_raf: 1.397, demographic_raf: 0.450, hcc_count: 6 },
  ],
};

// ---- Financial P&L ----

export const mockFinancialPnl = {
  period: "ytd",
  revenue: {
    capitation: 5_800_000,
    raf_adjustment: 980_000,
    quality_bonus: 220_000,
    per_capture_fees: 200_000,
    total: 7_200_000,
  },
  expenses: {
    inpatient: 2_100_000,
    pharmacy: 980_000,
    professional: 870_000,
    ed_observation: 620_000,
    snf_postacute: 540_000,
    home_health: 420_000,
    dme: 290_000,
    administrative: 180_000,
    care_management: 100_000,
    total: 6_100_000,
  },
  surplus: 1_100_000,
  mlr: 0.8472,
  member_count: 4_832,
  per_member_margin: 227.65,
  comparison: {
    budget: { revenue: 7_050_000, expenses: 6_300_000, surplus: 750_000, mlr: 0.8936 },
    prior_year: { revenue: 6_480_000, expenses: 5_720_000, surplus: 760_000, mlr: 0.8827 },
    prior_quarter: { revenue: 1_750_000, expenses: 1_580_000, surplus: 170_000, mlr: 0.9029 },
  },
  ibnr_estimate: 342_000,
  ibnr_confidence: 89.0,
  projected: {
    expenses: {
      inpatient: 2_248_000,
      pharmacy: 1_002_000,
      professional: 904_000,
      ed_observation: 662_000,
      snf_postacute: 608_000,
      home_health: 438_000,
      dme: 300_000,
      administrative: 180_000,
      care_management: 100_000,
      ibnr_reserve: 342_000,
      total: 6_784_000,
    },
    surplus: 416_000,
    mlr: 0.9422,
    per_member_margin: 86.09,
  },
  signal_estimates: {
    inpatient: 148_000,
    ed_observation: 42_000,
    snf_postacute: 68_000,
    pharmacy: 22_000,
    professional: 34_000,
    home_health: 18_000,
    dme: 10_000,
  },
  data_completeness: 94.7,
};

export const mockFinancialByPlan = [
  { plan: "Humana", members: 2_140, revenue: 3_180_000, expenses: 2_860_000, surplus: 320_000, mlr: 0.8994, per_member_margin: 149.53 },
  { plan: "Aetna", members: 1_480, revenue: 2_210_000, expenses: 2_195_000, surplus: 15_000, mlr: 0.9932, per_member_margin: 10.14 },
  { plan: "UnitedHealthcare", members: 820, revenue: 1_220_000, expenses: 1_265_000, surplus: -45_000, mlr: 1.0369, per_member_margin: -54.88 },
  { plan: "Cigna", members: 392, revenue: 590_000, expenses: 480_000, surplus: 110_000, mlr: 0.8136, per_member_margin: 280.61 },
];

export const mockFinancialByGroup = [
  { group: "ISG Tampa", providers: 12, members: 1_840, revenue: 2_740_000, expenses: 2_260_000, surplus: 480_000, mlr: 0.8248, per_member_margin: 260.87 },
  { group: "FMG St. Pete", providers: 8, members: 1_260, revenue: 1_880_000, expenses: 1_760_000, surplus: 120_000, mlr: 0.9362, per_member_margin: 95.24 },
  { group: "ISG Brandon", providers: 6, members: 980, revenue: 1_460_000, expenses: 1_549_000, surplus: -89_000, mlr: 1.0610, per_member_margin: -90.82 },
  { group: "Coastal Medical", providers: 5, members: 752, revenue: 1_120_000, expenses: 531_000, surplus: 589_000, mlr: 0.4741, per_member_margin: 783.24 },
];

export const mockFinancialForecast = {
  months: 12,
  projections: [
    { month_offset: 1, label: "Apr 2026", revenue: 617_320, expense: 485_100, margin: 132_220, revenue_low: 598_800, revenue_high: 635_840, expense_low: 470_547, expense_high: 499_653 },
    { month_offset: 2, label: "May 2026", revenue: 624_640, expense: 463_080, margin: 161_560, revenue_low: 601_077, revenue_high: 648_203, expense_low: 445_517, expense_high: 480_643 },
    { month_offset: 3, label: "Jun 2026", revenue: 631_960, expense: 448_630, margin: 183_330, revenue_low: 602_818, revenue_high: 661_102, expense_low: 428_058, expense_high: 469_202 },
    { month_offset: 4, label: "Jul 2026", revenue: 639_280, expense: 441_940, margin: 197_340, revenue_low: 604_040, revenue_high: 674_520, expense_low: 417_513, expense_high: 466_367 },
    { month_offset: 5, label: "Aug 2026", revenue: 646_600, expense: 439_240, margin: 207_360, revenue_low: 604_727, revenue_high: 688_473, expense_low: 410_570, expense_high: 467_910 },
    { month_offset: 6, label: "Sep 2026", revenue: 653_920, expense: 446_880, margin: 207_040, revenue_low: 604_878, revenue_high: 702_962, expense_low: 413_374, expense_high: 480_386 },
    { month_offset: 7, label: "Oct 2026", revenue: 661_240, expense: 466_820, margin: 194_420, revenue_low: 604_494, revenue_high: 717_986, expense_low: 426_839, expense_high: 506_801 },
    { month_offset: 8, label: "Nov 2026", revenue: 668_560, expense: 479_680, margin: 188_880, revenue_low: 603_573, revenue_high: 733_547, expense_low: 433_311, expense_high: 526_049 },
    { month_offset: 9, label: "Dec 2026", revenue: 675_880, expense: 500_720, margin: 175_160, revenue_low: 602_116, revenue_high: 749_644, expense_low: 445_640, expense_high: 555_800 },
    { month_offset: 10, label: "Jan 2027", revenue: 683_200, expense: 530_400, margin: 152_800, revenue_low: 600_124, revenue_high: 766_276, expense_low: 466_752, expense_high: 594_048 },
    { month_offset: 11, label: "Feb 2027", revenue: 690_520, expense: 510_200, margin: 180_320, revenue_low: 597_600, revenue_high: 783_440, expense_low: 441_373, expense_high: 579_027 },
    { month_offset: 12, label: "Mar 2027", revenue: 697_840, expense: 499_800, margin: 198_040, revenue_low: 594_541, revenue_high: 801_139, expense_low: 425_830, expense_high: 573_770 },
  ],
  summary: {
    total_projected_revenue: 7_890_960,
    total_projected_expense: 5_712_490,
    total_projected_margin: 2_178_470,
    avg_monthly_margin: 181_539,
  },
};

// ---- Dual Data Tier: Reconciliation & IBNR ----

export const mockReconciliationReport = {
  overall_accuracy: 91.3,
  total_reconciled: 847,
  avg_bias_pct: -2.4,
  trend: "improving" as const,
  trend_pct: 2.0,
  by_facility: [
    { facility: "Tampa General Hospital", count: 312, accuracy: 92.1, bias: -1.8 },
    { facility: "St. Joseph's Hospital", count: 198, accuracy: 94.2, bias: -0.9 },
    { facility: "Memorial Hospital of Tampa", count: 142, accuracy: 87.4, bias: -5.1 },
    { facility: "Bayshore Medical Center", count: 108, accuracy: 90.8, bias: -2.2 },
    { facility: "Sunrise SNF & Rehab", count: 87, accuracy: 93.6, bias: 1.4 },
  ],
  by_patient_class: [
    { patient_class: "inpatient", count: 412, accuracy: 89.7 },
    { patient_class: "emergency", count: 198, accuracy: 94.1 },
    { patient_class: "observation", count: 108, accuracy: 92.8 },
    { patient_class: "snf", count: 87, accuracy: 93.6 },
    { patient_class: "rehab", count: 42, accuracy: 88.2 },
  ],
  by_service_category: [
    { category: "inpatient", count: 412, accuracy: 89.7 },
    { category: "ed_observation", count: 306, accuracy: 93.4 },
    { category: "snf_postacute", count: 129, accuracy: 91.8 },
  ],
  biggest_misses: [
    { event_id: 4001, facility: "Memorial Hospital of Tampa", patient_class: "inpatient", error_pct: 42.3, estimated: 16000, actual: 27480 },
    { event_id: 4002, facility: "Tampa General Hospital", patient_class: "inpatient", error_pct: -38.1, estimated: 16000, actual: 9900 },
    { event_id: 4003, facility: "Bayshore Medical Center", patient_class: "snf", error_pct: 31.7, estimated: 17850, actual: 23510 },
    { event_id: 4004, facility: "St. Joseph's Hospital", patient_class: "inpatient", error_pct: -27.4, estimated: 16000, actual: 11620 },
    { event_id: 4005, facility: "Tampa General Hospital", patient_class: "observation", error_pct: 25.9, estimated: 4200, actual: 5290 },
  ],
};

export const mockIbnrEstimate = {
  total_ibnr: 342_000,
  total_raw: 375_400,
  by_category: {
    inpatient: { count: 8, raw_estimate: 148_000, adjusted_estimate: 135_200 },
    ed_observation: { count: 7, raw_estimate: 42_000, adjusted_estimate: 38_350 },
    snf_postacute: { count: 3, raw_estimate: 68_000, adjusted_estimate: 62_100 },
    pharmacy: { count: 12, raw_estimate: 22_000, adjusted_estimate: 20_100 },
    professional: { count: 15, raw_estimate: 34_000, adjusted_estimate: 31_050 },
    home_health: { count: 4, raw_estimate: 18_000, adjusted_estimate: 16_440 },
    dme: { count: 6, raw_estimate: 10_000, adjusted_estimate: 9_130 },
  },
  confidence: 89.0,
  adjustment_factor: 0.9110,
};

export const mockProjectedPnl = {
  expenses: {
    inpatient: 2_248_000,
    pharmacy: 1_002_000,
    professional: 904_000,
    ed_observation: 662_000,
    snf_postacute: 608_000,
    home_health: 438_000,
    dme: 300_000,
    administrative: 180_000,
    care_management: 100_000,
    ibnr_reserve: 342_000,
    total: 6_784_000,
  },
  surplus: 416_000,
  mlr: 0.9422,
  per_member_margin: 86.09,
};

// ---- Dynamic Cohort Builder ----

export const mockCohortBuildResult = {
  member_count: 8,
  filters_applied: { age_min: 65, diagnoses_include: ["E11"], er_visits_min: 2 },
  aggregate_stats: {
    avg_raf: 1.834,
    total_spend: 316_500,
    avg_spend: 39_563,
    avg_age: 71.8,
    avg_er_visits: 3.0,
    avg_admissions: 1.3,
    pct_high_risk: 87.5,
    total_open_gaps: 17,
  },
  top_diagnoses: [
    { code: "E11.65", count: 4 },
    { code: "I10", count: 2 },
    { code: "E11.22", count: 2 },
    { code: "N18.3", count: 2 },
    { code: "I50.9", count: 1 },
  ],
  top_suspects: [
    { code: "HCC 37", count: 8 },
    { code: "HCC 226", count: 2 },
    { code: "HCC 329", count: 2 },
    { code: "HCC 280", count: 1 },
    { code: "HCC 48", count: 1 },
  ],
  members: [
    { id: "M1001", name: "Margaret Chen", age: 72, gender: "F", raf: 1.847, risk_tier: "high", provider: "Dr. Sarah Patel", group: "ISG Tampa", er_visits: 3, admissions: 1, total_spend: 34_200, top_diagnoses: ["E11.65", "I10", "N18.3"], open_gaps: 2, suspect_hccs: ["HCC 37", "HCC 226"] },
    { id: "M1047", name: "Robert Williams", age: 68, gender: "M", raf: 2.134, risk_tier: "high", provider: "Dr. James Rivera", group: "ISG Tampa", er_visits: 4, admissions: 2, total_spend: 52_800, top_diagnoses: ["E11.22", "I50.9", "J44.1"], open_gaps: 3, suspect_hccs: ["HCC 37", "HCC 280"] },
    { id: "M1123", name: "Dorothy Jackson", age: 78, gender: "F", raf: 1.623, risk_tier: "high", provider: "Dr. Lisa Chen", group: "FMG St. Pete", er_visits: 2, admissions: 1, total_spend: 28_900, top_diagnoses: ["E11.9", "E78.5", "M81.0"], open_gaps: 1, suspect_hccs: ["HCC 37"] },
    { id: "M1089", name: "James Thompson", age: 71, gender: "M", raf: 1.956, risk_tier: "high", provider: "Dr. Michael Torres", group: "ISG Tampa", er_visits: 3, admissions: 1, total_spend: 41_300, top_diagnoses: ["E11.65", "I25.10", "N18.4"], open_gaps: 2, suspect_hccs: ["HCC 37", "HCC 329"] },
    { id: "M1201", name: "Patricia Davis", age: 66, gender: "F", raf: 1.478, risk_tier: "medium", provider: "Dr. Angela Brooks", group: "FMG St. Pete", er_visits: 2, admissions: 0, total_spend: 22_100, top_diagnoses: ["E11.40", "I10", "E78.0"], open_gaps: 1, suspect_hccs: ["HCC 37"] },
    { id: "M1156", name: "William Harris", age: 74, gender: "M", raf: 2.312, risk_tier: "high", provider: "Dr. Sarah Patel", group: "ISG Tampa", er_visits: 5, admissions: 3, total_spend: 67_400, top_diagnoses: ["E11.65", "I50.22", "N18.5", "J44.1"], open_gaps: 4, suspect_hccs: ["HCC 37", "HCC 226", "HCC 329"] },
    { id: "M1278", name: "Barbara Martinez", age: 69, gender: "F", raf: 1.589, risk_tier: "high", provider: "Dr. James Rivera", group: "ISG Brandon", er_visits: 2, admissions: 1, total_spend: 31_600, top_diagnoses: ["E11.9", "G47.33", "E66.01"], open_gaps: 2, suspect_hccs: ["HCC 37", "HCC 48"] },
    { id: "M1334", name: "Charles Anderson", age: 76, gender: "M", raf: 1.734, risk_tier: "high", provider: "Dr. Lisa Chen", group: "FMG St. Pete", er_visits: 3, admissions: 1, total_spend: 38_200, top_diagnoses: ["E11.22", "I48.91", "N18.3"], open_gaps: 2, suspect_hccs: ["HCC 37", "HCC 238"] },
  ],
};

export const mockSavedCohorts = [
  { id: 100, name: "Diabetic 65+ with 2+ ER Visits", filters: { age_min: 65, diagnoses_include: ["E11"], er_visits_min: 2 }, created_at: "2026-01-15", member_count: 8, last_run: "2026-03-24", trend_sparkline: [6, 7, 7, 8, 8, 8] },
  { id: 101, name: "High-Risk CHF Patients", filters: { risk_tier: "high", diagnoses_include: ["I50"] }, created_at: "2026-02-01", member_count: 42, last_run: "2026-03-24", trend_sparkline: [38, 40, 41, 42, 42, 42] },
  { id: 102, name: "Rising Risk — RAF 1.0-1.5", filters: { raf_min: 1.0, raf_max: 1.5, risk_tier: "medium" }, created_at: "2026-02-10", member_count: 312, last_run: "2026-03-24", trend_sparkline: [290, 298, 305, 308, 310, 312] },
  { id: 103, name: "Uncontrolled Diabetes — Open Gaps", filters: { diagnoses_include: ["E11"], care_gaps: ["CDC-HbA1c"] }, created_at: "2026-02-20", member_count: 127, last_run: "2026-03-24", trend_sparkline: [142, 138, 134, 131, 129, 127] },
];

export const mockCohortTrends = {
  cohort_id: 100,
  months: [
    { month: "2025-10", member_count: 6, avg_raf: 1.712, total_spend: 178_400, avg_spend: 29_733, gap_closure_rate: 42.1 },
    { month: "2025-11", member_count: 7, avg_raf: 1.734, total_spend: 201_200, avg_spend: 28_743, gap_closure_rate: 45.8 },
    { month: "2025-12", member_count: 7, avg_raf: 1.756, total_spend: 215_800, avg_spend: 30_829, gap_closure_rate: 48.3 },
    { month: "2026-01", member_count: 8, avg_raf: 1.789, total_spend: 242_100, avg_spend: 30_263, gap_closure_rate: 51.2 },
    { month: "2026-02", member_count: 8, avg_raf: 1.821, total_spend: 268_300, avg_spend: 33_538, gap_closure_rate: 55.6 },
    { month: "2026-03", member_count: 8, avg_raf: 1.834, total_spend: 316_500, avg_spend: 39_563, gap_closure_rate: 58.9 },
  ],
};

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


// ---------------------------------------------------------------------------
// Predictive Risk Scoring -- Hospitalization Risk
// ---------------------------------------------------------------------------

export const mockHospitalizationRisk = [
  { member_id: 1001, member_name: "Margaret Chen", age: 84, risk_score: 92.3, risk_level: "high", risk_factors: ["3 ER visits in 90 days", "2 inpatient admissions in 12 months", "5 active chronic conditions", "Polypharmacy (14 medications)", "Recent SNF discharge", "High RAF score (2.84)"], pcp: "Dr. Sarah Patel", raf_score: 2.84, last_admission_date: "2026-03-02", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1002, member_name: "Robert Williams", age: 79, risk_score: 88.7, risk_level: "high", risk_factors: ["2 ER visits in 90 days", "3 inpatient admissions in 12 months", "4 active chronic conditions", "Polypharmacy (11 medications)", "High RAF score (2.61)"], pcp: "Dr. James Rivera", raf_score: 2.61, last_admission_date: "2026-02-18", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1003, member_name: "Dorothy Johnson", age: 87, risk_score: 85.1, risk_level: "high", risk_factors: ["1 ER visit in 90 days", "2 inpatient admissions in 12 months", "6 active chronic conditions", "Recent SNF discharge", "Advanced age (87)", "High RAF score (3.12)"], pcp: "Dr. Lisa Chen", raf_score: 3.12, last_admission_date: "2026-02-25", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1004, member_name: "James Anderson", age: 76, risk_score: 82.4, risk_level: "high", risk_factors: ["4 ER visits in 90 days", "1 inpatient admission in 12 months", "3 active chronic conditions", "Polypharmacy (9 medications)", "3 open care gaps"], pcp: "Dr. Michael Torres", raf_score: 1.98, last_admission_date: "2026-01-14", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1005, member_name: "Patricia Brown", age: 82, risk_score: 79.8, risk_level: "high", risk_factors: ["2 ER visits in 90 days", "2 inpatient admissions in 12 months", "4 active chronic conditions", "Polypharmacy (12 medications)", "Advanced age (82)"], pcp: "Dr. Angela Brooks", raf_score: 2.45, last_admission_date: "2026-02-08", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1006, member_name: "Thomas Davis", age: 73, risk_score: 77.2, risk_level: "high", risk_factors: ["3 ER visits in 90 days", "1 inpatient admission in 12 months", "5 active chronic conditions", "Recent SNF discharge"], pcp: "Dr. Thomas Lee", raf_score: 2.15, last_admission_date: "2026-03-10", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1007, member_name: "Helen Martinez", age: 80, risk_score: 74.6, risk_level: "high", risk_factors: ["1 ER visit in 90 days", "2 inpatient admissions in 12 months", "4 active chronic conditions", "Polypharmacy (10 medications)", "Advanced age (80)"], pcp: "Dr. Karen Murphy", raf_score: 2.33, last_admission_date: "2026-01-22", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1008, member_name: "Richard Garcia", age: 71, risk_score: 71.3, risk_level: "high", risk_factors: ["2 ER visits in 90 days", "1 inpatient admission in 12 months", "3 active chronic conditions", "Polypharmacy (8 medications)", "4 open care gaps"], pcp: "Dr. Robert Kim", raf_score: 1.87, last_admission_date: "2026-02-14", recommended_intervention: "Schedule urgent care management outreach within 48 hours", all_interventions: ["Schedule urgent care management outreach within 48 hours", "Initiate transitional care management (TCM) protocol", "Assign dedicated care coordinator"] },
  { member_id: 1009, member_name: "Barbara Wilson", age: 78, risk_score: 68.5, risk_level: "medium", risk_factors: ["1 ER visit in 90 days", "1 inpatient admission in 12 months", "5 active chronic conditions", "Polypharmacy (11 medications)"], pcp: "Dr. Sarah Patel", raf_score: 2.21, last_admission_date: "2025-12-28", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1010, member_name: "Charles Moore", age: 75, risk_score: 65.2, risk_level: "medium", risk_factors: ["2 ER visits in 90 days", "3 active chronic conditions", "Polypharmacy (9 medications)", "3 open care gaps"], pcp: "Dr. James Rivera", raf_score: 1.76, last_admission_date: "2025-11-15", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1011, member_name: "Susan Taylor", age: 81, risk_score: 63.8, risk_level: "medium", risk_factors: ["1 inpatient admission in 12 months", "4 active chronic conditions", "Advanced age (81)", "High RAF score (2.08)"], pcp: "Dr. Lisa Chen", raf_score: 2.08, last_admission_date: "2025-10-20", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1012, member_name: "Joseph Jackson", age: 69, risk_score: 61.4, risk_level: "medium", risk_factors: ["1 ER visit in 90 days", "1 inpatient admission in 12 months", "3 active chronic conditions", "Polypharmacy (10 medications)"], pcp: "Dr. Michael Torres", raf_score: 1.65, last_admission_date: "2025-12-05", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1013, member_name: "Mary White", age: 77, risk_score: 58.9, risk_level: "medium", risk_factors: ["2 ER visits in 90 days", "4 active chronic conditions", "2 open care gaps"], pcp: "Dr. Angela Brooks", raf_score: 1.92, last_admission_date: null, recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1014, member_name: "David Harris", age: 74, risk_score: 56.3, risk_level: "medium", risk_factors: ["1 ER visit in 90 days", "3 active chronic conditions", "Polypharmacy (8 medications)", "3 open care gaps"], pcp: "Dr. David Wilson", raf_score: 1.54, last_admission_date: null, recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1015, member_name: "Linda Clark", age: 83, risk_score: 54.7, risk_level: "medium", risk_factors: ["1 inpatient admission in 12 months", "3 active chronic conditions", "Advanced age (83)"], pcp: "Dr. Thomas Lee", raf_score: 1.88, last_admission_date: "2025-09-18", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1016, member_name: "Michael Lewis", age: 72, risk_score: 52.1, risk_level: "medium", risk_factors: ["1 ER visit in 90 days", "1 inpatient admission in 12 months", "Polypharmacy (9 medications)"], pcp: "Dr. Karen Murphy", raf_score: 1.42, last_admission_date: "2025-11-30", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1017, member_name: "Elizabeth Robinson", age: 68, risk_score: 49.8, risk_level: "medium", risk_factors: ["2 ER visits in 90 days", "3 active chronic conditions", "2 open care gaps"], pcp: "Dr. Robert Kim", raf_score: 1.38, last_admission_date: null, recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1018, member_name: "William Walker", age: 76, risk_score: 47.3, risk_level: "medium", risk_factors: ["1 inpatient admission in 12 months", "4 active chronic conditions"], pcp: "Dr. Jennifer Adams", raf_score: 1.71, last_admission_date: "2025-08-14", recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1019, member_name: "Nancy Hall", age: 70, risk_score: 44.6, risk_level: "medium", risk_factors: ["1 ER visit in 90 days", "Polypharmacy (8 medications)", "3 open care gaps"], pcp: "Dr. Sarah Patel", raf_score: 1.29, last_admission_date: null, recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1020, member_name: "George Allen", age: 85, risk_score: 42.1, risk_level: "medium", risk_factors: ["3 active chronic conditions", "Advanced age (85)", "High RAF score (2.14)"], pcp: "Dr. James Rivera", raf_score: 2.14, last_admission_date: null, recommended_intervention: "Schedule PCP follow-up within 2 weeks", all_interventions: ["Schedule PCP follow-up within 2 weeks", "Enroll in chronic care management program", "Review medication reconciliation"] },
  { member_id: 1021, member_name: "Karen Young", age: 67, risk_score: 38.4, risk_level: "low", risk_factors: ["1 ER visit in 90 days", "2 active chronic conditions", "2 open care gaps"], pcp: "Dr. Lisa Chen", raf_score: 1.18, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1022, member_name: "Steven King", age: 73, risk_score: 35.7, risk_level: "low", risk_factors: ["Polypharmacy (8 medications)", "2 open care gaps"], pcp: "Dr. Michael Torres", raf_score: 1.12, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1023, member_name: "Betty Wright", age: 71, risk_score: 33.2, risk_level: "low", risk_factors: ["1 active chronic condition", "3 open care gaps"], pcp: "Dr. Angela Brooks", raf_score: 1.05, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1024, member_name: "Kenneth Scott", age: 69, risk_score: 30.8, risk_level: "low", risk_factors: ["1 ER visit in 90 days", "2 active chronic conditions"], pcp: "Dr. Thomas Lee", raf_score: 1.08, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1025, member_name: "Sandra Green", age: 75, risk_score: 28.4, risk_level: "low", risk_factors: ["2 active chronic conditions", "Polypharmacy (8 medications)"], pcp: "Dr. Karen Murphy", raf_score: 1.15, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1026, member_name: "Paul Adams", age: 66, risk_score: 25.1, risk_level: "low", risk_factors: ["1 active chronic condition", "2 open care gaps"], pcp: "Dr. David Wilson", raf_score: 0.95, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1027, member_name: "Carol Baker", age: 72, risk_score: 22.6, risk_level: "low", risk_factors: ["Polypharmacy (8 medications)"], pcp: "Dr. Robert Kim", raf_score: 1.02, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1028, member_name: "Edward Nelson", age: 68, risk_score: 19.3, risk_level: "low", risk_factors: ["2 open care gaps"], pcp: "Dr. Jennifer Adams", raf_score: 0.88, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1029, member_name: "Ruth Carter", age: 74, risk_score: 16.8, risk_level: "low", risk_factors: ["1 active chronic condition"], pcp: "Dr. Sarah Patel", raf_score: 0.92, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
  { member_id: 1030, member_name: "Frank Mitchell", age: 70, risk_score: 14.2, risk_level: "low", risk_factors: ["1 open care gap"], pcp: "Dr. James Rivera", raf_score: 0.85, last_admission_date: null, recommended_intervention: "Continue routine care management", all_interventions: ["Continue routine care management", "Schedule annual wellness visit", "Address open care gaps at next visit"] },
];


// ---------------------------------------------------------------------------
// Predictive Risk Scoring -- Cost Projections
// ---------------------------------------------------------------------------

export const mockCostProjections = {
  projection_period: "Q2 2026",
  member_count: 4832,
  total_current_quarterly: 4120500,
  total_projected_quarterly: 4284120,
  total_change_pct: 3.97,
  categories: [
    { category: "inpatient", current_quarterly_spend: 1485000, projected_quarterly_spend: 1543350, change_pct: 3.9, confidence_low: 1358148, confidence_high: 1728552, confidence_level: 75, seasonal_factor: 0.95, claim_count: 412 },
    { category: "ed_observation", current_quarterly_spend: 673750, projected_quarterly_spend: 700700, change_pct: 4.0, confidence_low: 644644, confidence_high: 756756, confidence_level: 75, seasonal_factor: 0.97, claim_count: 1840 },
    { category: "pharmacy", current_quarterly_spend: 712750, projected_quarterly_spend: 741260, change_pct: 4.0, confidence_low: 681959, confidence_high: 800561, confidence_level: 85, seasonal_factor: 1.01, claim_count: 9200 },
    { category: "professional", current_quarterly_spend: 580000, projected_quarterly_spend: 609420, change_pct: 5.1, confidence_low: 560666, confidence_high: 658174, confidence_level: 85, seasonal_factor: 1.02, claim_count: 5400 },
    { category: "snf_postacute", current_quarterly_spend: 418000, projected_quarterly_spend: 396070, change_pct: -5.2, confidence_low: 348542, confidence_high: 443598, confidence_level: 75, seasonal_factor: 0.92, claim_count: 320 },
    { category: "home_health", current_quarterly_spend: 251000, projected_quarterly_spend: 253320, change_pct: 0.9, confidence_low: 233054, confidence_high: 273586, confidence_level: 85, seasonal_factor: 0.98, claim_count: 680 },
  ],
};


// ---------------------------------------------------------------------------
// Predictive Risk Scoring -- RAF Projections
// ---------------------------------------------------------------------------

export const mockRafProjections = {
  current_state: {
    total_lives: 4832,
    avg_raf: 1.247,
    total_raf: 6025.504,
    annual_revenue: 79537252.80,
    capture_rate: 65.2,
    open_suspects: 1847,
  },
  scenario_all_captured: {
    label: "All Open Suspects Captured",
    avg_raf: 1.312,
    total_raf: 6339.584,
    annual_revenue: 83642308.80,
    revenue_uplift: 4105056.00,
    raf_change: 0.065,
    capture_rate: 100.0,
    confidence: 65,
  },
  scenario_80_recapture: {
    label: "80% Recapture Rate Achieved",
    avg_raf: 1.282,
    total_raf: 6194.624,
    annual_revenue: 81730924.80,
    revenue_uplift: 2193672.00,
    raf_change: 0.035,
    capture_rate: 80.0,
    confidence: 80,
  },
  suspect_summary: {
    open_count: 1847,
    captured_count: 3458,
    total_suspect_raf_value: 314.08,
    total_suspect_annual_value: 3437500,
  },
};


// ---------------------------------------------------------------------------
// Scenario Modeling -- Pre-built Scenarios
// ---------------------------------------------------------------------------

export const mockPrebuiltScenarios = [
  { id: "capture_improvement", name: "Improve HCC Capture Rate", description: "Model the revenue impact of improving your HCC suspect capture rate from the current level to a target percentage.", type: "capture_improvement", icon: "trending-up", default_params: { from_rate: 65, to_rate: 80 }, category: "revenue" },
  { id: "facility_redirect", name: "Facility Redirection", description: "Calculate cost savings from redirecting patients away from high-cost facilities to preferred network facilities.", type: "facility_redirect", icon: "building", default_params: { patient_count: 50, from_facility: "High-Cost Hospital", to_facility: "Preferred Network Hospital" }, category: "cost" },
  { id: "gap_closure", name: "Care Gap Closure Campaign", description: "Estimate the Stars rating and revenue impact of closing a target number of care gaps on a specific measure.", type: "gap_closure", icon: "check-circle", default_params: { measure: "CDC-HbA1c", gaps_to_close: 100 }, category: "quality" },
  { id: "membership_change", name: "Membership Growth/Decline", description: "Project revenue impact of gaining or losing members with a specific average RAF score.", type: "membership_change", icon: "users", default_params: { member_delta: 500, avg_raf: 1.2 }, category: "revenue" },
  { id: "cost_reduction", name: "Cost Category Reduction", description: "Model the impact of reducing spend in a specific service category by a target percentage.", type: "cost_reduction", icon: "scissors", default_params: { category: "inpatient", reduction_pct: 10 }, category: "cost" },
  { id: "provider_education", name: "Provider Performance Improvement", description: "Calculate the impact if bottom-quartile providers improve their capture and gap closure rates to the network median.", type: "provider_education", icon: "graduation-cap", default_params: {}, category: "provider" },
];


// ---------------------------------------------------------------------------
// Scenario Modeling -- Default Scenario Results
// ---------------------------------------------------------------------------

export const mockScenarioResults: Record<string, unknown> = {
  capture_improvement: {
    scenario_name: "HCC Capture Rate Improvement", scenario_type: "capture_improvement",
    current_state: { capture_rate: 65.0, population_raf: 1.247, annual_revenue: 79537252.80 },
    projected_state: { capture_rate: 80.0, population_raf: 1.296, annual_revenue: 82785420.00 },
    financial_impact: { annual_revenue_change: 3248167.20, additional_raf_captured: 47.12, monthly_revenue_change: 270680.60 },
    timeline: "6-12 months to full realization",
    assumptions: ["Current capture rate: 65%", "Target capture rate: 80%", "Total suspect RAF opportunity: 314.1", "CMS base rate: $1,100/member/month"],
    confidence: 78,
  },
  facility_redirect: {
    scenario_name: "Facility Redirection", scenario_type: "facility_redirect",
    current_state: { from_facility: "Memorial Regional Medical Center", avg_cost_per_admission: 22400, redirected_patients: 50 },
    projected_state: { to_facility: "AQSoft Preferred Network Hospital", avg_cost_per_admission: 14800, cost_per_redirect_saved: 7600 },
    financial_impact: { annual_savings: 380000, monthly_savings: 31667, savings_per_patient: 7600 },
    timeline: "3-6 months for network steering",
    assumptions: ["Redirecting 50 patients annually", "Average high-cost facility charge: $22,400", "Average preferred facility charge: $14,800", "Assumes clinical equivalency between facilities"],
    confidence: 72,
  },
  gap_closure: {
    scenario_name: "Gap Closure: Diabetes HbA1c Control", scenario_type: "gap_closure",
    current_state: { measure: "CDC-HbA1c", measure_name: "Diabetes HbA1c Control", total_eligible: 892, current_open: 284, current_closed: 608, closure_rate: 68.2, stars_weight: 3 },
    projected_state: { gaps_closed: 100, new_closure_rate: 79.4, rate_improvement: 11.2, estimated_stars_impact: 0.11 },
    financial_impact: { annual_stars_revenue: 635040, per_gap_value: 6350, quality_bonus_impact: 635040 },
    timeline: "3-9 months for outreach and closure",
    assumptions: ["Closing 100 of 284 open gaps", "Stars weight: 3x", "Total eligible members: 892", "Stars revenue estimate based on $40/member/star weight"],
    confidence: 75,
  },
  membership_change: {
    scenario_name: "Membership Growth", scenario_type: "membership_change",
    current_state: { total_lives: 4832, avg_raf: 1.247, annual_revenue: 79537252.80 },
    projected_state: { total_lives: 5332, avg_raf: 1.238, annual_revenue: 87457252.80, member_delta: 500 },
    financial_impact: { annual_revenue_change: 7920000, monthly_revenue_change: 660000, revenue_per_new_member: 15840 },
    timeline: "Immediate upon membership change",
    assumptions: ["Adding 500 members", "Average RAF of new members: 1.2", "CMS base rate: $1,100/member/month"],
    confidence: 85,
  },
  cost_reduction: {
    scenario_name: "Reduce Inpatient Spend", scenario_type: "cost_reduction",
    current_state: { category: "inpatient", category_spend: 5940000, total_spend: 15230000, pct_of_total: 39.0, claim_count: 412 },
    projected_state: { category_spend: 5346000, total_spend: 14636000, reduction_pct: 10.0 },
    financial_impact: { annual_savings: 594000, monthly_savings: 49500, mlr_impact_pct: 3.9 },
    timeline: "6-12 months for utilization management programs",
    assumptions: ["Reducing inpatient spend by 10%", "Current inpatient spend: $5,940,000", "Assumes no shift to other categories"],
    confidence: 70,
  },
  provider_education: {
    scenario_name: "Provider Education Initiative", scenario_type: "provider_education",
    current_state: { bottom_quartile_count: 6, bottom_quartile_avg_capture: 48.1, median_capture_rate: 64.8, total_panel_affected: 1262 },
    projected_state: { target_capture_rate: 64.8, additional_captures: 211, additional_raf: 31.65 },
    financial_impact: { annual_revenue_uplift: 417780, monthly_revenue_uplift: 34815, per_provider_impact: 69630 },
    timeline: "6-12 months for training and behavior change",
    assumptions: ["6 bottom-quartile providers improving to median", "Median capture rate: 64.8%", "Avg suspect RAF value: 0.150", "Total panel members affected: 1,262"],
    confidence: 68,
  },
};

// ---------------------------------------------------------------------------
// ---- ADT Census (18 currently admitted members across 5 facilities) ----
// ---------------------------------------------------------------------------

export const mockCensusSummary = {
  currently_admitted: 8,
  in_ed: 4,
  in_observation: 3,
  in_snf: 3,
  total_census: 18,
  today_admits: 5,
  today_discharges: 3,
  by_facility: [
    { facility: "Tampa General Hospital", count: 5 },
    { facility: "St. Joseph's Hospital", count: 4 },
    { facility: "Bayshore Medical Center", count: 3 },
    { facility: "Sunrise SNF & Rehab", count: 3 },
    { facility: "Memorial Hospital of Tampa", count: 3 },
  ],
  trend_7d: [
    { date: "2026-03-18", admits: 4, discharges: 3 },
    { date: "2026-03-19", admits: 6, discharges: 4 },
    { date: "2026-03-20", admits: 3, discharges: 5 },
    { date: "2026-03-21", admits: 5, discharges: 2 },
    { date: "2026-03-22", admits: 7, discharges: 6 },
    { date: "2026-03-23", admits: 4, discharges: 3 },
    { date: "2026-03-24", admits: 5, discharges: 3 },
  ],
};

export const mockCensusItems = [
  // Inpatient (8)
  { event_id: 1001, member_id: 101, patient_name: "Margaret Chen", patient_class: "inpatient", admit_date: "2026-03-17T08:30:00", los_days: 7, facility_name: "Tampa General Hospital", facility_type: "acute", attending_provider: "Dr. Sarah Patel", diagnosis_codes: ["I50.9", "E11.65", "N18.3"], estimated_daily_cost: 3200, total_accrued_cost: 22400, typical_los: 5, projected_discharge: "2026-03-22", los_status: "extended" as const, is_estimated: true },
  { event_id: 1002, member_id: 102, patient_name: "Robert Williams", patient_class: "inpatient", admit_date: "2026-03-20T14:15:00", los_days: 4, facility_name: "Tampa General Hospital", facility_type: "acute", attending_provider: "Dr. James Rivera", diagnosis_codes: ["J44.1", "J96.11"], estimated_daily_cost: 3200, total_accrued_cost: 12800, typical_los: 5, projected_discharge: "2026-03-25", los_status: "normal" as const, is_estimated: true },
  { event_id: 1003, member_id: 103, patient_name: "Dorothy Garcia", patient_class: "inpatient", admit_date: "2026-03-21T09:00:00", los_days: 3, facility_name: "St. Joseph's Hospital", facility_type: "acute", attending_provider: "Dr. Lisa Chen", diagnosis_codes: ["I25.10", "I48.0"], estimated_daily_cost: 3200, total_accrued_cost: 9600, typical_los: 5, projected_discharge: "2026-03-26", los_status: "normal" as const, is_estimated: true },
  { event_id: 1004, member_id: 104, patient_name: "James Thompson", patient_class: "inpatient", admit_date: "2026-03-22T11:30:00", los_days: 2, facility_name: "St. Joseph's Hospital", facility_type: "acute", attending_provider: "Dr. Michael Torres", diagnosis_codes: ["K80.10", "K81.0"], estimated_daily_cost: 3200, total_accrued_cost: 6400, typical_los: 3, projected_discharge: "2026-03-25", los_status: "normal" as const, is_estimated: true },
  { event_id: 1005, member_id: 105, patient_name: "Helen Martinez", patient_class: "inpatient", admit_date: "2026-03-13T07:00:00", los_days: 11, facility_name: "Tampa General Hospital", facility_type: "acute", attending_provider: "Dr. Sarah Patel", diagnosis_codes: ["S72.001A", "W01.0"], estimated_daily_cost: 3200, total_accrued_cost: 35200, typical_los: 5, projected_discharge: "2026-03-18", los_status: "critical" as const, is_estimated: true },
  { event_id: 1006, member_id: 106, patient_name: "Charles Brown", patient_class: "inpatient", admit_date: "2026-03-23T16:00:00", los_days: 1, facility_name: "Bayshore Medical Center", facility_type: "acute", attending_provider: "Dr. Angela Brooks", diagnosis_codes: ["I63.9", "I10"], estimated_daily_cost: 3200, total_accrued_cost: 3200, typical_los: 5, projected_discharge: "2026-03-28", los_status: "normal" as const, is_estimated: true },
  { event_id: 1007, member_id: 107, patient_name: "Patricia Davis", patient_class: "inpatient", admit_date: "2026-03-22T08:00:00", los_days: 2, facility_name: "Bayshore Medical Center", facility_type: "acute", attending_provider: "Dr. Thomas Lee", diagnosis_codes: ["C34.90", "J18.9"], estimated_daily_cost: 3200, total_accrued_cost: 6400, typical_los: 5, projected_discharge: "2026-03-27", los_status: "normal" as const, is_estimated: true },
  { event_id: 1008, member_id: 108, patient_name: "Richard Wilson", patient_class: "inpatient", admit_date: "2026-03-24T06:45:00", los_days: 0, facility_name: "Memorial Hospital of Tampa", facility_type: "acute", attending_provider: "Dr. Karen Murphy", diagnosis_codes: ["N17.9", "E87.1"], estimated_daily_cost: 3200, total_accrued_cost: 3200, typical_los: 4, projected_discharge: "2026-03-28", los_status: "normal" as const, is_estimated: true },
  // Emergency (4)
  { event_id: 1009, member_id: 109, patient_name: "Barbara Anderson", patient_class: "emergency", admit_date: "2026-03-24T02:15:00", los_days: 0, facility_name: "Tampa General Hospital", facility_type: "ed", attending_provider: "Dr. David Wilson", diagnosis_codes: ["R07.9", "I20.9"], estimated_daily_cost: 1800, total_accrued_cost: 1800, typical_los: 1, projected_discharge: "2026-03-24", los_status: "normal" as const, is_estimated: true },
  { event_id: 1010, member_id: 110, patient_name: "Thomas Jackson", patient_class: "emergency", admit_date: "2026-03-24T05:30:00", los_days: 0, facility_name: "St. Joseph's Hospital", facility_type: "ed", attending_provider: "Dr. Jennifer Adams", diagnosis_codes: ["J06.9", "R50.9"], estimated_daily_cost: 1800, total_accrued_cost: 1800, typical_los: 1, projected_discharge: "2026-03-24", los_status: "normal" as const, is_estimated: true },
  { event_id: 1011, member_id: 111, patient_name: "Nancy White", patient_class: "emergency", admit_date: "2026-03-24T08:00:00", los_days: 0, facility_name: "Memorial Hospital of Tampa", facility_type: "ed", attending_provider: "Dr. Robert Kim", diagnosis_codes: ["S52.501A"], estimated_daily_cost: 1800, total_accrued_cost: 1800, typical_los: 1, projected_discharge: "2026-03-24", los_status: "normal" as const, is_estimated: true },
  { event_id: 1012, member_id: 112, patient_name: "Daniel Harris", patient_class: "emergency", admit_date: "2026-03-23T22:00:00", los_days: 1, facility_name: "Tampa General Hospital", facility_type: "ed", attending_provider: "Dr. Sarah Patel", diagnosis_codes: ["E11.65", "E87.6"], estimated_daily_cost: 1800, total_accrued_cost: 1800, typical_los: 1, projected_discharge: "2026-03-24", los_status: "normal" as const, is_estimated: true },
  // Observation (3)
  { event_id: 1013, member_id: 113, patient_name: "Susan Clark", patient_class: "observation", admit_date: "2026-03-23T14:00:00", los_days: 1, facility_name: "St. Joseph's Hospital", facility_type: "acute", attending_provider: "Dr. Lisa Chen", diagnosis_codes: ["R55", "I49.9"], estimated_daily_cost: 2100, total_accrued_cost: 2100, typical_los: 2, projected_discharge: "2026-03-25", los_status: "normal" as const, is_estimated: true },
  { event_id: 1014, member_id: 114, patient_name: "Joseph Lewis", patient_class: "observation", admit_date: "2026-03-23T18:30:00", los_days: 1, facility_name: "Bayshore Medical Center", facility_type: "acute", attending_provider: "Dr. Angela Brooks", diagnosis_codes: ["R06.02", "J45.41"], estimated_daily_cost: 2100, total_accrued_cost: 2100, typical_los: 2, projected_discharge: "2026-03-25", los_status: "normal" as const, is_estimated: true },
  { event_id: 1015, member_id: 115, patient_name: "Karen Robinson", patient_class: "observation", admit_date: "2026-03-24T01:00:00", los_days: 0, facility_name: "Memorial Hospital of Tampa", facility_type: "acute", attending_provider: "Dr. Karen Murphy", diagnosis_codes: ["R42", "G43.909"], estimated_daily_cost: 2100, total_accrued_cost: 2100, typical_los: 2, projected_discharge: "2026-03-26", los_status: "normal" as const, is_estimated: true },
  // SNF (3)
  { event_id: 1016, member_id: 116, patient_name: "Edward Walker", patient_class: "snf", admit_date: "2026-03-10T10:00:00", los_days: 14, facility_name: "Sunrise SNF & Rehab", facility_type: "snf", attending_provider: "Dr. James Rivera", diagnosis_codes: ["S72.001D", "M80.08"], estimated_daily_cost: 850, total_accrued_cost: 11900, typical_los: 21, projected_discharge: "2026-03-31", los_status: "normal" as const, is_estimated: true },
  { event_id: 1017, member_id: 117, patient_name: "Betty Hall", patient_class: "snf", admit_date: "2026-03-05T09:00:00", los_days: 19, facility_name: "Sunrise SNF & Rehab", facility_type: "snf", attending_provider: "Dr. Michael Torres", diagnosis_codes: ["I63.9", "G81.90"], estimated_daily_cost: 850, total_accrued_cost: 16150, typical_los: 21, projected_discharge: "2026-03-26", los_status: "normal" as const, is_estimated: true },
  { event_id: 1018, member_id: 118, patient_name: "George Young", patient_class: "snf", admit_date: "2026-02-28T11:00:00", los_days: 24, facility_name: "Sunrise SNF & Rehab", facility_type: "snf", attending_provider: "Dr. Lisa Chen", diagnosis_codes: ["M17.11", "Z96.641"], estimated_daily_cost: 850, total_accrued_cost: 20400, typical_los: 21, projected_discharge: "2026-03-21", los_status: "extended" as const, is_estimated: true },
];

// ---------------------------------------------------------------------------
// ---- Care Alerts (12 alerts) ----
// ---------------------------------------------------------------------------

export const mockCareAlerts = [
  // Critical - Readmission (2)
  {
    id: 2001, adt_event_id: 1001, member_id: 101, alert_type: "readmission_risk", priority: "critical",
    title: "Readmission within 12 days of prior discharge",
    description: "Margaret Chen was discharged from Tampa General on 3/5 and readmitted on 3/17 with CHF exacerbation. This is her 3rd admission in 90 days.",
    recommended_action: "Immediate care manager outreach. Review medication adherence and home health support. Schedule cardiology follow-up within 48 hours.",
    assigned_to: 1, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Margaret Chen", facility_name: "Tampa General Hospital", event_type: "admit", event_timestamp: "2026-03-17T08:30:00", created_at: "2026-03-17T08:35:00",
  },
  {
    id: 2002, adt_event_id: 1005, member_id: 105, alert_type: "readmission_risk", priority: "critical",
    title: "Readmission within 8 days of prior discharge",
    description: "Helen Martinez was discharged from St. Joseph's on 3/5 after hip fracture surgery and readmitted on 3/13 with wound infection. LOS now at 11 days exceeding expected 5-day stay.",
    recommended_action: "Escalate to medical director. Review surgical site care. Coordinate with orthopedics and infectious disease.",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Helen Martinez", facility_name: "Tampa General Hospital", event_type: "admit", event_timestamp: "2026-03-13T07:00:00", created_at: "2026-03-13T07:05:00",
  },
  // High - Admission (3)
  {
    id: 2003, adt_event_id: 1006, member_id: 106, alert_type: "admission", priority: "high",
    title: "Member admitted to Bayshore Medical Center",
    description: "Charles Brown admitted with acute stroke (I63.9). High-risk member with RAF 2.41. History of hypertension and atrial fibrillation.",
    recommended_action: "Contact facility for care coordination. Ensure neurology consult. Begin discharge planning for potential SNF or home health.",
    assigned_to: 2, status: "acknowledged", resolved_at: null, resolution_notes: null,
    patient_name: "Charles Brown", facility_name: "Bayshore Medical Center", event_type: "admit", event_timestamp: "2026-03-23T16:00:00", created_at: "2026-03-23T16:05:00",
  },
  {
    id: 2004, adt_event_id: 1008, member_id: 108, alert_type: "admission", priority: "high",
    title: "Member admitted to Memorial Hospital of Tampa",
    description: "Richard Wilson admitted with acute kidney injury (N17.9) and hyponatremia (E87.1). Member has CKD stage 3 history.",
    recommended_action: "Coordinate with nephrology. Review current medications for nephrotoxicity. Monitor labs daily.",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Richard Wilson", facility_name: "Memorial Hospital of Tampa", event_type: "admit", event_timestamp: "2026-03-24T06:45:00", created_at: "2026-03-24T06:50:00",
  },
  {
    id: 2005, adt_event_id: 1009, member_id: 109, alert_type: "er_visit", priority: "high",
    title: "ER visit at Tampa General Hospital",
    description: "Barbara Anderson presented to ER with chest pain (R07.9). Possible unstable angina (I20.9). Member has cardiac history.",
    recommended_action: "Evaluate if visit was avoidable. If admitted, begin care coordination. If discharged, schedule cardiology follow-up within 72 hours.",
    assigned_to: 1, status: "in_progress", resolved_at: null, resolution_notes: null,
    patient_name: "Barbara Anderson", facility_name: "Tampa General Hospital", event_type: "ed_visit", event_timestamp: "2026-03-24T02:15:00", created_at: "2026-03-24T02:20:00",
  },
  // Medium - Discharge Planning (4)
  {
    id: 2006, adt_event_id: 1016, member_id: 116, alert_type: "snf_placement", priority: "medium",
    title: "Member discharged to SNF from Tampa General",
    description: "Edward Walker discharged to Sunrise SNF after hip fracture repair. Expected SNF stay 21 days.",
    recommended_action: "Verify Sunrise SNF is in-network. Coordinate with SNF care team. Set up weekly check-ins.",
    assigned_to: 3, status: "in_progress", resolved_at: null, resolution_notes: null,
    patient_name: "Edward Walker", facility_name: "Sunrise SNF & Rehab", event_type: "discharge", event_timestamp: "2026-03-10T10:00:00", created_at: "2026-03-10T10:05:00",
  },
  {
    id: 2007, adt_event_id: 1017, member_id: 117, alert_type: "snf_placement", priority: "medium",
    title: "Member discharged to SNF from St. Joseph's",
    description: "Betty Hall discharged to Sunrise SNF after stroke. Requires PT/OT rehab. Expected 21-day stay.",
    recommended_action: "Coordinate with SNF therapy team. Schedule 7-day and 14-day progress reviews.",
    assigned_to: 3, status: "in_progress", resolved_at: null, resolution_notes: null,
    patient_name: "Betty Hall", facility_name: "Sunrise SNF & Rehab", event_type: "discharge", event_timestamp: "2026-03-05T09:00:00", created_at: "2026-03-05T09:10:00",
  },
  {
    id: 2008, adt_event_id: 1013, member_id: 113, alert_type: "discharge_planning", priority: "medium",
    title: "Member in observation at St. Joseph's - discharge planning needed",
    description: "Susan Clark in observation for syncope. If discharged, needs cardiac workup and fall prevention plan.",
    recommended_action: "Schedule 7-day post-discharge follow-up. Arrange home safety assessment. Verify medication reconciliation.",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Susan Clark", facility_name: "St. Joseph's Hospital", event_type: "observation", event_timestamp: "2026-03-23T14:00:00", created_at: "2026-03-23T14:05:00",
  },
  {
    id: 2009, adt_event_id: 1004, member_id: 104, alert_type: "discharge_planning", priority: "medium",
    title: "Member approaching expected discharge from St. Joseph's",
    description: "James Thompson admitted for cholecystitis. Expected discharge in 1 day. Surgical follow-up needed.",
    recommended_action: "Ensure surgical follow-up scheduled. Verify home support. Arrange post-op home health if needed.",
    assigned_to: 2, status: "acknowledged", resolved_at: null, resolution_notes: null,
    patient_name: "James Thompson", facility_name: "St. Joseph's Hospital", event_type: "admit", event_timestamp: "2026-03-22T11:30:00", created_at: "2026-03-22T11:35:00",
  },
  // Low - Follow-up (3)
  {
    id: 2010, adt_event_id: 1010, member_id: 110, alert_type: "discharge_planning", priority: "low",
    title: "ER visit follow-up needed - URI symptoms",
    description: "Thomas Jackson visited ER for upper respiratory infection. Low-acuity visit likely avoidable with PCP access.",
    recommended_action: "Schedule PCP follow-up within 7 days. Evaluate barriers to primary care access.",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Thomas Jackson", facility_name: "St. Joseph's Hospital", event_type: "ed_visit", event_timestamp: "2026-03-24T05:30:00", created_at: "2026-03-24T05:35:00",
  },
  {
    id: 2011, adt_event_id: 1001, member_id: 101, alert_type: "hcc_opportunity", priority: "low",
    title: "HCC capture opportunity: 3 suspect codes",
    description: "Margaret Chen admission includes I50.9 (Heart Failure), E11.65 (Diabetes with Complications), N18.3 (CKD Stage 3). Verify coding specificity.",
    recommended_action: "Review encounter documentation for HCC coding specificity. Ensure conditions are captured at the appropriate severity level.",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Margaret Chen", facility_name: "Tampa General Hospital", event_type: "admit", event_timestamp: "2026-03-17T08:30:00", created_at: "2026-03-17T08:40:00",
  },
  {
    id: 2012, adt_event_id: 1007, member_id: 107, alert_type: "hcc_opportunity", priority: "low",
    title: "HCC capture opportunity: 1 suspect code",
    description: "Patricia Davis admission includes C34.90 (Lung Cancer). Verify staging and specificity for HCC mapping.",
    recommended_action: "Review oncology documentation for staging details. Ensure specific cancer code is captured (e.g., C34.11 vs C34.90).",
    assigned_to: null, status: "open", resolved_at: null, resolution_notes: null,
    patient_name: "Patricia Davis", facility_name: "Bayshore Medical Center", event_type: "admit", event_timestamp: "2026-03-22T08:00:00", created_at: "2026-03-22T08:10:00",
  },
];

// ---------------------------------------------------------------------------
// ---- ADT Sources (3 configured) ----
// ---------------------------------------------------------------------------

export const mockADTSources = [
  {
    id: 1, name: "Bamboo Health", source_type: "webhook",
    config: { webhook_url: "https://api.aqsoft.health/adt/webhook", webhook_secret: "bh-***-***" },
    is_active: true, last_sync: "2026-03-24T09:15:00", events_received: 1847,
  },
  {
    id: 2, name: "Humana SFTP", source_type: "sftp",
    config: { host: "sftp.humana.com", port: "22", username: "aqsoft_adt", directory: "/outbound/adt/", schedule: "*/15 * * * *" },
    is_active: true, last_sync: "2026-03-24T08:45:00", events_received: 3214,
  },
  {
    id: 3, name: "Availity API", source_type: "rest_api",
    config: { endpoint_url: "https://api.availity.com/v1/adt", api_key: "av-***-***" },
    is_active: false, last_sync: "2026-03-18T14:30:00", events_received: 412,
  },
];

// ---------------------------------------------------------------------------
// ---- Recent ADT Events (25 from last 48 hours) ----
// ---------------------------------------------------------------------------

export const mockRecentADTEvents = [
  { id: 3001, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-24T06:45:00", patient_name: "Richard Wilson", patient_class: "inpatient", facility_name: "Memorial Hospital of Tampa", diagnosis_codes: ["N17.9", "E87.1"], is_processed: true, member_id: 108, match_confidence: 100 },
  { id: 3002, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-24T08:00:00", patient_name: "Nancy White", patient_class: "emergency", facility_name: "Memorial Hospital of Tampa", diagnosis_codes: ["S52.501A"], is_processed: true, member_id: 111, match_confidence: 90 },
  { id: 3003, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-24T05:30:00", patient_name: "Thomas Jackson", patient_class: "emergency", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["J06.9", "R50.9"], is_processed: true, member_id: 110, match_confidence: 100 },
  { id: 3004, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-24T02:15:00", patient_name: "Barbara Anderson", patient_class: "emergency", facility_name: "Tampa General Hospital", diagnosis_codes: ["R07.9", "I20.9"], is_processed: true, member_id: 109, match_confidence: 100 },
  { id: 3005, source_id: 2, source_name: "Humana SFTP", event_type: "observation", event_timestamp: "2026-03-24T01:00:00", patient_name: "Karen Robinson", patient_class: "observation", facility_name: "Memorial Hospital of Tampa", diagnosis_codes: ["R42", "G43.909"], is_processed: true, member_id: 115, match_confidence: 90 },
  { id: 3006, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-23T16:00:00", patient_name: "Charles Brown", patient_class: "inpatient", facility_name: "Bayshore Medical Center", diagnosis_codes: ["I63.9", "I10"], is_processed: true, member_id: 106, match_confidence: 100 },
  { id: 3007, source_id: 1, source_name: "Bamboo Health", event_type: "observation", event_timestamp: "2026-03-23T18:30:00", patient_name: "Joseph Lewis", patient_class: "observation", facility_name: "Bayshore Medical Center", diagnosis_codes: ["R06.02", "J45.41"], is_processed: true, member_id: 114, match_confidence: 100 },
  { id: 3008, source_id: 2, source_name: "Humana SFTP", event_type: "observation", event_timestamp: "2026-03-23T14:00:00", patient_name: "Susan Clark", patient_class: "observation", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["R55", "I49.9"], is_processed: true, member_id: 113, match_confidence: 90 },
  { id: 3009, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-23T22:00:00", patient_name: "Daniel Harris", patient_class: "emergency", facility_name: "Tampa General Hospital", diagnosis_codes: ["E11.65", "E87.6"], is_processed: true, member_id: 112, match_confidence: 100 },
  { id: 3010, source_id: 1, source_name: "Bamboo Health", event_type: "discharge", event_timestamp: "2026-03-23T11:00:00", patient_name: "Alice Foster", patient_class: "inpatient", facility_name: "Tampa General Hospital", diagnosis_codes: ["J18.9"], is_processed: true, member_id: 120, match_confidence: 100 },
  { id: 3011, source_id: 2, source_name: "Humana SFTP", event_type: "discharge", event_timestamp: "2026-03-23T09:00:00", patient_name: "Frank Butler", patient_class: "inpatient", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["I21.09"], is_processed: true, member_id: 121, match_confidence: 90 },
  { id: 3012, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-22T11:30:00", patient_name: "James Thompson", patient_class: "inpatient", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["K80.10", "K81.0"], is_processed: true, member_id: 104, match_confidence: 100 },
  { id: 3013, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-22T08:00:00", patient_name: "Patricia Davis", patient_class: "inpatient", facility_name: "Bayshore Medical Center", diagnosis_codes: ["C34.90", "J18.9"], is_processed: true, member_id: 107, match_confidence: 100 },
  { id: 3014, source_id: 2, source_name: "Humana SFTP", event_type: "discharge", event_timestamp: "2026-03-22T14:00:00", patient_name: "Maria Gonzalez", patient_class: "inpatient", facility_name: "Tampa General Hospital", diagnosis_codes: ["E11.65", "E66.01"], is_processed: true, member_id: 122, match_confidence: 90 },
  { id: 3015, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-22T19:00:00", patient_name: "Kevin Park", patient_class: "emergency", facility_name: "Memorial Hospital of Tampa", diagnosis_codes: ["T78.2XXA"], is_processed: true, member_id: 123, match_confidence: 100 },
  { id: 3016, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-21T09:00:00", patient_name: "Dorothy Garcia", patient_class: "inpatient", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["I25.10", "I48.0"], is_processed: true, member_id: 103, match_confidence: 100 },
  { id: 3017, source_id: 2, source_name: "Humana SFTP", event_type: "discharge", event_timestamp: "2026-03-21T16:00:00", patient_name: "William Ross", patient_class: "emergency", facility_name: "Tampa General Hospital", diagnosis_codes: ["R10.9"], is_processed: true, member_id: 124, match_confidence: 90 },
  { id: 3018, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-20T14:15:00", patient_name: "Robert Williams", patient_class: "inpatient", facility_name: "Tampa General Hospital", diagnosis_codes: ["J44.1", "J96.11"], is_processed: true, member_id: 102, match_confidence: 100 },
  { id: 3019, source_id: 1, source_name: "Bamboo Health", event_type: "ed_visit", event_timestamp: "2026-03-20T23:00:00", patient_name: "Sandra Mitchell", patient_class: "emergency", facility_name: "Bayshore Medical Center", diagnosis_codes: ["N39.0"], is_processed: true, member_id: 125, match_confidence: 100 },
  { id: 3020, source_id: 2, source_name: "Humana SFTP", event_type: "discharge", event_timestamp: "2026-03-20T10:00:00", patient_name: "Ruth Phillips", patient_class: "snf", facility_name: "Sunrise SNF & Rehab", diagnosis_codes: ["M80.08", "W19.XXXA"], is_processed: true, member_id: 126, match_confidence: 90 },
  { id: 3021, source_id: 1, source_name: "Bamboo Health", event_type: "transfer", event_timestamp: "2026-03-19T12:00:00", patient_name: "Larry Campbell", patient_class: "inpatient", facility_name: "Tampa General Hospital", diagnosis_codes: ["I50.23", "I48.91"], is_processed: true, member_id: 127, match_confidence: 100 },
  { id: 3022, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-19T08:00:00", patient_name: "Judith Reed", patient_class: "inpatient", facility_name: "St. Joseph's Hospital", diagnosis_codes: ["K92.0", "K25.4"], is_processed: true, member_id: 128, match_confidence: 100 },
  { id: 3023, source_id: 2, source_name: "Humana SFTP", event_type: "ed_visit", event_timestamp: "2026-03-19T20:00:00", patient_name: "Carl Morris", patient_class: "emergency", facility_name: "Memorial Hospital of Tampa", diagnosis_codes: ["R51.9"], is_processed: true, member_id: null, match_confidence: null },
  { id: 3024, source_id: 1, source_name: "Bamboo Health", event_type: "discharge", event_timestamp: "2026-03-18T15:00:00", patient_name: "Janet Cook", patient_class: "inpatient", facility_name: "Tampa General Hospital", diagnosis_codes: ["N18.4", "I12.9"], is_processed: true, member_id: 129, match_confidence: 100 },
  { id: 3025, source_id: 1, source_name: "Bamboo Health", event_type: "admit", event_timestamp: "2026-03-18T07:30:00", patient_name: "Sharon Peterson", patient_class: "inpatient", facility_name: "Bayshore Medical Center", diagnosis_codes: ["G20", "G40.909"], is_processed: true, member_id: 130, match_confidence: 100 },
];

// ---------------------------------------------------------------------------
// ---- Global Filter Options ----
// ---------------------------------------------------------------------------

export const mockFilterOptions = {
  groups: [
    { id: 1, name: "ISG Tampa" },
    { id: 2, name: "FMG St. Petersburg" },
    { id: 3, name: "ISG Brandon" },
    { id: 4, name: "FMG Clearwater" },
    { id: 5, name: "TPSG Downtown" },
  ],
  providers: [
    { id: 1, name: "Dr. Sarah Patel", group_id: 1 },
    { id: 2, name: "Dr. James Rivera", group_id: 1 },
    { id: 3, name: "Dr. Lisa Chen", group_id: 4 },
    { id: 4, name: "Dr. Michael Torres", group_id: 1 },
    { id: 5, name: "Dr. Angela Brooks", group_id: 1 },
    { id: 6, name: "Dr. Thomas Lee", group_id: 2 },
    { id: 7, name: "Dr. Karen Murphy", group_id: 3 },
    { id: 8, name: "Dr. Robert Kim", group_id: 3 },
    { id: 9, name: "Dr. David Wilson", group_id: 2 },
    { id: 10, name: "Dr. Jennifer Adams", group_id: 2 },
  ],
};

// ---------------------------------------------------------------------------
// ---- Member Roster / Panel Management ----
// ---------------------------------------------------------------------------

export interface MockMember {
  member_id: string;
  name: string;
  dob: string;
  pcp: string;
  pcp_id: number;
  group: string;
  group_id: number;
  current_raf: number;
  risk_tier: "low" | "rising" | "high" | "complex";
  last_visit_date: string;
  days_since_visit: number;
  suspect_count: number;
  gap_count: number;
  total_spend_12mo: number;
  plan: string;
  has_suspects: boolean;
  has_gaps: boolean;
  er_visits_12mo: number;
  admissions_12mo: number;
  snf_days_12mo: number;
}

export const mockMembers: MockMember[] = [
  { member_id: "M1001", name: "Margaret Chen", dob: "1953-08-14", pcp: "Dr. Sarah Patel", pcp_id: 1, group: "ISG Tampa", group_id: 1, current_raf: 1.847, risk_tier: "high", last_visit_date: "2026-03-10", days_since_visit: 14, suspect_count: 3, gap_count: 2, total_spend_12mo: 34200, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 2, admissions_12mo: 1, snf_days_12mo: 0 },
  { member_id: "M1002", name: "Robert Williams", dob: "1958-03-22", pcp: "Dr. James Rivera", pcp_id: 2, group: "ISG Tampa", group_id: 1, current_raf: 1.234, risk_tier: "rising", last_visit_date: "2026-01-15", days_since_visit: 68, suspect_count: 2, gap_count: 1, total_spend_12mo: 22800, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 1, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1003", name: "Dorothy Martinez", dob: "1945-11-07", pcp: "Dr. Lisa Chen", pcp_id: 3, group: "FMG Clearwater", group_id: 4, current_raf: 2.456, risk_tier: "complex", last_visit_date: "2025-12-01", days_since_visit: 113, suspect_count: 4, gap_count: 3, total_spend_12mo: 67500, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 5, admissions_12mo: 3, snf_days_12mo: 22 },
  { member_id: "M1004", name: "James Thornton", dob: "1948-06-30", pcp: "Dr. Michael Torres", pcp_id: 4, group: "ISG Tampa", group_id: 1, current_raf: 0.800, risk_tier: "low", last_visit_date: "2026-03-18", days_since_visit: 6, suspect_count: 2, gap_count: 0, total_spend_12mo: 8400, plan: "Humana Gold Plus", has_suspects: true, has_gaps: false, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1005", name: "Patricia Okafor", dob: "1942-01-15", pcp: "Dr. Angela Brooks", pcp_id: 5, group: "ISG Tampa", group_id: 1, current_raf: 1.100, risk_tier: "rising", last_visit_date: "2026-02-20", days_since_visit: 32, suspect_count: 1, gap_count: 1, total_spend_12mo: 15200, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 1, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1006", name: "Gerald Foster", dob: "1955-09-18", pcp: "Dr. James Rivera", pcp_id: 2, group: "ISG Tampa", group_id: 1, current_raf: 0.950, risk_tier: "low", last_visit_date: "2025-09-10", days_since_visit: 195, suspect_count: 3, gap_count: 2, total_spend_12mo: 12300, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 4, admissions_12mo: 1, snf_days_12mo: 0 },
  { member_id: "M1007", name: "Helen Washington", dob: "1940-04-25", pcp: "Dr. Sarah Patel", pcp_id: 1, group: "ISG Tampa", group_id: 1, current_raf: 2.891, risk_tier: "complex", last_visit_date: "2026-02-05", days_since_visit: 47, suspect_count: 2, gap_count: 4, total_spend_12mo: 89200, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 6, admissions_12mo: 3, snf_days_12mo: 35 },
  { member_id: "M1008", name: "Frank Nguyen", dob: "1952-12-03", pcp: "Dr. Robert Kim", pcp_id: 8, group: "ISG Brandon", group_id: 3, current_raf: 1.456, risk_tier: "rising", last_visit_date: "2026-01-02", days_since_visit: 81, suspect_count: 3, gap_count: 1, total_spend_12mo: 24600, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 3, admissions_12mo: 1, snf_days_12mo: 0 },
  { member_id: "M1009", name: "Barbara Johnson", dob: "1947-07-21", pcp: "Dr. Lisa Chen", pcp_id: 3, group: "FMG Clearwater", group_id: 4, current_raf: 1.678, risk_tier: "high", last_visit_date: "2026-03-01", days_since_visit: 23, suspect_count: 2, gap_count: 2, total_spend_12mo: 31400, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 2, admissions_12mo: 1, snf_days_12mo: 8 },
  { member_id: "M1010", name: "William Davis", dob: "1950-10-09", pcp: "Dr. David Wilson", pcp_id: 9, group: "FMG St. Petersburg", group_id: 2, current_raf: 1.123, risk_tier: "rising", last_visit_date: "2025-11-15", days_since_visit: 129, suspect_count: 3, gap_count: 0, total_spend_12mo: 18900, plan: "Humana Gold Plus", has_suspects: true, has_gaps: false, er_visits_12mo: 3, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1011", name: "Alice Foster", dob: "1949-05-12", pcp: "Dr. Sarah Patel", pcp_id: 1, group: "ISG Tampa", group_id: 1, current_raf: 3.214, risk_tier: "complex", last_visit_date: "2025-10-20", days_since_visit: 155, suspect_count: 5, gap_count: 3, total_spend_12mo: 112400, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 8, admissions_12mo: 4, snf_days_12mo: 45 },
  { member_id: "M1012", name: "Thomas Jackson", dob: "1960-02-28", pcp: "Dr. Thomas Lee", pcp_id: 6, group: "FMG St. Petersburg", group_id: 2, current_raf: 0.654, risk_tier: "low", last_visit_date: "2026-03-20", days_since_visit: 4, suspect_count: 0, gap_count: 1, total_spend_12mo: 4200, plan: "Humana Gold Plus", has_suspects: false, has_gaps: true, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1013", name: "Nancy White", dob: "1944-08-03", pcp: "Dr. Karen Murphy", pcp_id: 7, group: "ISG Brandon", group_id: 3, current_raf: 1.987, risk_tier: "high", last_visit_date: "2026-02-14", days_since_visit: 38, suspect_count: 3, gap_count: 2, total_spend_12mo: 42100, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 2, admissions_12mo: 2, snf_days_12mo: 14 },
  { member_id: "M1014", name: "Richard Wilson", dob: "1957-11-25", pcp: "Dr. Michael Torres", pcp_id: 4, group: "ISG Tampa", group_id: 1, current_raf: 0.789, risk_tier: "low", last_visit_date: "2026-03-15", days_since_visit: 9, suspect_count: 1, gap_count: 0, total_spend_12mo: 6800, plan: "Humana Gold Plus", has_suspects: true, has_gaps: false, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1015", name: "Sandra Mitchell", dob: "1951-06-17", pcp: "Dr. Angela Brooks", pcp_id: 5, group: "ISG Tampa", group_id: 1, current_raf: 1.345, risk_tier: "rising", last_visit_date: "2025-12-22", days_since_visit: 92, suspect_count: 2, gap_count: 3, total_spend_12mo: 19800, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 1, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1016", name: "Charles Brown", dob: "1946-03-09", pcp: "Dr. James Rivera", pcp_id: 2, group: "ISG Tampa", group_id: 1, current_raf: 2.134, risk_tier: "high", last_visit_date: "2025-08-05", days_since_visit: 231, suspect_count: 4, gap_count: 3, total_spend_12mo: 52800, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 4, admissions_12mo: 2, snf_days_12mo: 18 },
  { member_id: "M1017", name: "Karen Robinson", dob: "1953-09-14", pcp: "Dr. Lisa Chen", pcp_id: 3, group: "FMG Clearwater", group_id: 4, current_raf: 0.432, risk_tier: "low", last_visit_date: "2026-03-12", days_since_visit: 12, suspect_count: 0, gap_count: 0, total_spend_12mo: 3100, plan: "Humana Gold Plus", has_suspects: false, has_gaps: false, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1018", name: "Joseph Lewis", dob: "1959-01-22", pcp: "Dr. Robert Kim", pcp_id: 8, group: "ISG Brandon", group_id: 3, current_raf: 1.567, risk_tier: "high", last_visit_date: "2026-01-28", days_since_visit: 55, suspect_count: 2, gap_count: 1, total_spend_12mo: 28300, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 1, admissions_12mo: 1, snf_days_12mo: 5 },
  { member_id: "M1019", name: "Susan Clark", dob: "1943-12-30", pcp: "Dr. Jennifer Adams", pcp_id: 10, group: "FMG St. Petersburg", group_id: 2, current_raf: 2.678, risk_tier: "complex", last_visit_date: "2025-07-18", days_since_visit: 249, suspect_count: 5, gap_count: 4, total_spend_12mo: 98700, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 7, admissions_12mo: 3, snf_days_12mo: 42 },
  { member_id: "M1020", name: "Daniel Harris", dob: "1956-04-05", pcp: "Dr. David Wilson", pcp_id: 9, group: "FMG St. Petersburg", group_id: 2, current_raf: 1.890, risk_tier: "high", last_visit_date: "2026-02-28", days_since_visit: 24, suspect_count: 3, gap_count: 1, total_spend_12mo: 36500, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 3, admissions_12mo: 2, snf_days_12mo: 10 },
  { member_id: "M1021", name: "Betty Hall", dob: "1941-07-08", pcp: "Dr. Sarah Patel", pcp_id: 1, group: "ISG Tampa", group_id: 1, current_raf: 3.456, risk_tier: "complex", last_visit_date: "2025-11-01", days_since_visit: 143, suspect_count: 6, gap_count: 5, total_spend_12mo: 134500, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 10, admissions_12mo: 5, snf_days_12mo: 58 },
  { member_id: "M1022", name: "Edward Walker", dob: "1948-10-19", pcp: "Dr. Thomas Lee", pcp_id: 6, group: "FMG St. Petersburg", group_id: 2, current_raf: 0.912, risk_tier: "low", last_visit_date: "2026-03-22", days_since_visit: 2, suspect_count: 1, gap_count: 0, total_spend_12mo: 7600, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: false, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1023", name: "Dorothy Garcia", dob: "1950-01-30", pcp: "Dr. Karen Murphy", pcp_id: 7, group: "ISG Brandon", group_id: 3, current_raf: 1.789, risk_tier: "high", last_visit_date: "2025-12-10", days_since_visit: 104, suspect_count: 3, gap_count: 2, total_spend_12mo: 38900, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 2, admissions_12mo: 1, snf_days_12mo: 0 },
  { member_id: "M1024", name: "Maria Gonzalez", dob: "1954-05-21", pcp: "Dr. Angela Brooks", pcp_id: 5, group: "ISG Tampa", group_id: 1, current_raf: 1.023, risk_tier: "rising", last_visit_date: "2026-03-05", days_since_visit: 19, suspect_count: 1, gap_count: 2, total_spend_12mo: 14100, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1025", name: "Kevin Park", dob: "1962-08-14", pcp: "Dr. Michael Torres", pcp_id: 4, group: "ISG Tampa", group_id: 1, current_raf: 0.567, risk_tier: "low", last_visit_date: "2026-02-10", days_since_visit: 42, suspect_count: 0, gap_count: 1, total_spend_12mo: 5200, plan: "Aetna Medicare Advantage", has_suspects: false, has_gaps: true, er_visits_12mo: 1, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1026", name: "William Ross", dob: "1947-03-17", pcp: "Dr. James Rivera", pcp_id: 2, group: "ISG Tampa", group_id: 1, current_raf: 2.345, risk_tier: "complex", last_visit_date: "2025-06-12", days_since_visit: 285, suspect_count: 4, gap_count: 3, total_spend_12mo: 78600, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 5, admissions_12mo: 2, snf_days_12mo: 20 },
  { member_id: "M1027", name: "Ruth Phillips", dob: "1939-11-03", pcp: "Dr. Jennifer Adams", pcp_id: 10, group: "FMG St. Petersburg", group_id: 2, current_raf: 4.123, risk_tier: "complex", last_visit_date: "2026-01-20", days_since_visit: 63, suspect_count: 7, gap_count: 4, total_spend_12mo: 156800, plan: "Aetna Medicare Advantage", has_suspects: true, has_gaps: true, er_visits_12mo: 12, admissions_12mo: 5, snf_days_12mo: 60 },
  { member_id: "M1028", name: "Larry Campbell", dob: "1952-07-29", pcp: "Dr. Robert Kim", pcp_id: 8, group: "ISG Brandon", group_id: 3, current_raf: 1.678, risk_tier: "high", last_visit_date: "2025-10-05", days_since_visit: 170, suspect_count: 2, gap_count: 3, total_spend_12mo: 32100, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 3, admissions_12mo: 2, snf_days_12mo: 12 },
  { member_id: "M1029", name: "Judith Reed", dob: "1945-04-11", pcp: "Dr. Lisa Chen", pcp_id: 3, group: "FMG Clearwater", group_id: 4, current_raf: 1.234, risk_tier: "rising", last_visit_date: "2026-03-19", days_since_visit: 5, suspect_count: 1, gap_count: 1, total_spend_12mo: 16700, plan: "Humana Gold Plus", has_suspects: true, has_gaps: true, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
  { member_id: "M1030", name: "Carl Morris", dob: "1958-09-06", pcp: "Dr. David Wilson", pcp_id: 9, group: "FMG St. Petersburg", group_id: 2, current_raf: 0.345, risk_tier: "low", last_visit_date: "2026-03-21", days_since_visit: 3, suspect_count: 0, gap_count: 0, total_spend_12mo: 2800, plan: "Aetna Medicare Advantage", has_suspects: false, has_gaps: false, er_visits_12mo: 0, admissions_12mo: 0, snf_days_12mo: 0 },
];

// ---------------------------------------------------------------------------
// ---- Universal Filter System ----
// ---------------------------------------------------------------------------

export interface MockFilterField {
  field: string;
  label: string;
  type: "number" | "enum" | "string" | "boolean";
  operators: string[];
  options?: string[];
}

export const mockFilterFields: Record<string, MockFilterField[]> = {
  members: [
    { field: "current_raf", label: "RAF Score", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "risk_tier", label: "Risk Tier", type: "enum", operators: ["is", "is_not", "in"], options: ["low", "rising", "high", "complex"] },
    { field: "days_since_visit", label: "Days Since Last Visit", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "er_visits_12mo", label: "ER Visits (12mo)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "admissions_12mo", label: "Admissions (12mo)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "snf_days_12mo", label: "SNF Days (12mo)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "plan", label: "Plan", type: "enum", operators: ["is", "is_not", "in"], options: ["Humana Gold Plus", "Aetna Medicare Advantage"] },
    { field: "pcp", label: "Provider (PCP)", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "group", label: "Practice Group", type: "enum", operators: ["is", "is_not", "in"], options: ["ISG Tampa", "FMG St. Petersburg", "ISG Brandon", "FMG Clearwater"] },
    { field: "suspect_count", label: "Suspect Count", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "gap_count", label: "Gap Count", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "total_spend_12mo", label: "12mo Spend ($)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "has_suspects", label: "Has Suspects", type: "boolean", operators: ["is_true", "is_false"] },
    { field: "has_gaps", label: "Has Open Gaps", type: "boolean", operators: ["is_true", "is_false"] },
  ],
  suspects: [
    { field: "raf_value", label: "RAF Value", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "suspect_type", label: "Suspect Type", type: "enum", operators: ["is", "is_not", "in"], options: ["historical", "clinical", "nlp"] },
    { field: "status", label: "Status", type: "enum", operators: ["is", "is_not", "in"], options: ["open", "accepted", "rejected", "captured"] },
    { field: "hcc_code", label: "HCC Code", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "confidence", label: "Confidence", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "days_open", label: "Days Open", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "provider", label: "Provider", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "group", label: "Practice Group", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
  ],
  expenditure: [
    { field: "service_category", label: "Service Category", type: "enum", operators: ["is", "is_not", "in"], options: ["inpatient", "ed_observation", "pharmacy", "outpatient", "professional", "snf_postacute"] },
    { field: "facility", label: "Facility", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "provider", label: "Provider", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "paid_amount", label: "Paid Amount ($)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "diagnosis", label: "Diagnosis", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "drg_code", label: "DRG Code", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
  ],
  providers: [
    { field: "capture_rate", label: "Capture Rate (%)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "recapture_rate", label: "Recapture Rate (%)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "panel_size", label: "Panel Size", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "avg_raf", label: "Avg RAF", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "panel_pmpm", label: "PMPM ($)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "gap_closure_rate", label: "Gap Closure Rate (%)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "specialty", label: "Specialty", type: "enum", operators: ["is", "is_not", "in"], options: ["Internal Medicine", "Family Medicine", "Geriatrics"] },
    { field: "tier", label: "Tier", type: "enum", operators: ["is", "is_not", "in"], options: ["green", "amber", "red"] },
  ],
  care_gaps: [
    { field: "measure", label: "Measure", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "status", label: "Status", type: "enum", operators: ["is", "is_not", "in"], options: ["open", "closed", "excluded"] },
    { field: "weight", label: "Weight", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "closure_rate", label: "Closure Rate (%)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "provider", label: "Provider", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
  ],
  census: [
    { field: "facility", label: "Facility", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "patient_class", label: "Patient Class", type: "enum", operators: ["is", "is_not", "in"], options: ["inpatient", "observation", "ed", "snf"] },
    { field: "los_days", label: "Length of Stay (Days)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "daily_cost", label: "Daily Cost ($)", type: "number", operators: [">=", "<=", "=", "!=", "between"] },
    { field: "diagnosis", label: "Diagnosis", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
    { field: "provider", label: "Provider", type: "string", operators: ["contains", "equals", "starts_with", "not_contains"] },
  ],
};

export interface MockSavedFilter {
  id: number;
  name: string;
  description: string | null;
  page_context: string;
  conditions: { logic: "AND" | "OR"; rules: { field: string; operator: string; value: any }[] };
  created_by: number;
  is_shared: boolean;
  is_system: boolean;
  use_count: number;
  last_used: string | null;
  category?: string;
  category_color?: string;
  category_soft_color?: string;
}

export const mockSavedFilters: MockSavedFilter[] = [
  // System presets — Revenue category
  {
    id: 1001, name: "High RAF Not Seen 90+", description: "Members with RAF >= 1.5 not seen in 90+ days",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "current_raf", operator: ">=", value: 1.5 }, { field: "days_since_visit", operator: ">=", value: 90 }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 142, last_used: "2026-03-24",
    category: "Revenue", category_color: "#15803d", category_soft_color: "#dcfce7",
  },
  {
    id: 1002, name: "Open Suspects", description: "Members with at least one open suspect HCC",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "has_suspects", operator: "is_true", value: true }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 198, last_used: "2026-03-24",
    category: "Revenue", category_color: "#15803d", category_soft_color: "#dcfce7",
  },
  // System presets — Quality category
  {
    id: 1003, name: "Open Gaps", description: "Members with at least one open care gap",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "has_gaps", operator: "is_true", value: true }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 167, last_used: "2026-03-23",
    category: "Quality", category_color: "#2563eb", category_soft_color: "#dbeafe",
  },
  {
    id: 1004, name: "Low RAF Likely Undercoded", description: "Members with RAF < 1.0 and open suspects",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "current_raf", operator: "<=", value: 1.0 }, { field: "has_suspects", operator: "is_true", value: true }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 89, last_used: "2026-03-22",
    category: "Quality", category_color: "#2563eb", category_soft_color: "#dbeafe",
  },
  // System presets — Care Mgmt category
  {
    id: 1005, name: "Rising Risk", description: "Members in rising risk tier",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "risk_tier", operator: "is", value: "rising" }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 74, last_used: "2026-03-21",
    category: "Care Mgmt", category_color: "#d97706", category_soft_color: "#fef3c7",
  },
  {
    id: 1006, name: "Complex Active Mgmt", description: "Members in complex risk tier",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "risk_tier", operator: "is", value: "complex" }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 56, last_used: "2026-03-20",
    category: "Care Mgmt", category_color: "#d97706", category_soft_color: "#fef3c7",
  },
  {
    id: 1007, name: "Not Seen 6+ Mo", description: "Members not seen in 180+ days",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "days_since_visit", operator: ">=", value: 180 }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 103, last_used: "2026-03-23",
    category: "Care Mgmt", category_color: "#d97706", category_soft_color: "#fef3c7",
  },
  {
    id: 1008, name: "Frequent Utilizers", description: "Members with 3+ ER visits or 2+ admissions in 12 months",
    page_context: "members",
    conditions: { logic: "OR", rules: [{ field: "er_visits_12mo", operator: ">=", value: 3 }, { field: "admissions_12mo", operator: ">=", value: 2 }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 91, last_used: "2026-03-22",
    category: "Care Mgmt", category_color: "#d97706", category_soft_color: "#fef3c7",
  },
  // System presets — Wellness
  {
    id: 1009, name: "Healthy Keep Well", description: "Low RAF, healthy members for wellness outreach",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "current_raf", operator: "<=", value: 0.5 }] },
    created_by: 0, is_shared: true, is_system: true, use_count: 42, last_used: "2026-03-19",
    category: "Wellness", category_color: "#7c3aed", category_soft_color: "#f3e8ff",
  },
  // User-created saved filters
  {
    id: 2001, name: "My CHF Patients", description: "High RAF complex patients with frequent admissions — likely CHF",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "risk_tier", operator: "is", value: "complex" }, { field: "admissions_12mo", operator: ">=", value: 2 }, { field: "current_raf", operator: ">=", value: 2.0 }] },
    created_by: 1, is_shared: false, is_system: false, use_count: 28, last_used: "2026-03-24",
  },
  {
    id: 2002, name: "FMG St. Pete High Risk", description: "High and complex risk members in FMG St. Petersburg group",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "group", operator: "is", value: "FMG St. Petersburg" }, { field: "current_raf", operator: ">=", value: 1.5 }] },
    created_by: 1, is_shared: true, is_system: false, use_count: 15, last_used: "2026-03-23",
  },
  {
    id: 2003, name: "ER Frequent + Gaps", description: "Frequent ER utilizers who also have open care gaps",
    page_context: "members",
    conditions: { logic: "AND", rules: [{ field: "er_visits_12mo", operator: ">=", value: 3 }, { field: "has_gaps", operator: "is_true", value: true }] },
    created_by: 1, is_shared: false, is_system: false, use_count: 8, last_used: "2026-03-21",
  },
];

// ---- Annotations / Notes ----

export const mockAnnotations: Record<string, Array<{
  id: number;
  entity_type: string;
  entity_id: number;
  content: string;
  note_type: string;
  author_id: number;
  author_name: string;
  requires_follow_up: boolean;
  follow_up_date: string | null;
  follow_up_completed: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}>> = {
  "member:1001": [
    {
      id: 1, entity_type: "member", entity_id: 1001,
      content: "Care plan updated for Q1 2026. Focus areas: CHF management, weight optimization, medication adherence. Coordinating with cardiology for echo follow-up. Patient engaged and willing to participate in telehealth monitoring.",
      note_type: "care_plan", author_id: 1, author_name: "Sarah Mitchell, RN",
      requires_follow_up: false, follow_up_date: null, follow_up_completed: false,
      is_pinned: true, created_at: "2026-03-20T09:15:00Z", updated_at: "2026-03-20T09:15:00Z",
    },
    {
      id: 2, entity_type: "member", entity_id: 1001,
      content: "Called patient to schedule annual wellness visit. Patient confirmed appointment for 4/2. Discussed importance of bringing medication list. Patient reports increased shortness of breath with exertion -- flagged for PCP review.",
      note_type: "call_log", author_id: 1, author_name: "Sarah Mitchell, RN",
      requires_follow_up: true, follow_up_date: "2026-04-02", follow_up_completed: false,
      is_pinned: false, created_at: "2026-03-24T14:30:00Z", updated_at: "2026-03-24T14:30:00Z",
    },
    {
      id: 3, entity_type: "member", entity_id: 1001,
      content: "Chart review: BMI 42.1 but only coded as E66.9 (unspecified obesity). Should be E66.01 (morbid obesity) given BMI >40. Albumin 2.8 suggests possible malnutrition -- recommend screening at next visit. Also noting CHF last coded in PY2024, needs recapture.",
      note_type: "clinical", author_id: 2, author_name: "Dr. James Rivera",
      requires_follow_up: true, follow_up_date: "2026-03-28", follow_up_completed: false,
      is_pinned: false, created_at: "2026-03-22T11:00:00Z", updated_at: "2026-03-22T11:00:00Z",
    },
    {
      id: 4, entity_type: "member", entity_id: 1001,
      content: "Attempted outreach via phone -- no answer. Left voicemail regarding upcoming wellness visit and open care gaps (HbA1c, breast cancer screening). Will retry in 48 hours.",
      note_type: "outreach", author_id: 3, author_name: "Maria Lopez, CMA",
      requires_follow_up: true, follow_up_date: "2026-03-26", follow_up_completed: false,
      is_pinned: false, created_at: "2026-03-24T10:00:00Z", updated_at: "2026-03-24T10:00:00Z",
    },
    {
      id: 5, entity_type: "member", entity_id: 1001,
      content: "Coordinated with Memorial Hospital discharge planning for recent ED visit (3/15). Patient presented with acute on chronic CHF exacerbation. Discharged with adjusted diuretic dose. Home health ordered for daily weight monitoring x 2 weeks.",
      note_type: "general", author_id: 4, author_name: "Tom Bradley, LCSW",
      requires_follow_up: false, follow_up_date: null, follow_up_completed: false,
      is_pinned: false, created_at: "2026-03-18T16:45:00Z", updated_at: "2026-03-18T16:45:00Z",
    },
  ],
};

// ---- Watchlist ----

export const mockWatchlistItems: Array<{
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  reason: string | null;
  watch_for: Record<string, boolean> | null;
  last_snapshot: Record<string, any> | null;
  changes_detected: Record<string, { old: any; new: any }> | null;
  last_checked: string | null;
  has_changes: boolean;
  created_at: string;
}> = [
  {
    id: 1, user_id: 1, entity_type: "member", entity_id: 1001, entity_name: "Margaret Chen",
    reason: "Complex CHF patient, multiple suspect HCCs",
    watch_for: { raf_change: true, new_admission: true, gap_closed: true },
    last_snapshot: { raf: 1.847, projected_raf: 2.312, open_suspects: 3, open_gaps: 2 },
    changes_detected: { raf: { old: 1.782, new: 1.847 }, open_gaps: { old: 3, new: 2 } },
    last_checked: "2026-03-25T06:00:00Z", has_changes: true, created_at: "2026-03-10T09:00:00Z",
  },
  {
    id: 2, user_id: 1, entity_type: "member", entity_id: 1003, entity_name: "Dorothy Martinez",
    reason: "Highest RAF in panel, 4 open suspects",
    watch_for: { raf_change: true, suspect_captured: true },
    last_snapshot: { raf: 2.456, projected_raf: 2.812, open_suspects: 4, open_gaps: 1 },
    changes_detected: null,
    last_checked: "2026-03-25T06:00:00Z", has_changes: false, created_at: "2026-03-12T14:00:00Z",
  },
  {
    id: 3, user_id: 1, entity_type: "member", entity_id: 1006, entity_name: "Gerald Foster",
    reason: "Recent admission, high uplift potential",
    watch_for: { raf_change: true, new_admission: true },
    last_snapshot: { raf: 0.950, projected_raf: 1.502, open_suspects: 3, open_gaps: 0 },
    changes_detected: { projected_raf: { old: 1.380, new: 1.502 } },
    last_checked: "2026-03-25T06:00:00Z", has_changes: true, created_at: "2026-03-15T11:00:00Z",
  },
  {
    id: 4, user_id: 1, entity_type: "provider", entity_id: 8, entity_name: "Dr. Robert Kim",
    reason: "Low capture rate, coding education scheduled",
    watch_for: { capture_rate_change: true },
    last_snapshot: { capture_rate: 42.1, recapture_rate: 38.5, panel_size: 234, gap_closure_rate: 41.2 },
    changes_detected: null,
    last_checked: "2026-03-25T06:00:00Z", has_changes: false, created_at: "2026-03-08T10:00:00Z",
  },
  {
    id: 5, user_id: 1, entity_type: "provider", entity_id: 9, entity_name: "Dr. David Wilson",
    reason: "Peer comparison with Dr. Kim",
    watch_for: { capture_rate_change: true },
    last_snapshot: { capture_rate: 45.8, recapture_rate: 42.1, panel_size: 178, gap_closure_rate: 44.5 },
    changes_detected: null,
    last_checked: "2026-03-25T06:00:00Z", has_changes: false, created_at: "2026-03-08T10:05:00Z",
  },
  {
    id: 6, user_id: 1, entity_type: "group", entity_id: 2, entity_name: "Sunrise Health Partners",
    reason: "Lowest capture rate group, improvement initiative",
    watch_for: { capture_rate_change: true, gap_closed: true },
    last_snapshot: { capture_rate: 12.4, panel_size: 412, gap_closure_rate: 38.9 },
    changes_detected: null,
    last_checked: "2026-03-25T06:00:00Z", has_changes: false, created_at: "2026-03-05T09:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Report Templates & Generated Reports
// ---------------------------------------------------------------------------

export const mockReportTemplates = [
  {
    id: 1,
    name: "Monthly Plan Report",
    description: "Comprehensive monthly report for health plan partners covering RAF performance, quality metrics, expenditure trends, and provider network updates.",
    report_type: "plan_report",
    sections: [
      { type: "raf_summary", title: "Risk Adjustment Performance" },
      { type: "quality_metrics", title: "Quality & HEDIS Measures" },
      { type: "expenditure_overview", title: "Expenditure Overview" },
      { type: "hcc_capture", title: "HCC Capture Activity" },
      { type: "recommendations", title: "Recommendations" },
    ],
    schedule: "monthly",
    is_system: true,
  },
  {
    id: 2,
    name: "Quarterly Board Report",
    description: "Executive-level quarterly report for board of directors with financial summary, population health outcomes, and strategic recommendations.",
    report_type: "board_report",
    sections: [
      { type: "financial_summary", title: "Financial Summary" },
      { type: "raf_summary", title: "Risk Adjustment Performance" },
      { type: "quality_metrics", title: "Quality Metrics" },
      { type: "expenditure_overview", title: "Cost Management" },
      { type: "provider_performance", title: "Provider Network Performance" },
      { type: "care_management", title: "Care Management Operations" },
      { type: "recommendations", title: "Strategic Recommendations" },
    ],
    schedule: "quarterly",
    is_system: true,
  },
  {
    id: 3,
    name: "Provider Summary",
    description: "Provider-level performance summary with capture rates, quality scores, panel metrics, and peer benchmarks for provider meetings.",
    report_type: "provider_summary",
    sections: [
      { type: "provider_performance", title: "Provider Performance Summary" },
      { type: "hcc_capture", title: "HCC Capture Opportunities" },
      { type: "quality_metrics", title: "Quality Measure Compliance" },
      { type: "recommendations", title: "Improvement Recommendations" },
    ],
    schedule: "monthly",
    is_system: true,
  },
  {
    id: 4,
    name: "RADV Audit Package",
    description: "Regulatory audit documentation package with risk adjustment data validation, coding accuracy metrics, and compliance attestations.",
    report_type: "regulatory",
    sections: [
      { type: "raf_summary", title: "Risk Adjustment Data Validation" },
      { type: "hcc_capture", title: "HCC Documentation & Capture" },
      { type: "provider_performance", title: "Provider Coding Accuracy" },
      { type: "quality_metrics", title: "Quality Compliance" },
    ],
    schedule: "on_demand",
    is_system: true,
  },
];

export const mockGeneratedReports = [
  {
    id: 1,
    template_id: 2,
    title: "Quarterly Board Report - Q1 2026",
    period: "Q1 2026",
    status: "ready" as const,
    content: {
      sections: [
        {
          type: "financial_summary",
          title: "Financial Summary",
          data: {
            total_revenue: 17240000,
            total_expenses: 14520000,
            surplus: 2720000,
            mlr: 0.842,
            pmpm_revenue: 1189,
            pmpm_expense: 1002,
          },
          narrative: "The MSO delivered strong financial performance in Q1 2026, generating $17.24M in total revenue against $14.52M in expenses, yielding a surplus of $2.72M. The medical loss ratio of 84.2% represents a 1.4 percentage point improvement over Q4 2025, driven primarily by reduced inpatient utilization and successful care management interventions. Revenue per-member-per-month increased 4.2% to $1,189, reflecting improved RAF capture and quality bonus payments.",
        },
        {
          type: "raf_summary",
          title: "Risk Adjustment Performance",
          data: {
            total_lives: 4832,
            avg_raf: 1.247,
            projected_raf: 1.312,
            recapture_rate: 68.4,
            open_suspects: 1847,
            suspect_value: 3437500,
          },
          narrative: "The population-weighted RAF score improved to 1.247 in Q1 2026, up from 1.218 in Q4 2025 (+2.4%). The recapture rate of 68.4% exceeds the industry benchmark of 62% but remains below our target of 75%. There are 1,847 open suspect HCC opportunities valued at $3.44M in annualized revenue. The top opportunity categories remain Diabetes with Complications (342 members, $1.14M) and CHF/Heart Failure (189 members, $671K).",
        },
        {
          type: "quality_metrics",
          title: "Quality Metrics",
          data: {
            overall_stars: 3.8,
            measures: [
              { code: "CDC-HbA1c", name: "Diabetes HbA1c Control", closure_rate: 68.2, target: 75, stars_weight: 3 },
              { code: "BCS", name: "Breast Cancer Screening", closure_rate: 74.0, target: 80, stars_weight: 3 },
              { code: "COL", name: "Colorectal Screening", closure_rate: 71.4, target: 75, stars_weight: 3 },
              { code: "SPD", name: "Statin Adherence (Diabetes)", closure_rate: 81.2, target: 80, stars_weight: 1 },
              { code: "KED", name: "Kidney Health Evaluation", closure_rate: 41.2, target: 60, stars_weight: 1 },
            ],
          },
          narrative: "Quality performance is on track with an estimated overall Stars rating of 3.8, positioning us for the 4-star quality bonus threshold. Statin Adherence for Diabetes (81.2%) exceeds target. However, Kidney Health Evaluation remains significantly below target at 41.2% (target: 60%), requiring urgent intervention.",
        },
        {
          type: "expenditure_overview",
          title: "Cost Management",
          data: {
            total_spend: 14520000,
            pmpm: 1002,
            categories: [
              { category: "Inpatient", spend: 5940000, pmpm: 412, benchmark: 380, variance_pct: 8.4 },
              { category: "Pharmacy", spend: 2851000, pmpm: 198, benchmark: 175, variance_pct: 13.1 },
              { category: "Professional", spend: 2890000, pmpm: 200, benchmark: 195, variance_pct: 2.6 },
              { category: "ED/Observation", spend: 2695000, pmpm: 187, benchmark: 155, variance_pct: 20.6 },
            ],
          },
          narrative: "Total expenditure for Q1 2026 was $14.52M ($1,002 PMPM). ED/Observation spend continues to exceed benchmark by 20.6%, representing the largest cost management opportunity. Pharmacy spend increased 13.1% above benchmark, driven primarily by new specialty drug starts.",
        },
        {
          type: "provider_performance",
          title: "Provider Network Performance",
          data: {
            total_providers: 12,
            avg_capture_rate: 63.2,
            avg_gap_closure: 59.8,
            top_performers: [
              { name: "Dr. Sarah Patel", capture_rate: 84.2, gap_closure: 78.4 },
              { name: "Dr. James Rivera", capture_rate: 79.8, gap_closure: 72.1 },
              { name: "Dr. Lisa Chen", capture_rate: 77.1, gap_closure: 69.8 },
            ],
            bottom_performers: [
              { name: "Dr. Robert Kim", capture_rate: 42.1, gap_closure: 38.2 },
              { name: "Dr. David Wilson", capture_rate: 45.8, gap_closure: 41.5 },
            ],
          },
          narrative: "The provider network of 12 active PCPs shows significant performance variation. The top quartile averages an 80.4% capture rate, while the bottom quartile averages 44.0% -- a 36 percentage point gap representing approximately $1.2M in unrealized revenue.",
        },
      ],
    },
    ai_narrative: "The Q1 2026 Quarterly Board Report reflects solid operational progress across the AQSoft Health Platform's managed population of 4,832 members. Financial performance was strong, with a $2.72M surplus and an improving MLR of 84.2%. Risk adjustment performance continues to trend upward, with the population-weighted RAF reaching 1.247 and a $3.44M pipeline of suspect HCC opportunities.\n\nQuality metrics position us favorably for a 4-star rating, though targeted intervention is needed for Kidney Health Evaluation (41.2% vs 60% target) and Diabetes HbA1c Control (68.2% vs 75% target). Cost management remains a focus area, particularly in ED/Observation (+20.6% vs benchmark) and pharmacy (+13.1%), the latter driven by specialty drug utilization.\n\nThe most significant strategic opportunity lies in closing the provider performance gap. With a 36-point spread between top and bottom quartile capture rates, standardizing best practices from high performers could unlock an estimated $1.2M in additional annual revenue. Combined with the active suspect pipeline and care gap closure campaigns, we project potential upside of $4.6M in annualized value if Q2 initiatives execute as planned.\n\nKey recommendations for Q2 2026: (1) Launch specialty pharmacy utilization review program, (2) Expand ED diversion protocols to all network facilities, (3) Implement peer mentoring for bottom-quartile providers, (4) Intensify KED measure outreach, and (5) Deploy targeted chart review campaigns for top 5 HCC suspect categories.",
    generated_by: 1,
    file_url: null,
    created_at: "2026-03-20T14:30:00Z",
    updated_at: "2026-03-20T14:32:00Z",
  },
  {
    id: 2,
    template_id: 1,
    title: "Monthly Plan Report - February 2026",
    period: "February 2026",
    status: "ready" as const,
    content: { sections: [] },
    ai_narrative: "February 2026 operational metrics remained stable with continued improvement in RAF capture and care gap closure. Key highlights include a 2.1% month-over-month improvement in recapture rate and successful completion of the winter wellness campaign reaching 342 members.",
    generated_by: 1,
    file_url: null,
    created_at: "2026-03-05T10:00:00Z",
    updated_at: "2026-03-05T10:02:00Z",
  },
  {
    id: 3,
    template_id: 3,
    title: "Provider Summary - March 2026",
    period: "March 2026",
    status: "ready" as const,
    content: { sections: [] },
    ai_narrative: "March provider performance review shows continued progress in network-wide capture rates. Three providers exceeded 75% capture rate target this month. Provider education sessions have driven measurable improvement in bottom-quartile performers.",
    generated_by: 1,
    file_url: null,
    created_at: "2026-03-22T09:15:00Z",
    updated_at: "2026-03-22T09:17:00Z",
  },
];

// ---------------------------------------------------------------------------
// Action Items
// ---------------------------------------------------------------------------

export const mockActionItems = [
  {
    id: 1, source_type: "insight", source_id: 1,
    title: "Investigate Sunrise SNF LOS spike for CHF patients",
    description: "Anomaly scan detected Sunrise SNF averaging 22.3 days LOS for CHF patients vs 18-day benchmark. Affecting 31 admits with estimated excess spend of $186K.",
    action_type: "investigation", assigned_to: 1, assigned_to_name: "Maria Santos",
    priority: "high", status: "in_progress", due_date: "2026-04-01", completed_date: null,
    member_id: null, provider_id: null, group_id: null,
    expected_impact: "$186K annual savings from LOS reduction", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-15T10:30:00Z", updated_at: "2026-03-18T14:20:00Z",
  },
  {
    id: 2, source_type: "insight", source_id: 2,
    title: "Implement HH diversion protocol for low-acuity UTI patients",
    description: "47 UTI patients admitted to SNF who met home health eligibility criteria. Average SNF stay cost $11,800 vs estimated HH episode of $4,100.",
    action_type: "care_plan", assigned_to: 2, assigned_to_name: "James Rivera",
    priority: "high", status: "open", due_date: "2026-04-15", completed_date: null,
    member_id: null, provider_id: null, group_id: null,
    expected_impact: "$365K annual savings from SNF-to-HH diversion", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-16T09:00:00Z", updated_at: "2026-03-16T09:00:00Z",
  },
  {
    id: 3, source_type: "insight", source_id: 3,
    title: "Deploy Brookdale coding workflows to Sunrise Health Partners",
    description: "29 percentage point gap in HCC capture rates between Brookdale (41.2%) and Sunrise (12.4%) despite similar RAF distributions.",
    action_type: "coding_education", assigned_to: 3, assigned_to_name: "Lisa Chen",
    priority: "critical", status: "in_progress", due_date: "2026-03-31", completed_date: null,
    member_id: null, provider_id: null, group_id: 2,
    expected_impact: "$289K annual revenue uplift from improved capture", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-10T11:00:00Z", updated_at: "2026-03-20T16:45:00Z",
  },
  {
    id: 4, source_type: "alert", source_id: 1,
    title: "Coordinate post-discharge follow-up for Margaret Chen",
    description: "Patient admitted to Memorial General with acute exacerbation of CHF. High readmission risk (RAF 1.847). Ensure 48-hour post-discharge PCP follow-up.",
    action_type: "care_plan", assigned_to: 1, assigned_to_name: "Maria Santos",
    priority: "critical", status: "completed", due_date: "2026-03-22", completed_date: "2026-03-21",
    member_id: 1001, provider_id: 1, group_id: null,
    expected_impact: "Prevent 30-day readmission ($18K avoided cost)",
    actual_outcome: "Follow-up completed within 48 hours. Patient stable at home. No readmission at 30 days.",
    outcome_measured: true,
    resolution_notes: "Coordinated with Dr. Patel for same-day follow-up. Arranged visiting nurse for medication reconciliation. Patient enrolled in CHF telemonitoring.",
    created_at: "2026-03-18T08:00:00Z", updated_at: "2026-03-21T15:30:00Z",
  },
  {
    id: 5, source_type: "alert", source_id: 3,
    title: "Schedule diabetes education for Robert Williams post-ER visit",
    description: "Patient presented to ER with uncontrolled diabetes (A1c 9.2). Has 3 open care gaps including HbA1c control.",
    action_type: "outreach", assigned_to: 4, assigned_to_name: "Angela Brooks",
    priority: "high", status: "in_progress", due_date: "2026-03-28", completed_date: null,
    member_id: 1003, provider_id: null, group_id: null,
    expected_impact: "Close 3 care gaps, reduce ER utilization", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-19T10:15:00Z", updated_at: "2026-03-22T11:00:00Z",
  },
  {
    id: 6, source_type: "manual", source_id: null,
    title: "Review specialty pharmacy prior auth criteria for GLP-1 agonists",
    description: "Pharmacy PMPM increased 13.1% above benchmark driven by new GLP-1 starts. Review prior authorization criteria and evaluate step therapy requirements.",
    action_type: "investigation", assigned_to: 2, assigned_to_name: "James Rivera",
    priority: "medium", status: "open", due_date: "2026-04-10", completed_date: null,
    member_id: null, provider_id: null, group_id: null,
    expected_impact: "Potential $120K annual pharmacy savings", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-20T14:00:00Z", updated_at: "2026-03-20T14:00:00Z",
  },
  {
    id: 7, source_type: "manual", source_id: null,
    title: "Schedule Q2 provider education workshops",
    description: "Organize monthly coding education workshops for all network providers. Focus on HCC documentation best practices and CMS-HCC V28 model changes.",
    action_type: "coding_education", assigned_to: 3, assigned_to_name: "Lisa Chen",
    priority: "medium", status: "completed", due_date: "2026-03-25", completed_date: "2026-03-24",
    member_id: null, provider_id: null, group_id: null,
    expected_impact: "Improve network-wide capture rate by 5 percentage points",
    actual_outcome: "4 monthly sessions scheduled (April-July). All 12 providers confirmed. Guest speaker from CMS arranged for May.",
    outcome_measured: true,
    resolution_notes: "Workshops scheduled for first Tuesday of each month. Materials prepared covering V28 changes, suspect HCC documentation, and specificity coding.",
    created_at: "2026-03-12T09:00:00Z", updated_at: "2026-03-24T16:00:00Z",
  },
  {
    id: 8, source_type: "manual", source_id: null,
    title: "Expand ED diversion protocols to Clearwater facilities",
    description: "ED/Observation spend is 20.6% above benchmark. Current diversion protocols at Tampa facilities reduced ED visits by 12%. Extend to Clearwater.",
    action_type: "care_plan", assigned_to: 1, assigned_to_name: "Maria Santos",
    priority: "high", status: "open", due_date: "2026-04-30", completed_date: null,
    member_id: null, provider_id: null, group_id: null,
    expected_impact: "$200K annual savings from ED diversion", actual_outcome: null, outcome_measured: false,
    resolution_notes: null, created_at: "2026-03-21T10:00:00Z", updated_at: "2026-03-21T10:00:00Z",
  },
];

export const mockActionStats = {
  total: 8,
  open: 3,
  in_progress: 3,
  completed: 2,
  cancelled: 0,
  overdue: 0,
  completion_rate: 25.0,
};


// ---- Clinical View (Provider Mode 2) ----

export interface ClinicalSuspect {
  id: number;
  condition_name: string;
  icd10_code: string;
  hcc_code: number;
  raf_value: number;
  annual_value: number;
  evidence_summary: string;
  confidence: number;
  suspect_type: string;
  captured?: boolean;
}

export interface ClinicalConfirmedHCC {
  condition_name: string;
  icd10_code: string;
  hcc_code: number;
  raf_value: number;
}

export interface ClinicalCareGap {
  id: number;
  measure_name: string;
  measure_code: string;
  stars_weight: number;
  recommended_action: string;
  closed?: boolean;
}

export interface ClinicalInteraction {
  name: string;
  bonus_raf: number;
  codes: string;
}

export interface ClinicalNearMiss {
  name: string;
  potential_raf: number;
  missing: string;
  missing_hccs: number[];
}

export interface ClinicalMedication {
  drug_name: string;
  has_matching_dx: boolean;
  inferred_diagnosis?: string;
}

export interface ClinicalEncounter {
  date: string;
  type: string;
  facility: string;
  provider: string;
  diagnoses: string[];
  cost: number;
}

export interface ClinicalPatientContext {
  demographics: {
    id: number;
    member_id: string;
    first_name: string;
    last_name: string;
    name: string;
    age: number;
    dob: string;
    gender: string;
    insurance: string;
    pcp: string;
    room?: string;
  };
  raf: {
    demographic_raf: number;
    disease_raf: number;
    interaction_raf: number;
    total_raf: number;
    projected_raf: number;
    delta: number;
    current_annual_value: number;
    projected_annual_value: number;
  };
  suspects: ClinicalSuspect[];
  confirmed_hccs: ClinicalConfirmedHCC[];
  care_gaps: ClinicalCareGap[];
  interactions: ClinicalInteraction[];
  near_misses: ClinicalNearMiss[];
  medications: ClinicalMedication[];
  encounters: ClinicalEncounter[];
  risk: {
    tier: string;
    hospitalization_risk_pct: number;
  };
  visit_prep: string;
}

export interface ClinicalWorklistItem {
  member_id: number;
  member_external_id: string;
  name: string;
  age: number;
  gender: string;
  current_raf: number;
  projected_raf: number;
  suspect_count: number;
  gap_count: number;
  priority_score: number;
  priority_reason: string;
  risk_tier: string;
  visit_type?: string;
  time_slot?: string;
}

// Margaret Chen — the primary demo patient from design-reset
export const mockClinicalPatientMargaret: ClinicalPatientContext = {
  demographics: {
    id: 1,
    member_id: "MC-20394",
    first_name: "Margaret",
    last_name: "Chen",
    name: "Margaret Chen",
    age: 72,
    dob: "1953-08-14",
    gender: "F",
    insurance: "Humana Gold Plus",
    pcp: "Dr. Rivera",
    room: "204B",
  },
  raf: {
    demographic_raf: 0.564,
    disease_raf: 1.017,
    interaction_raf: 0.266,
    total_raf: 1.847,
    projected_raf: 2.312,
    delta: 0.465,
    current_annual_value: 20317,
    projected_annual_value: 25432,
  },
  suspects: [
    {
      id: 101,
      condition_name: "Protein-calorie malnutrition, mild",
      icd10_code: "E44.1",
      hcc_code: 21,
      raf_value: 0.455,
      annual_value: 5005,
      evidence_summary: "Albumin 3.2, BMI 20.1, weight loss 5% in 30 days per nursing assessment",
      confidence: 82,
      suspect_type: "new_suspect",
    },
    {
      id: 102,
      condition_name: "Morbid obesity",
      icd10_code: "E66.01",
      hcc_code: 22,
      raf_value: 0.250,
      annual_value: 2750,
      evidence_summary: "BMI 41.2 documented in vitals on 3/18 admission",
      confidence: 88,
      suspect_type: "new_suspect",
    },
  ],
  confirmed_hccs: [
    { condition_name: "Acute on chronic systolic heart failure", icd10_code: "I50.22", hcc_code: 226, raf_value: 0.360 },
    { condition_name: "Type 2 diabetes with hyperglycemia", icd10_code: "E11.65", hcc_code: 37, raf_value: 0.166 },
    { condition_name: "CKD Stage 3b", icd10_code: "N18.32", hcc_code: 328, raf_value: 0.127 },
    { condition_name: "Major depressive disorder, recurrent, moderate", icd10_code: "F33.1", hcc_code: 155, raf_value: 0.299 },
    { condition_name: "COPD with acute exacerbation", icd10_code: "J44.1", hcc_code: 280, raf_value: 0.319 },
  ],
  care_gaps: [
    { id: 201, measure_name: "HbA1c not drawn in CY2026", measure_code: "CDC-HbA1c", stars_weight: 3, recommended_action: "Order HbA1c today" },
    { id: 202, measure_name: "Diabetic eye exam overdue", measure_code: "CDC-Eye", stars_weight: 3, recommended_action: "Refer to ophthalmology" },
    { id: 203, measure_name: "Kidney health evaluation incomplete", measure_code: "KED", stars_weight: 1, recommended_action: "Order eGFR + uACR" },
    { id: 204, measure_name: "Depression follow-up needed", measure_code: "FMC", stars_weight: 3, recommended_action: "Schedule 7-day follow-up" },
  ],
  interactions: [
    { name: "DM + CHF", bonus_raf: 0.121, codes: "HCC 37 + HCC 226" },
    { name: "CHF + COPD", bonus_raf: 0.145, codes: "HCC 226 + HCC 280" },
  ],
  near_misses: [
    {
      name: "CHF + Diabetes + CKD",
      potential_raf: 0.177,
      missing: "HCC 326, HCC 327, HCC 328, HCC 329",
      missing_hccs: [326, 327, 328, 329],
    },
  ],
  medications: [
    { drug_name: "Insulin Glargine 30u nightly", has_matching_dx: true, inferred_diagnosis: "Type 2 DM" },
    { drug_name: "Metformin 500mg BID", has_matching_dx: true, inferred_diagnosis: "Type 2 DM" },
    { drug_name: "Lisinopril 20mg daily", has_matching_dx: true, inferred_diagnosis: "Hypertension / CKD" },
    { drug_name: "Furosemide 40mg BID", has_matching_dx: true, inferred_diagnosis: "Heart failure" },
    { drug_name: "Carvedilol 12.5mg BID", has_matching_dx: true, inferred_diagnosis: "Heart failure" },
    { drug_name: "Sertraline 100mg daily", has_matching_dx: true, inferred_diagnosis: "Depression" },
    { drug_name: "Albuterol nebulizer Q4H PRN", has_matching_dx: true, inferred_diagnosis: "COPD" },
    { drug_name: "Prednisone 40mg taper", has_matching_dx: true, inferred_diagnosis: "COPD exacerbation" },
  ],
  encounters: [
    { date: "2026-03-18", type: "inpatient", facility: "Memorial Hospital", provider: "Dr. Nguyen", diagnoses: ["I50.22", "J44.1", "E11.65"], cost: 24500 },
    { date: "2026-02-10", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["E11.65", "I50.22", "N18.32"], cost: 285 },
    { date: "2026-01-15", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["F33.1", "E11.65"], cost: 210 },
    { date: "2025-11-20", type: "ed_observation", facility: "Memorial Hospital", provider: "Dr. Singh", diagnoses: ["J44.1", "I50.22"], cost: 8400 },
    { date: "2025-09-05", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["E11.65", "I50.22", "N18.32", "F33.1", "J44.1"], cost: 310 },
  ],
  risk: {
    tier: "high",
    hospitalization_risk_pct: 22,
  },
  visit_prep: "Capturing suspected Protein-calorie malnutrition, mild (E44.1, HCC 21) adds $5,005/year. Albumin 3.2, BMI 20.1, weight loss 5% in 30 days per nursing assessment. Triple-weighted Star measures needing closure: CDC-HbA1c, CDC-Eye, FMC. These directly impact plan quality ratings. Near-miss interaction: documenting conditions in the CHF + Diabetes + CKD group would trigger an additional +0.177 RAF bonus.",
};

// Robert Kim — simpler patient
export const mockClinicalPatientRobert: ClinicalPatientContext = {
  demographics: {
    id: 2,
    member_id: "RK-10482",
    first_name: "Robert",
    last_name: "Kim",
    name: "Robert Kim",
    age: 68,
    dob: "1957-11-03",
    gender: "M",
    insurance: "Aetna MA",
    pcp: "Dr. Rivera",
  },
  raf: {
    demographic_raf: 0.489,
    disease_raf: 0.637,
    interaction_raf: 0.121,
    total_raf: 1.247,
    projected_raf: 1.549,
    delta: 0.302,
    current_annual_value: 13717,
    projected_annual_value: 17039,
  },
  suspects: [
    {
      id: 201,
      condition_name: "Type 2 diabetes with chronic complications",
      icd10_code: "E11.65",
      hcc_code: 18,
      raf_value: 0.302,
      annual_value: 3322,
      evidence_summary: "HbA1c 8.9%, on insulin + metformin, coded as E11.9 (unspecified) — upgrade to E11.65",
      confidence: 90,
      suspect_type: "specificity",
    },
  ],
  confirmed_hccs: [
    { condition_name: "Type 2 diabetes mellitus", icd10_code: "E11.9", hcc_code: 37, raf_value: 0.105 },
    { condition_name: "Congestive heart failure", icd10_code: "I50.9", hcc_code: 226, raf_value: 0.360 },
    { condition_name: "Atrial fibrillation", icd10_code: "I48.91", hcc_code: 238, raf_value: 0.299 },
  ],
  care_gaps: [
    { id: 301, measure_name: "HbA1c not drawn in CY2026", measure_code: "CDC-HbA1c", stars_weight: 3, recommended_action: "Order HbA1c" },
    { id: 302, measure_name: "INR monitoring overdue", measure_code: "ACT", stars_weight: 1, recommended_action: "Order INR panel" },
  ],
  interactions: [
    { name: "Diabetes + CHF", bonus_raf: 0.121, codes: "HCC 37 + HCC 226" },
  ],
  near_misses: [],
  medications: [
    { drug_name: "Insulin Lispro 10u TID", has_matching_dx: true },
    { drug_name: "Metformin 1000mg BID", has_matching_dx: true },
    { drug_name: "Apixaban 5mg BID", has_matching_dx: true },
    { drug_name: "Carvedilol 25mg BID", has_matching_dx: true },
    { drug_name: "Atorvastatin 40mg daily", has_matching_dx: false },
  ],
  encounters: [
    { date: "2026-03-01", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["E11.9", "I50.9", "I48.91"], cost: 275 },
    { date: "2026-01-08", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["E11.9", "I50.9"], cost: 210 },
    { date: "2025-10-14", type: "ed_observation", facility: "Clearwater Regional", provider: "Dr. Brooks", diagnoses: ["I48.91"], cost: 5200 },
  ],
  risk: { tier: "rising", hospitalization_risk_pct: 12 },
  visit_prep: "Specificity upgrade opportunity: coding diabetes as E11.65 (with chronic complications) instead of E11.9 would add $3,322/year. Patient is on insulin + metformin with HbA1c 8.9% — clinical evidence supports the upgrade. Order HbA1c for Star measure recapture.",
};

// Dorothy Santos — another simpler patient
export const mockClinicalPatientDorothy: ClinicalPatientContext = {
  demographics: {
    id: 3,
    member_id: "DS-30291",
    first_name: "Dorothy",
    last_name: "Santos",
    name: "Dorothy Santos",
    age: 81,
    dob: "1944-06-22",
    gender: "F",
    insurance: "Humana Gold Plus",
    pcp: "Dr. Rivera",
  },
  raf: {
    demographic_raf: 0.712,
    disease_raf: 1.480,
    interaction_raf: 0.190,
    total_raf: 2.382,
    projected_raf: 2.655,
    delta: 0.273,
    current_annual_value: 26202,
    projected_annual_value: 29205,
  },
  suspects: [
    {
      id: 301,
      condition_name: "Dementia without behavioral disturbance",
      icd10_code: "F03.90",
      hcc_code: 51,
      raf_value: 0.273,
      annual_value: 3003,
      evidence_summary: "BIMS 6/15, donepezil prescribed, family reports progressive memory loss over 2 years",
      confidence: 78,
      suspect_type: "med_dx_gap",
    },
  ],
  confirmed_hccs: [
    { condition_name: "CHF, chronic systolic", icd10_code: "I50.22", hcc_code: 226, raf_value: 0.360 },
    { condition_name: "Type 2 diabetes with CKD", icd10_code: "E11.22", hcc_code: 37, raf_value: 0.166 },
    { condition_name: "CKD Stage 4", icd10_code: "N18.4", hcc_code: 327, raf_value: 0.514 },
    { condition_name: "COPD", icd10_code: "J44.1", hcc_code: 280, raf_value: 0.319 },
    { condition_name: "Major depression", icd10_code: "F33.1", hcc_code: 155, raf_value: 0.309 },
  ],
  care_gaps: [
    { id: 401, measure_name: "Fall risk assessment overdue", measure_code: "FRA", stars_weight: 1, recommended_action: "Complete fall risk screening" },
  ],
  interactions: [
    { name: "CHF + Diabetes + CKD", bonus_raf: 0.190, codes: "HCC 226 + HCC 37 + HCC 327" },
  ],
  near_misses: [
    { name: "Dementia + Depression", potential_raf: 0.065, missing: "HCC 51, HCC 52", missing_hccs: [51, 52] },
  ],
  medications: [
    { drug_name: "Donepezil 10mg daily", has_matching_dx: false },
    { drug_name: "Furosemide 80mg BID", has_matching_dx: true },
    { drug_name: "Insulin Glargine 40u nightly", has_matching_dx: true },
    { drug_name: "Sertraline 100mg daily", has_matching_dx: true },
    { drug_name: "Tiotropium inhaler", has_matching_dx: true },
    { drug_name: "Lisinopril 10mg daily", has_matching_dx: true },
  ],
  encounters: [
    { date: "2026-03-10", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["I50.22", "E11.22", "N18.4", "J44.1"], cost: 320 },
    { date: "2026-01-20", type: "inpatient", facility: "Memorial Hospital", provider: "Dr. Nguyen", diagnoses: ["I50.22", "N18.4", "J44.1"], cost: 18700 },
    { date: "2025-12-01", type: "office", facility: "Rivera Medical Group", provider: "Dr. Rivera", diagnoses: ["E11.22", "F33.1"], cost: 250 },
  ],
  risk: { tier: "complex", hospitalization_risk_pct: 31 },
  visit_prep: "Med-Dx gap: Donepezil prescribed without dementia diagnosis documented. Capturing Dementia (F03.90, HCC 51) adds $3,003/year and would trigger the Dementia + Depression interaction bonus (+0.065 RAF). Complete fall risk assessment for quality measure closure.",
};

// All patient contexts indexed by member ID (numeric)
export const mockClinicalPatients: Record<number, ClinicalPatientContext> = {
  1: mockClinicalPatientMargaret,
  2: mockClinicalPatientRobert,
  3: mockClinicalPatientDorothy,
};

// Provider worklist — 6 patients sorted by priority
export const mockClinicalWorklist: ClinicalWorklistItem[] = [
  {
    member_id: 1, member_external_id: "MC-20394", name: "Margaret Chen",
    age: 72, gender: "F", current_raf: 1.847, projected_raf: 2.312,
    suspect_count: 2, gap_count: 4, priority_score: 18.6,
    priority_reason: "+0.465 RAF uplift, 2 suspects, 4 open gaps",
    risk_tier: "high", visit_type: "Follow-up", time_slot: "9:00 AM",
  },
  {
    member_id: 3, member_external_id: "DS-30291", name: "Dorothy Santos",
    age: 81, gender: "F", current_raf: 2.382, projected_raf: 2.655,
    suspect_count: 1, gap_count: 1, priority_score: 8.2,
    priority_reason: "+0.273 RAF uplift, 1 suspect, 1 open gap",
    risk_tier: "complex", visit_type: "Annual Wellness", time_slot: "10:00 AM",
  },
  {
    member_id: 2, member_external_id: "RK-10482", name: "Robert Kim",
    age: 68, gender: "M", current_raf: 1.247, projected_raf: 1.549,
    suspect_count: 1, gap_count: 2, priority_score: 6.4,
    priority_reason: "+0.302 RAF uplift, 1 suspect, 2 open gaps",
    risk_tier: "rising", visit_type: "Follow-up", time_slot: "11:00 AM",
  },
  {
    member_id: 4, member_external_id: "JL-44521", name: "James Lee",
    age: 65, gender: "M", current_raf: 0.892, projected_raf: 1.023,
    suspect_count: 1, gap_count: 1, priority_score: 3.1,
    priority_reason: "1 suspect, 1 open gap",
    risk_tier: "rising", visit_type: "New Patient", time_slot: "1:00 PM",
  },
  {
    member_id: 5, member_external_id: "PW-55893", name: "Patricia Wong",
    age: 77, gender: "F", current_raf: 1.102, projected_raf: 1.102,
    suspect_count: 0, gap_count: 2, priority_score: 1.8,
    priority_reason: "2 open gaps",
    risk_tier: "rising", visit_type: "Follow-up", time_slot: "2:00 PM",
  },
  {
    member_id: 6, member_external_id: "TJ-66104", name: "Thomas Jackson",
    age: 70, gender: "M", current_raf: 0.654, projected_raf: 0.654,
    suspect_count: 0, gap_count: 0, priority_score: 0.5,
    priority_reason: "Routine visit",
    risk_tier: "low", visit_type: "Annual Wellness", time_slot: "3:00 PM",
  },
];


// ---------------------------------------------------------------------------
// Data Quality & Governance
// ---------------------------------------------------------------------------

export const mockQualityReport = {
  id: 1,
  upload_job_id: 12,
  overall_score: 87,
  total_rows: 4832,
  valid_rows: 4614,
  quarantined_rows: 42,
  warning_rows: 176,
  summary: "Good overall data quality. 3 checks require attention: 42 records quarantined due to invalid ICD-10 codes and duplicate members. Financial sanity check flagged 2 high-value claims for review.",
  created_at: "2026-03-22T14:30:00Z",
  checks: [
    { name: "Completeness", status: "passed", details: "98.7% of key fields populated (4832 members)", severity: "low" },
    { name: "Referential Integrity", status: "passed", details: "0 claims reference non-existent members", severity: "low" },
    { name: "Duplicate Detection", status: "warned", details: "14 potential duplicate claim groups detected", severity: "medium" },
    { name: "Diagnosis Distribution", status: "passed", details: "No single diagnosis exceeds 20% of claims", severity: "low" },
    { name: "Date Range", status: "passed", details: "Range: 2024-01-15 to 2026-03-20. 0 future dates, 0 pre-2020 dates.", severity: "low" },
    { name: "Financial Sanity", status: "warned", details: "2 claims exceed $500K (flagged for review)", severity: "high" },
    { name: "NPI Validation", status: "passed", details: "All 287 provider NPIs pass Luhn check", severity: "low" },
    { name: "ICD-10 Format", status: "failed", details: "23 claims have invalid ICD-10 code format", severity: "high" },
    { name: "CPT Validation", status: "passed", details: "All CPT codes are 5-digit format", severity: "low" },
    { name: "Member ID Uniqueness", status: "passed", details: "All 4832 member IDs are unique", severity: "low" },
    { name: "Gender Normalization", status: "passed", details: "All gender values normalized to M/F", severity: "low" },
    { name: "Date of Birth Range", status: "passed", details: "All DOBs within 1920-2010 range", severity: "low" },
  ],
};

export const mockQualityReports = [
  mockQualityReport,
  {
    id: 2, upload_job_id: 11, overall_score: 92, total_rows: 3200, valid_rows: 3168,
    quarantined_rows: 12, warning_rows: 20,
    summary: "Excellent data quality on Humana Q4 roster refresh.",
    created_at: "2026-03-15T10:00:00Z",
    checks: mockQualityReport.checks.map(c => ({ ...c, status: c.status === "failed" ? "warned" : "passed" })),
  },
  {
    id: 3, upload_job_id: 10, overall_score: 74, total_rows: 8400, valid_rows: 7560,
    quarantined_rows: 340, warning_rows: 500,
    summary: "Significant quality issues in Aetna claims file. High duplicate rate and missing NPIs.",
    created_at: "2026-03-08T08:15:00Z",
    checks: mockQualityReport.checks.map(c => ({ ...c, status: c.name === "Duplicate Detection" ? "failed" : c.status })),
  },
  {
    id: 4, upload_job_id: 9, overall_score: 95, total_rows: 2100, valid_rows: 2090,
    quarantined_rows: 5, warning_rows: 5,
    summary: "Near-perfect pharmacy data from CVS Caremark feed.",
    created_at: "2026-03-01T16:45:00Z",
    checks: mockQualityReport.checks.map(c => ({ ...c, status: "passed" })),
  },
];

export const mockQualityTrend = [
  { date: "2025-10-01", score: 78 },
  { date: "2025-11-01", score: 81 },
  { date: "2025-12-01", score: 79 },
  { date: "2026-01-01", score: 84 },
  { date: "2026-02-01", score: 88 },
  { date: "2026-03-01", score: 95 },
  { date: "2026-03-08", score: 74 },
  { date: "2026-03-15", score: 92 },
  { date: "2026-03-22", score: 87 },
];

export const mockQuarantinedRecords = [
  {
    id: 1, upload_job_id: 12, source_type: "claims", row_number: 847, status: "pending",
    raw_data: { member_id: "MC-20394", service_date: "2026-02-14", diagnosis_code: "Z999", cpt_code: "99213", provider_npi: "1234567890", billed_amount: 185 },
    errors: ["diagnosis_code: invalid ICD-10 format 'Z999' (expected letter + 2-7 chars)"],
    warnings: [],
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: 2, upload_job_id: 12, source_type: "claims", row_number: 1203, status: "pending",
    raw_data: { member_id: "RK-10482", service_date: "2026-01-20", diagnosis_code: "INVALID", cpt_code: "99214", provider_npi: "9876543210", billed_amount: 245 },
    errors: ["diagnosis_code: invalid ICD-10 format 'INVALID' (expected letter + 2-7 chars)"],
    warnings: [],
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: 3, upload_job_id: 12, source_type: "claims", row_number: 2100, status: "pending",
    raw_data: { member_id: "DS-30291", service_date: "2026-03-01", diagnosis_code: "E11", cpt_code: "99215", provider_npi: "5551234567", billed_amount: 310, paid_amount: -50 },
    errors: ["diagnosis_code: invalid ICD-10 format 'E11' needs decimal portion", "paid_amount: negative amount -50"],
    warnings: [],
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: 4, upload_job_id: 12, source_type: "roster", row_number: 102, status: "pending",
    raw_data: { member_id: "NEW-001", first_name: "Margaret", last_name: "Chen", date_of_birth: "1954-03-15", gender: "F", health_plan: "Humana" },
    errors: ["Potential duplicate: matches existing member MC-20394 (Margaret Chen, DOB 1954-03-15)"],
    warnings: ["Member ID format differs from existing records"],
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: 5, upload_job_id: 12, source_type: "roster", row_number: 340, status: "pending",
    raw_data: { member_id: "NEW-002", first_name: "Robert", last_name: "Kim", date_of_birth: "1958-07-22", gender: "M", health_plan: "Aetna" },
    errors: ["Potential duplicate: matches existing member RK-10482 (Robert Kim, DOB 1958-07-22)"],
    warnings: [],
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: 6, upload_job_id: 11, source_type: "claims", row_number: 55, status: "pending",
    raw_data: { member_id: "JL-44521", service_date: "2019-12-15", diagnosis_code: "I50.9", cpt_code: "99213", provider_npi: "1112223334", billed_amount: 175 },
    errors: ["service_date: 2019-12-15 is before 2020"],
    warnings: [],
    created_at: "2026-03-15T10:00:00Z",
  },
  {
    id: 7, upload_job_id: 11, source_type: "claims", row_number: 412, status: "pending",
    raw_data: { member_id: "PW-55893", service_date: "2027-01-01", diagnosis_code: "J44.1", cpt_code: "99214", provider_npi: "4445556667", billed_amount: 225 },
    errors: ["service_date: 2027-01-01 is in the future"],
    warnings: [],
    created_at: "2026-03-15T10:00:00Z",
  },
  {
    id: 8, upload_job_id: 12, source_type: "claims", row_number: 3001, status: "pending",
    raw_data: { member_id: "TJ-66104", service_date: "2026-02-28", diagnosis_code: "I21.0", cpt_code: "99223", provider_npi: "7778889990", billed_amount: 847000 },
    errors: ["billed_amount: $847,000 exceeds $500K financial sanity threshold"],
    warnings: ["Verify this is a valid high-cost claim (cardiac event)"],
    created_at: "2026-03-22T14:30:00Z",
  },
];

export const mockUnresolvedMatches = [
  {
    id: 101,
    source_record: { member_id: "NEW-001", first_name: "Margaret", last_name: "Chen", date_of_birth: "1954-03-15", gender: "F", health_plan: "Humana", zip_code: "33012" },
    candidates: [
      { id: 1, member_external_id: "MC-20394", first_name: "Margaret", last_name: "Chen", date_of_birth: "1954-03-15", gender: "F", health_plan: "Humana", zip_code: "33012", confidence: 95 },
    ],
    match_type: "exact_name_dob",
    confidence: 95,
    status: "pending",
  },
  {
    id: 102,
    source_record: { member_id: "EXT-5521", first_name: "M.", last_name: "Chen", date_of_birth: "1954-03-15", gender: "F", health_plan: "Humana Gold Plus" },
    candidates: [
      { id: 1, member_external_id: "MC-20394", first_name: "Margaret", last_name: "Chen", date_of_birth: "1954-03-15", gender: "F", health_plan: "Humana", zip_code: "33012", confidence: 75 },
      { id: 42, member_external_id: "MC-88712", first_name: "Maria", last_name: "Chen", date_of_birth: "1954-08-22", gender: "F", health_plan: "Humana", zip_code: "33015", confidence: 45 },
    ],
    match_type: "fuzzy",
    confidence: 75,
    status: "pending",
  },
  {
    id: 103,
    source_record: { member_id: "EXT-7803", first_name: "Rob", last_name: "Kim", date_of_birth: "1958-07-22", gender: "M", health_plan: "Aetna" },
    candidates: [
      { id: 2, member_external_id: "RK-10482", first_name: "Robert", last_name: "Kim", date_of_birth: "1958-07-22", gender: "M", health_plan: "Aetna", zip_code: "33142", confidence: 85 },
    ],
    match_type: "fuzzy",
    confidence: 85,
    status: "pending",
  },
  {
    id: 104,
    source_record: { member_id: "EXT-9120", first_name: "Dorothy", last_name: "Santos-Garcia", date_of_birth: "1945-11-03", gender: "F", health_plan: "UHC" },
    candidates: [
      { id: 3, member_external_id: "DS-30291", first_name: "Dorothy", last_name: "Santos", date_of_birth: "1945-11-03", gender: "F", health_plan: "UnitedHealthcare", zip_code: "33178", confidence: 70 },
      { id: 89, member_external_id: "DS-30445", first_name: "Dorothy", last_name: "Santos", date_of_birth: "1945-06-18", gender: "F", health_plan: "UnitedHealthcare", zip_code: "33183", confidence: 55 },
    ],
    match_type: "fuzzy",
    confidence: 70,
    status: "pending",
  },
];

export const mockDataLineage = [
  {
    id: 1, entity_type: "member", entity_id: 1,
    source_system: "file_upload", source_file: "humana_roster_q4_2025.csv", source_row: 342,
    ingestion_job_id: 5,
    field_changes: null,
    created_at: "2025-10-15T09:00:00Z",
    description: "Initial member record created from Humana Q4 2025 roster file",
  },
  {
    id: 2, entity_type: "member", entity_id: 1,
    source_system: "file_upload", source_file: "humana_claims_q4_2025.csv", source_row: null,
    ingestion_job_id: 6,
    field_changes: { current_raf: { old: 1.200, new: 1.547, reason: "Claims-based RAF recalculation", timestamp: "2025-11-01T12:00:00Z" } },
    created_at: "2025-11-01T12:00:00Z",
    description: "RAF score updated after Q4 2025 claims ingestion",
  },
  {
    id: 3, entity_type: "member", entity_id: 1,
    source_system: "file_upload", source_file: "humana_q1_2026.csv", source_row: 298,
    ingestion_job_id: 10,
    field_changes: { health_plan: { old: "Humana Gold", new: "Humana", reason: "Plan name normalization", timestamp: "2026-01-10T08:30:00Z" } },
    created_at: "2026-01-10T08:30:00Z",
    description: "Roster refresh from Humana Q1 2026 file, plan name normalized",
  },
  {
    id: 4, entity_type: "member", entity_id: 1,
    source_system: "hcc_engine", source_file: null, source_row: null,
    ingestion_job_id: 10,
    field_changes: { current_raf: { old: 1.547, new: 1.847, reason: "HCC engine run - captured HCC 37 (Diabetes with Complications)", timestamp: "2026-03-15T14:00:00Z" } },
    created_at: "2026-03-15T14:00:00Z",
    description: "HCC engine run after Q1 2026 claims ingestion, captured HCC 37",
  },
  {
    id: 5, entity_type: "member", entity_id: 1,
    source_system: "hcc_engine", source_file: null, source_row: null,
    ingestion_job_id: 12,
    field_changes: { projected_raf: { old: 2.100, new: 2.312, reason: "Suspect HCC 226 (CHF) identified for capture", timestamp: "2026-03-22T14:30:00Z" } },
    created_at: "2026-03-22T14:30:00Z",
    description: "Suspect HCC 226 (CHF/Heart Failure) identified for capture, projected RAF updated",
  },
];

// ---- TCM (Transitional Care Management) ----

export const mockTCMDashboard = {
  active_cases: 12,
  compliance_rate: 71.4,
  revenue_captured: 14400,
  revenue_potential: 8700,
  by_provider: [
    { provider_name: "Dr. Sarah Patel", active: 3, completed: 2, compliance_rate: 80.0, revenue: 4500 },
    { provider_name: "Dr. James Rivera", active: 3, completed: 1, compliance_rate: 66.7, revenue: 3600 },
    { provider_name: "Dr. Lisa Chen", active: 2, completed: 2, compliance_rate: 75.0, revenue: 3300 },
    { provider_name: "Dr. Michael Torres", active: 2, completed: 1, compliance_rate: 60.0, revenue: 1800 },
    { provider_name: "Dr. Angela Brooks", active: 2, completed: 1, compliance_rate: 66.7, revenue: 1200 },
  ],
};

export const mockTCMActiveCases = [
  { member_id: "M1001", member_name: "Margaret Chen", discharge_date: "2026-03-23", days_since_discharge: 2, phone_contact_status: "done", phone_contact_date: "2026-03-24", visit_status: "pending", visit_date: null, cpt_code: "99495", billing_status: "pending", provider_name: "Dr. Sarah Patel", facility: "Memorial Hospital" },
  { member_id: "M1003", member_name: "Dorothy Martinez", discharge_date: "2026-03-22", days_since_discharge: 3, phone_contact_status: "overdue", phone_contact_date: null, visit_status: "pending", visit_date: null, cpt_code: "99495", billing_status: "pending", provider_name: "Dr. Lisa Chen", facility: "St. Luke's Medical Center" },
  { member_id: "M1006", member_name: "Gerald Foster", discharge_date: "2026-03-21", days_since_discharge: 4, phone_contact_status: "overdue", phone_contact_date: null, visit_status: "pending", visit_date: null, cpt_code: "99495", billing_status: "pending", provider_name: "Dr. James Rivera", facility: "Memorial Hospital" },
  { member_id: "M1008", member_name: "Frank Nguyen", discharge_date: "2026-03-20", days_since_discharge: 5, phone_contact_status: "overdue", phone_contact_date: null, visit_status: "overdue", visit_date: null, cpt_code: "99496", billing_status: "pending", provider_name: "Dr. Michael Torres", facility: "Riverside Community" },
  { member_id: "M1010", member_name: "William Davis", discharge_date: "2026-03-19", days_since_discharge: 6, phone_contact_status: "overdue", phone_contact_date: null, visit_status: "pending", visit_date: null, cpt_code: "99496", billing_status: "pending", provider_name: "Dr. Angela Brooks", facility: "Memorial Hospital" },
  { member_id: "M1002", member_name: "Robert Williams", discharge_date: "2026-03-18", days_since_discharge: 7, phone_contact_status: "done", phone_contact_date: "2026-03-19", visit_status: "pending", visit_date: null, cpt_code: "99495", billing_status: "pending", provider_name: "Dr. Sarah Patel", facility: "St. Luke's Medical Center" },
  { member_id: "M1007", member_name: "Helen Washington", discharge_date: "2026-03-15", days_since_discharge: 10, phone_contact_status: "done", phone_contact_date: "2026-03-16", visit_status: "done", visit_date: "2026-03-20", cpt_code: "99495", billing_status: "billed", provider_name: "Dr. Lisa Chen", facility: "Memorial Hospital" },
  { member_id: "M1004", member_name: "James Thornton", discharge_date: "2026-03-14", days_since_discharge: 11, phone_contact_status: "done", phone_contact_date: "2026-03-15", visit_status: "done", visit_date: "2026-03-21", cpt_code: "99496", billing_status: "billed", provider_name: "Dr. James Rivera", facility: "Riverside Community" },
  { member_id: "M1005", member_name: "Patricia Okafor", discharge_date: "2026-03-12", days_since_discharge: 13, phone_contact_status: "done", phone_contact_date: "2026-03-13", visit_status: "done", visit_date: "2026-03-18", cpt_code: "99496", billing_status: "billed", provider_name: "Dr. Michael Torres", facility: "St. Luke's Medical Center" },
  { member_id: "M1009", member_name: "Barbara Johnson", discharge_date: "2026-03-05", days_since_discharge: 20, phone_contact_status: "done", phone_contact_date: "2026-03-06", visit_status: "missed", visit_date: null, cpt_code: null, billing_status: "not_eligible", provider_name: "Dr. Angela Brooks", facility: "Memorial Hospital" },
  { member_id: "M1011", member_name: "Edward Thompson", discharge_date: "2026-03-02", days_since_discharge: 23, phone_contact_status: "done", phone_contact_date: "2026-03-03", visit_status: "missed", visit_date: null, cpt_code: null, billing_status: "not_eligible", provider_name: "Dr. Sarah Patel", facility: "Riverside Community" },
  { member_id: "M1012", member_name: "Alice Robinson", discharge_date: "2026-02-28", days_since_discharge: 25, phone_contact_status: "done", phone_contact_date: "2026-03-01", visit_status: "missed", visit_date: null, cpt_code: null, billing_status: "not_eligible", provider_name: "Dr. James Rivera", facility: "Memorial Hospital" },
];

// ---- RADV Audit Readiness ----

export const mockRADVReadiness = {
  overall_score: 82,
  by_category: [
    { category: "Diabetes", hcc_codes: [37, 38], captures: 342, avg_meat_score: 88, status: "strong" },
    { category: "Heart / Vascular", hcc_codes: [226, 238], captures: 245, avg_meat_score: 79, status: "moderate" },
    { category: "Renal", hcc_codes: [326, 327, 328, 329], captures: 267, avg_meat_score: 84, status: "strong" },
    { category: "Pulmonary", hcc_codes: [280], captures: 198, avg_meat_score: 72, status: "moderate" },
    { category: "Behavioral", hcc_codes: [155], captures: 284, avg_meat_score: 65, status: "weak" },
    { category: "Nutritional", hcc_codes: [21, 48], captures: 225, avg_meat_score: 61, status: "weak" },
  ],
  weakest_codes: [
    { hcc_code: 155, hcc_label: "Depression / Behavioral", member_count: 284, avg_meat_score: 52, weakest_member: "Robert Williams", risk_level: "high" },
    { hcc_code: 48, hcc_label: "Morbid Obesity", member_count: 134, avg_meat_score: 58, weakest_member: "Margaret Chen", risk_level: "high" },
    { hcc_code: 21, hcc_label: "Malnutrition", member_count: 91, avg_meat_score: 61, weakest_member: "Helen Washington", risk_level: "high" },
    { hcc_code: 280, hcc_label: "COPD / Chronic Lung", member_count: 198, avg_meat_score: 64, weakest_member: "Dorothy Martinez", risk_level: "medium" },
  ],
  strongest_codes: [
    { hcc_code: 37, hcc_label: "Diabetes with Complications", captures: 342, avg_meat_score: 94 },
    { hcc_code: 226, hcc_label: "CHF / Heart Failure", captures: 189, avg_meat_score: 91 },
    { hcc_code: 329, hcc_label: "CKD (HCC 326-329)", captures: 267, avg_meat_score: 89 },
  ],
};

export const mockRADVMemberProfile: Record<string, any> = {
  M1001: {
    member_id: "M1001", member_name: "Margaret Chen", overall_score: 78,
    hccs: [
      { hcc_code: 37, hcc_label: "Diabetes with Complications", meat_score: 92, evidence_strength: "strong", vulnerability: "low", meat_detail: { monitored: true, evaluated: true, assessed: true, treated: true, score: 92 } },
      { hcc_code: 226, hcc_label: "CHF / Heart Failure", meat_score: 85, evidence_strength: "strong", vulnerability: "low", meat_detail: { monitored: true, evaluated: true, assessed: true, treated: true, score: 85 } },
      { hcc_code: 48, hcc_label: "Morbid Obesity", meat_score: 45, evidence_strength: "weak", vulnerability: "high", meat_detail: { monitored: true, evaluated: false, assessed: true, treated: false, score: 45 } },
    ],
  },
  M1002: {
    member_id: "M1002", member_name: "Robert Williams", overall_score: 68,
    hccs: [
      { hcc_code: 155, hcc_label: "Depression / Behavioral", meat_score: 42, evidence_strength: "weak", vulnerability: "high", meat_detail: { monitored: false, evaluated: true, assessed: true, treated: false, score: 42 } },
    ],
  },
};

// ---- Attribution Management ----

export const mockAttributionDashboard = {
  total_attributed: 4832,
  new_this_month: 23,
  lost_this_month: 18,
  churn_rate: 4.5,
  by_plan: [
    { plan: "Humana Gold Plus", members: 1842, pct: 38.1 },
    { plan: "Aetna Medicare Advantage", members: 1256, pct: 26.0 },
    { plan: "UHC Dual Complete", members: 894, pct: 18.5 },
    { plan: "Cigna HealthSpring", members: 542, pct: 11.2 },
    { plan: "WellCare Value", members: 298, pct: 6.2 },
  ],
};

export const mockAttributionChanges = [
  { member_id: "M2001", member_name: "Thomas Anderson", change_type: "new", previous_plan: null, new_plan: "Humana Gold Plus", effective_date: "2026-03-01", reason: "Open enrollment", raf_score: 1.34 },
  { member_id: "M2002", member_name: "Sandra Mitchell", change_type: "new", previous_plan: null, new_plan: "Aetna Medicare Advantage", effective_date: "2026-03-01", reason: "Open enrollment", raf_score: 0.89 },
  { member_id: "M2003", member_name: "Richard Hall", change_type: "lost", previous_plan: "Humana Gold Plus", new_plan: null, effective_date: "2026-03-01", reason: "Moved out of service area", raf_score: 2.14 },
  { member_id: "M2004", member_name: "Nancy Clark", change_type: "lost", previous_plan: "UHC Dual Complete", new_plan: null, effective_date: "2026-03-01", reason: "Deceased", raf_score: 1.87 },
  { member_id: "M2005", member_name: "Charles Lewis", change_type: "transferred", previous_plan: "Cigna HealthSpring", new_plan: "Humana Gold Plus", effective_date: "2026-03-15", reason: "Member choice", raf_score: 1.12 },
  { member_id: "M2006", member_name: "Betty Young", change_type: "new", previous_plan: null, new_plan: "WellCare Value", effective_date: "2026-03-01", reason: "New to Medicare", raf_score: 0.72 },
  { member_id: "M2007", member_name: "George Wright", change_type: "lost", previous_plan: "Aetna Medicare Advantage", new_plan: null, effective_date: "2026-02-28", reason: "Switched to FFS Medicare", raf_score: 1.56 },
  { member_id: "M2008", member_name: "Martha King", change_type: "new", previous_plan: null, new_plan: "Humana Gold Plus", effective_date: "2026-03-15", reason: "SEP - moved into area", raf_score: 1.91 },
];

export const mockChurnRisk = [
  { member_id: "M1003", member_name: "Dorothy Martinez", days_since_last_visit: 287, engagement_score: 22, raf_score: 2.456, annual_value: 27016, risk_level: "high" },
  { member_id: "M1008", member_name: "Frank Nguyen", days_since_last_visit: 264, engagement_score: 31, raf_score: 1.456, annual_value: 16016, risk_level: "high" },
  { member_id: "M1010", member_name: "William Davis", days_since_last_visit: 251, engagement_score: 35, raf_score: 1.123, annual_value: 12353, risk_level: "high" },
  { member_id: "M2009", member_name: "Susan Phillips", days_since_last_visit: 245, engagement_score: 38, raf_score: 1.89, annual_value: 20790, risk_level: "high" },
  { member_id: "M2010", member_name: "James Scott", days_since_last_visit: 240, engagement_score: 40, raf_score: 0.95, annual_value: 10450, risk_level: "medium" },
  { member_id: "M2011", member_name: "Linda Green", days_since_last_visit: 235, engagement_score: 42, raf_score: 1.67, annual_value: 18370, risk_level: "medium" },
  { member_id: "M2012", member_name: "David Baker", days_since_last_visit: 228, engagement_score: 44, raf_score: 1.23, annual_value: 13530, risk_level: "medium" },
  { member_id: "M2013", member_name: "Carol Adams", days_since_last_visit: 221, engagement_score: 47, raf_score: 2.01, annual_value: 22110, risk_level: "medium" },
  { member_id: "M2014", member_name: "Michael Hill", days_since_last_visit: 215, engagement_score: 49, raf_score: 0.88, annual_value: 9680, risk_level: "low" },
  { member_id: "M2015", member_name: "Jennifer Campbell", days_since_last_visit: 210, engagement_score: 51, raf_score: 1.45, annual_value: 15950, risk_level: "low" },
];

export const mockAttributionRevenueImpact = {
  members_lost: 18,
  revenue_at_risk: 198000,
  members_gained: 23,
  revenue_gained: 156000,
  net_impact: -42000,
  quarterly_projection: -126000,
  detail: "Losing 45 members this quarter reduces projected RAF revenue by $198K. New attributions partially offset with $156K, leaving a net gap of $42K/month.",
};

// ---- Stop-Loss & Risk Corridor ----

export const mockStopLossDashboard = {
  members_approaching: 6,
  members_exceeding: 2,
  total_exposure: 487000,
  risk_corridor_position: 94,
  threshold: 150000,
  total_high_cost_spend: 1842000,
};

export const mockHighCostMembers = [
  { member_id: "M3001", member_name: "Harold Patterson", twelve_month_spend: 312000, stoploss_threshold: 150000, pct_of_threshold: 208, projected_year_end: 345000, primary_conditions: ["End-Stage Renal Disease", "CHF", "Diabetes"], exceeds_threshold: true },
  { member_id: "M3002", member_name: "Evelyn Richardson", twelve_month_spend: 198000, stoploss_threshold: 150000, pct_of_threshold: 132, projected_year_end: 220000, primary_conditions: ["Lung Cancer", "COPD", "Depression"], exceeds_threshold: true },
  { member_id: "M3003", member_name: "Arthur Brooks", twelve_month_spend: 142000, stoploss_threshold: 150000, pct_of_threshold: 94.7, projected_year_end: 168000, primary_conditions: ["Liver Transplant", "Hepatitis C"], exceeds_threshold: false },
  { member_id: "M3004", member_name: "Virginia Coleman", twelve_month_spend: 138000, stoploss_threshold: 150000, pct_of_threshold: 92.0, projected_year_end: 155000, primary_conditions: ["Multiple Sclerosis", "Depression"], exceeds_threshold: false },
  { member_id: "M3005", member_name: "Raymond Simmons", twelve_month_spend: 129000, stoploss_threshold: 150000, pct_of_threshold: 86.0, projected_year_end: 148000, primary_conditions: ["CHF", "CKD Stage 4", "COPD"], exceeds_threshold: false },
  { member_id: "M3006", member_name: "Florence Jenkins", twelve_month_spend: 118000, stoploss_threshold: 150000, pct_of_threshold: 78.7, projected_year_end: 135000, primary_conditions: ["Hemophilia A", "Joint Disease"], exceeds_threshold: false },
  { member_id: "M3007", member_name: "Donald Ward", twelve_month_spend: 112000, stoploss_threshold: 150000, pct_of_threshold: 74.7, projected_year_end: 128000, primary_conditions: ["ALS", "Respiratory Failure"], exceeds_threshold: false },
  { member_id: "M3008", member_name: "Ruth Howard", twelve_month_spend: 105000, stoploss_threshold: 150000, pct_of_threshold: 70.0, projected_year_end: 122000, primary_conditions: ["Rheumatoid Arthritis", "Osteoporosis"], exceeds_threshold: false },
];

export const mockRiskCorridor = {
  target_spend: 72000000,
  actual_spend: 67680000,
  ratio: 94.0,
  corridor_band: "Shared Savings",
  shared_risk_exposure: 2160000,
  corridor_bands: [
    { band: "Full Risk (Plan)", range: "< 85%", description: "Plan retains 100% of savings below 85% of target", status: "inactive" },
    { band: "Shared Savings", range: "85% - 97%", description: "Savings shared 50/50 between plan and CMS", status: "active" },
    { band: "Neutral Zone", range: "97% - 103%", description: "No shared risk or savings", status: "inactive" },
    { band: "Shared Losses", range: "103% - 108%", description: "Losses shared 50/50 between plan and CMS", status: "inactive" },
    { band: "Full Risk (CMS)", range: "> 108%", description: "Plan bears 100% of losses above 108% of target", status: "inactive" },
  ],
};

// ---- Provider Education ----

export const mockEducationLibrary = [
  { id: 1, title: "Diabetes HCC Coding Mastery", description: "Comprehensive guide to accurate diabetes coding: E11.xx specificity, complication capture, and HCC 37/38 documentation requirements. Includes case studies on upgrading unspecified codes.", category: "Coding", estimated_minutes: 45, relevance_score: null, completed: false, completed_date: null },
  { id: 2, title: "Depression Screening & Documentation", description: "PHQ-9 workflows, documentation templates, and coding pathways for depression (HCC 155). Covers initial screening, follow-up protocols, and MEAT evidence requirements.", category: "Quality", estimated_minutes: 30, relevance_score: null, completed: false, completed_date: null },
  { id: 3, title: "CHF Documentation Excellence", description: "Heart failure staging, EF documentation, medication management documentation, and HCC 226 capture optimization. Includes NYHA classification guidance.", category: "Coding", estimated_minutes: 40, relevance_score: null, completed: false, completed_date: null },
  { id: 4, title: "CKD Staging & Risk Adjustment", description: "GFR-based staging documentation, ACR testing protocols, and HCC 326-329 capture. Covers progression tracking and care plan documentation.", category: "Coding", estimated_minutes: 35, relevance_score: null, completed: false, completed_date: null },
  { id: 5, title: "HCC Recapture Best Practices", description: "Annual recapture workflows: condition carry-forward, visit planning, documentation templates, and compliance tracking. Focus on high-value conditions.", category: "Revenue", estimated_minutes: 25, relevance_score: null, completed: false, completed_date: null },
  { id: 6, title: "Annual Wellness Visit Optimization", description: "AWV best practices: HRA completion, care plan updates, preventive service ordering, HCC review during visit, and coding for 99387/99397.", category: "Quality", estimated_minutes: 30, relevance_score: null, completed: false, completed_date: null },
];

export const mockEducationRecommendations: Record<number, any[]> = {
  8: [
    { ...mockEducationLibrary[0], relevance_score: 95, completed: false },
    { ...mockEducationLibrary[4], relevance_score: 88, completed: false },
    { ...mockEducationLibrary[2], relevance_score: 82, completed: false },
  ],
  9: [
    { ...mockEducationLibrary[1], relevance_score: 92, completed: false },
    { ...mockEducationLibrary[4], relevance_score: 85, completed: true, completed_date: "2026-03-10" },
    { ...mockEducationLibrary[5], relevance_score: 78, completed: false },
  ],
  7: [
    { ...mockEducationLibrary[3], relevance_score: 90, completed: false },
    { ...mockEducationLibrary[0], relevance_score: 84, completed: true, completed_date: "2026-02-28" },
    { ...mockEducationLibrary[1], relevance_score: 76, completed: false },
  ],
};

// ---- AWV Tracking ----

export const mockAWVDashboard = {
  total_members: 4832,
  awv_completed: 2890,
  awv_overdue: 1942,
  completion_rate: 59.8,
  revenue_opportunity: 842000,
  current_month: "March 2026",
  by_provider: [
    { provider_id: 1, provider_name: "Dr. Sarah Patel", panel_size: 342, awv_completed: 248, completion_rate: 72.5, remaining_value: 81400 },
    { provider_id: 2, provider_name: "Dr. James Rivera", panel_size: 289, awv_completed: 195, completion_rate: 67.5, remaining_value: 81400 },
    { provider_id: 3, provider_name: "Dr. Lisa Chen", panel_size: 198, awv_completed: 142, completion_rate: 71.7, remaining_value: 48400 },
    { provider_id: 4, provider_name: "Dr. Michael Torres", panel_size: 267, awv_completed: 164, completion_rate: 61.4, remaining_value: 89100 },
    { provider_id: 5, provider_name: "Dr. Angela Brooks", panel_size: 312, awv_completed: 178, completion_rate: 57.1, remaining_value: 115900 },
    { provider_id: 6, provider_name: "Dr. Thomas Lee", panel_size: 156, awv_completed: 72, completion_rate: 46.2, remaining_value: 72600 },
    { provider_id: 7, provider_name: "Dr. Karen Murphy", panel_size: 291, awv_completed: 148, completion_rate: 50.9, remaining_value: 123700 },
    { provider_id: 8, provider_name: "Dr. Robert Kim", panel_size: 234, awv_completed: 98, completion_rate: 41.9, remaining_value: 117600 },
    { provider_id: 9, provider_name: "Dr. David Wilson", panel_size: 178, awv_completed: 68, completion_rate: 38.2, remaining_value: 95200 },
    { provider_id: 10, provider_name: "Dr. Jennifer Adams", panel_size: 203, awv_completed: 102, completion_rate: 50.2, remaining_value: 87400 },
  ],
  by_group: [
    { group_name: "Brookdale Medical Group", members: 1420, completed: 924, rate: 65.1 },
    { group_name: "Sunrise Health Partners", members: 1180, completed: 642, rate: 54.4 },
    { group_name: "Valley Care Associates", members: 980, completed: 612, rate: 62.4 },
    { group_name: "Coastal Primary Care", members: 752, completed: 412, rate: 54.8 },
    { group_name: "Metro Health Network", members: 500, completed: 300, rate: 60.0 },
  ],
};

export const mockAWVMembersDue = [
  { member_id: 1001, member_name: "Margaret Chen", date_of_birth: "1948-03-15", current_raf: 1.847, risk_tier: "high", pcp_provider_id: 2, pcp_name: "Dr. James Rivera", estimated_value: 1624, last_awv_date: "2025-02-10" },
  { member_id: 1003, member_name: "Dorothy Martinez", date_of_birth: "1940-11-22", current_raf: 2.456, risk_tier: "very_high", pcp_provider_id: 1, pcp_name: "Dr. Sarah Patel", estimated_value: 2161, last_awv_date: "2025-01-18" },
  { member_id: 1005, member_name: "Robert Johnson", date_of_birth: "1952-07-04", current_raf: 2.102, risk_tier: "very_high", pcp_provider_id: 4, pcp_name: "Dr. Michael Torres", estimated_value: 1850, last_awv_date: "2024-11-05" },
  { member_id: 1006, member_name: "Gerald Foster", date_of_birth: "1945-09-30", current_raf: 1.923, risk_tier: "high", pcp_provider_id: 3, pcp_name: "Dr. Lisa Chen", estimated_value: 1692, last_awv_date: "2025-03-22" },
  { member_id: 1008, member_name: "Helen Nguyen", date_of_birth: "1950-01-17", current_raf: 1.654, risk_tier: "high", pcp_provider_id: 5, pcp_name: "Dr. Angela Brooks", estimated_value: 1456, last_awv_date: null },
  { member_id: 1010, member_name: "James Williams", date_of_birth: "1947-06-11", current_raf: 1.589, risk_tier: "high", pcp_provider_id: 7, pcp_name: "Dr. Karen Murphy", estimated_value: 1398, last_awv_date: "2025-04-02" },
  { member_id: 1012, member_name: "Patricia Brown", date_of_birth: "1955-12-20", current_raf: 1.432, risk_tier: "moderate", pcp_provider_id: 8, pcp_name: "Dr. Robert Kim", estimated_value: 1260, last_awv_date: "2025-05-14" },
  { member_id: 1014, member_name: "Richard Davis", date_of_birth: "1943-08-09", current_raf: 1.876, risk_tier: "high", pcp_provider_id: 6, pcp_name: "Dr. Thomas Lee", estimated_value: 1651, last_awv_date: "2024-08-20" },
  { member_id: 1015, member_name: "Barbara Garcia", date_of_birth: "1958-02-28", current_raf: 1.234, risk_tier: "moderate", pcp_provider_id: 9, pcp_name: "Dr. David Wilson", estimated_value: 1086, last_awv_date: "2025-06-01" },
  { member_id: 1017, member_name: "William Taylor", date_of_birth: "1951-04-14", current_raf: 1.678, risk_tier: "high", pcp_provider_id: 10, pcp_name: "Dr. Jennifer Adams", estimated_value: 1477, last_awv_date: null },
  { member_id: 1019, member_name: "Mary Anderson", date_of_birth: "1946-10-05", current_raf: 2.312, risk_tier: "very_high", pcp_provider_id: 1, pcp_name: "Dr. Sarah Patel", estimated_value: 2034, last_awv_date: "2024-12-10" },
  { member_id: 1020, member_name: "Charles Thompson", date_of_birth: "1953-05-19", current_raf: 1.345, risk_tier: "moderate", pcp_provider_id: 2, pcp_name: "Dr. James Rivera", estimated_value: 1184, last_awv_date: "2025-07-22" },
  { member_id: 1022, member_name: "Susan White", date_of_birth: "1949-11-30", current_raf: 1.567, risk_tier: "high", pcp_provider_id: 3, pcp_name: "Dr. Lisa Chen", estimated_value: 1379, last_awv_date: "2025-01-05" },
  { member_id: 1024, member_name: "Joseph Harris", date_of_birth: "1944-03-25", current_raf: 1.923, risk_tier: "high", pcp_provider_id: 4, pcp_name: "Dr. Michael Torres", estimated_value: 1692, last_awv_date: "2024-09-15" },
  { member_id: 1026, member_name: "Karen Martin", date_of_birth: "1956-08-07", current_raf: 1.123, risk_tier: "moderate", pcp_provider_id: 5, pcp_name: "Dr. Angela Brooks", estimated_value: 988, last_awv_date: "2025-02-28" },
  { member_id: 1028, member_name: "Thomas Jackson", date_of_birth: "1941-12-18", current_raf: 2.087, risk_tier: "very_high", pcp_provider_id: 6, pcp_name: "Dr. Thomas Lee", estimated_value: 1837, last_awv_date: null },
  { member_id: 1030, member_name: "Nancy Robinson", date_of_birth: "1954-07-22", current_raf: 1.456, risk_tier: "moderate", pcp_provider_id: 7, pcp_name: "Dr. Karen Murphy", estimated_value: 1281, last_awv_date: "2025-04-18" },
  { member_id: 1032, member_name: "Daniel Clark", date_of_birth: "1948-09-12", current_raf: 1.789, risk_tier: "high", pcp_provider_id: 8, pcp_name: "Dr. Robert Kim", estimated_value: 1574, last_awv_date: "2024-10-30" },
  { member_id: 1034, member_name: "Betty Lewis", date_of_birth: "1942-01-06", current_raf: 2.234, risk_tier: "very_high", pcp_provider_id: 9, pcp_name: "Dr. David Wilson", estimated_value: 1966, last_awv_date: "2024-07-14" },
  { member_id: 1036, member_name: "Mark Walker", date_of_birth: "1957-06-28", current_raf: 1.098, risk_tier: "moderate", pcp_provider_id: 10, pcp_name: "Dr. Jennifer Adams", estimated_value: 966, last_awv_date: "2025-08-05" },
];

export const mockAWVOpportunities = {
  total_overdue: 1942,
  total_opportunity: 842000,
  avg_value_per_awv: 880,
  hcc_breakdown: [
    { hcc_category: "Diabetes with Complications (HCC 37)", pct_of_recapture: 22, estimated_value: 185240 },
    { hcc_category: "CHF / Heart Failure (HCC 226)", pct_of_recapture: 15, estimated_value: 126300 },
    { hcc_category: "COPD (HCC 280)", pct_of_recapture: 12, estimated_value: 101040 },
    { hcc_category: "CKD (HCC 326-329) (HCC 326-329)", pct_of_recapture: 10, estimated_value: 84200 },
    { hcc_category: "Depression / Behavioral (HCC 155)", pct_of_recapture: 9, estimated_value: 75780 },
    { hcc_category: "Morbid Obesity (HCC 48)", pct_of_recapture: 8, estimated_value: 67360 },
    { hcc_category: "Other conditions", pct_of_recapture: 24, estimated_value: 202080 },
  ],
  insight: "If all 1,942 overdue members complete their AWV, estimated RAF recapture value = $842,000. Scheduling AWVs for the top 50 highest-RAF overdue members alone would recapture approximately $187,000 in RAF value.",
};

// ---- Stars Rating Simulator ----

export const mockStarsProjection = {
  overall_rating: 3.5,
  part_c_rating: 3.5,
  part_d_rating: 4.0,
  total_weighted_score: 3.482,
  qualifies_for_bonus: false,
  quality_bonus_amount: 0,
  measures: [
    { code: "CDC-HbA1c", name: "Diabetes Care -- HbA1c Testing", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 892, numerator: 608, current_rate: 68.2, star_level: 3, star_3_cutpoint: 74.0, star_4_cutpoint: 82.0, star_5_cutpoint: 90.0, gaps_to_next_star: 123 },
    { code: "CDC-Eye", name: "Diabetes Care -- Eye Exam", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 892, numerator: 498, current_rate: 55.8, star_level: 3, star_3_cutpoint: 55.0, star_4_cutpoint: 65.0, star_5_cutpoint: 75.0, gaps_to_next_star: 82 },
    { code: "BCS", name: "Breast Cancer Screening", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 1240, numerator: 918, current_rate: 74.0, star_level: 4, star_3_cutpoint: 64.0, star_4_cutpoint: 72.0, star_5_cutpoint: 80.0, gaps_to_next_star: 74 },
    { code: "COL", name: "Colorectal Cancer Screening", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 2100, numerator: 1499, current_rate: 71.4, star_level: 4, star_3_cutpoint: 60.0, star_4_cutpoint: 70.0, star_5_cutpoint: 80.0, gaps_to_next_star: 181 },
    { code: "CBP", name: "Controlling Blood Pressure", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 1560, numerator: 998, current_rate: 64.0, star_level: 3, star_3_cutpoint: 58.0, star_4_cutpoint: 66.0, star_5_cutpoint: 74.0, gaps_to_next_star: 32 },
    { code: "COA-MedReview", name: "Care for Older Adults -- Medication Review", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 820, numerator: 574, current_rate: 70.0, star_level: 4, star_3_cutpoint: 60.0, star_4_cutpoint: 70.0, star_5_cutpoint: 80.0, gaps_to_next_star: 82 },
    { code: "COA-Pain", name: "Care for Older Adults -- Pain Assessment", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 820, numerator: 558, current_rate: 68.0, star_level: 3, star_3_cutpoint: 60.0, star_4_cutpoint: 70.0, star_5_cutpoint: 80.0, gaps_to_next_star: 16 },
    { code: "COA-Functional", name: "Care for Older Adults -- Functional Status", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 820, numerator: 492, current_rate: 60.0, star_level: 3, star_3_cutpoint: 60.0, star_4_cutpoint: 70.0, star_5_cutpoint: 80.0, gaps_to_next_star: 82 },
    { code: "MRP", name: "Medication Reconciliation Post-Discharge", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 340, numerator: 187, current_rate: 55.0, star_level: 3, star_3_cutpoint: 48.0, star_4_cutpoint: 56.0, star_5_cutpoint: 65.0, gaps_to_next_star: 4 },
    { code: "FMC", name: "Follow-Up After ED Visit for Mental Health", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 180, numerator: 81, current_rate: 45.0, star_level: 3, star_3_cutpoint: 40.0, star_4_cutpoint: 50.0, star_5_cutpoint: 60.0, gaps_to_next_star: 9 },
    { code: "KED", name: "Kidney Health Evaluation for Diabetes", category: "Effectiveness of Care", weight: 1, part: "C", total_eligible: 892, numerator: 368, current_rate: 41.2, star_level: 4, star_3_cutpoint: 28.0, star_4_cutpoint: 36.0, star_5_cutpoint: 44.0, gaps_to_next_star: 25 },
    { code: "AAP", name: "Adults' Access to Preventive Services", category: "Access to Care", weight: 1, part: "C", total_eligible: 4200, numerator: 3570, current_rate: 85.0, star_level: 3, star_3_cutpoint: 82.0, star_4_cutpoint: 88.0, star_5_cutpoint: 94.0, gaps_to_next_star: 126 },
    { code: "SPD", name: "Statin Use in Persons with Diabetes", category: "Medication Adherence", weight: 3, part: "D", total_eligible: 780, numerator: 633, current_rate: 81.2, star_level: 4, star_3_cutpoint: 76.0, star_4_cutpoint: 82.0, star_5_cutpoint: 88.0, gaps_to_next_star: 54 },
  ],
};

export const mockStarsSimulationResult = {
  current_overall: 3.5,
  projected_overall: 4.0,
  current_part_c: 3.5,
  projected_part_c: 3.5,
  current_part_d: 4.0,
  projected_part_d: 4.5,
  rating_change: 0.5,
  qualifies_for_bonus: true,
  quality_bonus_amount: 14375232,
  quality_bonus_change: 14375232,
  measures_changed: [
    { code: "SPD", name: "Statin Use in Persons with Diabetes", weight: 3, old_star: 4, new_star: 5, old_rate: 81.2, new_rate: 90.8 },
    { code: "CDC-HbA1c", name: "Diabetes Care -- HbA1c Testing", weight: 1, old_star: 3, new_star: 4, old_rate: 68.2, new_rate: 85.0 },
  ],
  simulated_measures: mockStarsProjection.measures.map((m) => {
    if (m.code === "SPD") return { ...m, current_rate: 90.8, numerator: 708, star_level: 5 };
    if (m.code === "CDC-HbA1c") return { ...m, current_rate: 85.0, numerator: 758, star_level: 4 };
    return m;
  }),
};

export const mockStarsOpportunities = [
  {
    measure_code: "SPD", measure_name: "Statin Use in Persons with Diabetes",
    current_star: 4, target_star: 5, gaps_to_close: 54, weight: 3,
    current_rate: 81.2, target_rate: 88.0, roi_score: 55.6,
    description: "Closing 54 Statin Use in Persons with Diabetes gaps moves SPD from 4-star to 5-star (triple-weighted) = highest ROI",
    impact_type: "triple_weighted",
  },
  {
    measure_code: "MRP", measure_name: "Medication Reconciliation Post-Discharge",
    current_star: 3, target_star: 4, gaps_to_close: 4, weight: 1,
    current_rate: 55.0, target_rate: 56.0, roi_score: 250.0,
    description: "Closing 4 Medication Reconciliation Post-Discharge gaps moves MRP from 3-star to 4-star (1x)",
    impact_type: "standard",
  },
  {
    measure_code: "FMC", measure_name: "Follow-Up After ED Visit for Mental Health",
    current_star: 3, target_star: 4, gaps_to_close: 9, weight: 1,
    current_rate: 45.0, target_rate: 50.0, roi_score: 111.1,
    description: "Closing 9 Follow-Up After ED Visit for Mental Health gaps moves FMC from 3-star to 4-star (1x)",
    impact_type: "standard",
  },
  {
    measure_code: "COA-Pain", measure_name: "Care for Older Adults -- Pain Assessment",
    current_star: 3, target_star: 4, gaps_to_close: 16, weight: 1,
    current_rate: 68.0, target_rate: 70.0, roi_score: 62.5,
    description: "Closing 16 Care for Older Adults -- Pain Assessment gaps moves COA-Pain from 3-star to 4-star (1x)",
    impact_type: "standard",
  },
  {
    measure_code: "CBP", measure_name: "Controlling Blood Pressure",
    current_star: 3, target_star: 4, gaps_to_close: 32, weight: 1,
    current_rate: 64.0, target_rate: 66.0, roi_score: 31.3,
    description: "Closing 32 Controlling Blood Pressure gaps moves CBP from 3-star to 4-star (1x)",
    impact_type: "standard",
  },
];

// ---- Temporal / Time Machine ----

export const mockTemporalSnapshotA = {
  date: "2025-10-01",
  total_members: 4680,
  avg_raf: 1.18,
  total_suspects: 2100,
  total_spend: 36883200,
  gap_closure_rate: 58.2,
  pmpm: 1312,
};

export const mockTemporalSnapshotB = {
  date: "2026-03-01",
  total_members: 4832,
  avg_raf: 1.247,
  total_suspects: 1847,
  total_spend: 36176064,
  gap_closure_rate: 64.8,
  pmpm: 1247,
};

export const mockTemporalComparison = {
  period_a: mockTemporalSnapshotA,
  period_b: mockTemporalSnapshotB,
  deltas: {
    total_members: { old: 4680, new: 4832, change: 152, pct_change: 3.25 },
    avg_raf: { old: 1.18, new: 1.247, change: 0.067, pct_change: 5.68 },
    pmpm: { old: 1312, new: 1247, change: -65, pct_change: -4.95 },
    total_suspects: { old: 2100, new: 1847, change: -253, pct_change: -12.05 },
    gap_closure_rate: { old: 58.2, new: 64.8, change: 6.6, pct_change: 11.34 },
    total_spend: { old: 36883200, new: 36176064, change: -707136, pct_change: -1.92 },
  },
  notable_changes: [
    "152 new members attributed",
    "253 HCC suspects captured",
    "Gap closure improved by 6.6pp",
    "PMPM decreased by $65",
    "8 providers improved capture rate above 70%",
    "$707K reduction in total spend",
    "12 members transitioned out of complex tier",
    "42 new AWV completions",
    "3 high-cost members enrolled in care management",
    "Diabetes care gap closure improved 8.2pp",
  ],
};

export const mockTemporalTimeline = [
  { month: "2025-04", value: 1.142 },
  { month: "2025-05", value: 1.148 },
  { month: "2025-06", value: 1.155 },
  { month: "2025-07", value: 1.163 },
  { month: "2025-08", value: 1.171 },
  { month: "2025-09", value: 1.176 },
  { month: "2025-10", value: 1.180 },
  { month: "2025-11", value: 1.195 },
  { month: "2025-12", value: 1.208 },
  { month: "2026-01", value: 1.221 },
  { month: "2026-02", value: 1.234 },
  { month: "2026-03", value: 1.247 },
];

export const mockTemporalTimelineMembers = [
  { month: "2025-04", value: 4520 },
  { month: "2025-05", value: 4548 },
  { month: "2025-06", value: 4579 },
  { month: "2025-07", value: 4610 },
  { month: "2025-08", value: 4638 },
  { month: "2025-09", value: 4661 },
  { month: "2025-10", value: 4680 },
  { month: "2025-11", value: 4712 },
  { month: "2025-12", value: 4745 },
  { month: "2026-01", value: 4778 },
  { month: "2026-02", value: 4805 },
  { month: "2026-03", value: 4832 },
];

export const mockTemporalTimelinePmpm = [
  { month: "2025-04", value: 1358 },
  { month: "2025-05", value: 1349 },
  { month: "2025-06", value: 1341 },
  { month: "2025-07", value: 1332 },
  { month: "2025-08", value: 1325 },
  { month: "2025-09", value: 1318 },
  { month: "2025-10", value: 1312 },
  { month: "2025-11", value: 1298 },
  { month: "2025-12", value: 1285 },
  { month: "2026-01", value: 1271 },
  { month: "2026-02", value: 1259 },
  { month: "2026-03", value: 1247 },
];

export const mockTemporalTimelineSuspects = [
  { month: "2025-04", value: 2340 },
  { month: "2025-05", value: 2310 },
  { month: "2025-06", value: 2275 },
  { month: "2025-07", value: 2240 },
  { month: "2025-08", value: 2198 },
  { month: "2025-09", value: 2152 },
  { month: "2025-10", value: 2100 },
  { month: "2025-11", value: 2038 },
  { month: "2025-12", value: 1972 },
  { month: "2026-01", value: 1923 },
  { month: "2026-02", value: 1882 },
  { month: "2026-03", value: 1847 },
];

export const mockTemporalTimelineGapClosure = [
  { month: "2025-04", value: 52.1 },
  { month: "2025-05", value: 53.4 },
  { month: "2025-06", value: 54.2 },
  { month: "2025-07", value: 55.5 },
  { month: "2025-08", value: 56.8 },
  { month: "2025-09", value: 57.4 },
  { month: "2025-10", value: 58.2 },
  { month: "2025-11", value: 59.9 },
  { month: "2025-12", value: 61.2 },
  { month: "2026-01", value: 62.5 },
  { month: "2026-02", value: 63.7 },
  { month: "2026-03", value: 64.8 },
];

export const mockTemporalTimelineCaptureRate = [
  { month: "2025-04", value: 24.8 },
  { month: "2025-05", value: 25.3 },
  { month: "2025-06", value: 26.1 },
  { month: "2025-07", value: 26.9 },
  { month: "2025-08", value: 27.5 },
  { month: "2025-09", value: 27.8 },
  { month: "2025-10", value: 28.1 },
  { month: "2025-11", value: 29.2 },
  { month: "2025-12", value: 30.1 },
  { month: "2026-01", value: 31.0 },
  { month: "2026-02", value: 31.8 },
  { month: "2026-03", value: 32.4 },
];

export const mockTemporalTimelineMap: Record<string, { month: string; value: number }[]> = {
  avg_raf: mockTemporalTimeline,
  total_members: mockTemporalTimelineMembers,
  total_pmpm: mockTemporalTimelinePmpm,
  suspect_count: mockTemporalTimelineSuspects,
  gap_closure_rate: mockTemporalTimelineGapClosure,
  capture_rate: mockTemporalTimelineCaptureRate,
};

export const mockTemporalChangeLog = [
  { date: "2026-03-18", event_type: "attribution", description: "28 new members attributed from Q1 enrollment cycle", impact: "+28 members" },
  { date: "2026-03-12", event_type: "capture", description: "Dr. Patel's panel: 14 HCC suspects captured at AWV visits", impact: "+$184K annual revenue" },
  { date: "2026-03-05", event_type: "claim", description: "3 high-cost inpatient claims exceeding $50K each", impact: "$187K total cost" },
  { date: "2026-02-22", event_type: "gap", description: "42 diabetes HbA1c care gaps closed following outreach campaign", impact: "+4.2pp closure rate" },
  { date: "2026-02-15", event_type: "attribution", description: "16 members lost — moved out of service area", impact: "-16 members" },
  { date: "2026-02-08", event_type: "capture", description: "Bulk chart review completed — 38 new HCC captures across 5 providers", impact: "+$498K annual revenue" },
  { date: "2026-01-28", event_type: "claim", description: "SNF readmission cluster: 5 CHF patients readmitted within 30 days", impact: "$124K cost impact" },
  { date: "2026-01-15", event_type: "gap", description: "Breast cancer screening campaign: 67 gaps closed", impact: "+2.1pp closure rate" },
  { date: "2025-12-20", event_type: "attribution", description: "Year-end enrollment reconciliation: +45 net new members", impact: "+45 members" },
  { date: "2025-12-10", event_type: "capture", description: "Q4 retrospective review: 52 additional HCC codes identified", impact: "+$682K annual revenue" },
  { date: "2025-11-28", event_type: "claim", description: "High-cost pharmacy claims for 8 specialty medication members", impact: "$96K monthly spend" },
  { date: "2025-11-15", event_type: "gap", description: "Statin adherence follow-up: 31 gaps closed", impact: "+1.8pp closure rate" },
  { date: "2025-11-02", event_type: "attribution", description: "Mid-cycle attribution update: 22 new members from plan transfers", impact: "+22 members" },
  { date: "2025-10-18", event_type: "capture", description: "Provider education session led to 19 prospective HCC captures", impact: "+$249K annual revenue" },
  { date: "2025-10-05", event_type: "gap", description: "Colorectal screening outreach: 28 gaps closed", impact: "+1.3pp closure rate" },
];

// ---- Alert Rules Engine ----

export const mockAlertRuleMetricOptions: Record<string, { value: string; label: string }[]> = {
  member: [
    { value: "spend_12mo", label: "12-Month Spend ($)" },
    { value: "raf_score", label: "RAF Score" },
    { value: "er_visits", label: "ER Visits" },
    { value: "admissions", label: "Inpatient Admissions" },
    { value: "days_since_visit", label: "Days Since Last Visit" },
    { value: "suspect_count", label: "Open Suspect Count" },
    { value: "gap_count", label: "Open Gap Count" },
  ],
  provider: [
    { value: "capture_rate", label: "HCC Capture Rate (%)" },
    { value: "recapture_rate", label: "Recapture Rate (%)" },
    { value: "panel_pmpm", label: "Panel PMPM ($)" },
    { value: "gap_closure", label: "Gap Closure Rate (%)" },
  ],
  group: [
    { value: "avg_capture_rate", label: "Avg Capture Rate (%)" },
    { value: "group_pmpm", label: "Group PMPM ($)" },
  ],
  measure: [
    { value: "closure_rate", label: "Closure Rate (%)" },
  ],
  population: [
    { value: "avg_raf", label: "Average RAF" },
    { value: "total_pmpm", label: "Total PMPM ($)" },
    { value: "mlr", label: "Medical Loss Ratio (%)" },
    { value: "recapture_rate", label: "Recapture Rate (%)" },
  ],
};

export const mockAlertRules = [
  {
    id: 1, name: "High-cost member alert",
    description: "Alert when any member's 12-month spend exceeds $100,000",
    entity_type: "member", metric: "spend_12mo", operator: "gt", threshold: 100000,
    scope_filter: null, notify_channels: { in_app: true }, severity: "critical",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-24T14:23:00Z", trigger_count: 5, created_at: "2026-01-15T09:00:00Z",
  },
  {
    id: 2, name: "ER frequent flyer",
    description: "Alert when a member has 4 or more ER visits",
    entity_type: "member", metric: "er_visits", operator: "gte", threshold: 4,
    scope_filter: null, notify_channels: { in_app: true }, severity: "high",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-22T11:45:00Z", trigger_count: 3, created_at: "2026-01-15T09:05:00Z",
  },
  {
    id: 3, name: "Provider capture rate declining",
    description: "Alert when a provider's HCC capture rate drops below 50%",
    entity_type: "provider", metric: "capture_rate", operator: "lt", threshold: 50,
    scope_filter: null, notify_channels: { in_app: true }, severity: "medium",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-23T09:12:00Z", trigger_count: 4, created_at: "2026-01-15T09:10:00Z",
  },
  {
    id: 4, name: "Stars measure at risk",
    description: "Alert when a measure's closure rate falls below its 3-star cutpoint",
    entity_type: "measure", metric: "closure_rate", operator: "lt", threshold: 50,
    scope_filter: null, notify_channels: { in_app: true }, severity: "high",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-20T16:30:00Z", trigger_count: 2, created_at: "2026-01-15T09:15:00Z",
  },
  {
    id: 5, name: "Readmission alert",
    description: "Alert when a member has 2+ inpatient admissions (potential readmission)",
    entity_type: "member", metric: "admissions", operator: "gte", threshold: 2,
    scope_filter: null, notify_channels: { in_app: true }, severity: "high",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-21T10:05:00Z", trigger_count: 6, created_at: "2026-01-15T09:20:00Z",
  },
  {
    id: 6, name: "Member not seen",
    description: "Alert when a member has not had a visit in over 180 days",
    entity_type: "member", metric: "days_since_visit", operator: "gt", threshold: 180,
    scope_filter: null, notify_channels: { in_app: true }, severity: "medium",
    is_active: true, created_by: 2, last_evaluated: "2026-03-25T08:00:00Z",
    last_triggered: "2026-03-25T08:00:00Z", trigger_count: 12, created_at: "2026-01-15T09:25:00Z",
  },
];

export const mockAlertRuleTriggers = [
  {
    id: 1, rule_id: 1, entity_type: "member", entity_id: 5, entity_name: "Charles Jones",
    metric_value: 142350.00, threshold: 100000, message: "Member Charles Jones: spend_12mo=$142,350 > $100,000",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-24T14:23:00Z",
  },
  {
    id: 2, rule_id: 1, entity_type: "member", entity_id: 18, entity_name: "Ruth Anderson",
    metric_value: 118740.00, threshold: 100000, message: "Member Ruth Anderson: spend_12mo=$118,740 > $100,000",
    acknowledged: true, acknowledged_by: 2, created_at: "2026-03-22T09:15:00Z",
  },
  {
    id: 3, rule_id: 2, entity_type: "member", entity_id: 12, entity_name: "Harold Martin",
    metric_value: 6, threshold: 4, message: "Member Harold Martin: er_visits=6 >= 4",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-22T11:45:00Z",
  },
  {
    id: 4, rule_id: 3, entity_type: "provider", entity_id: 8, entity_name: "Dr. Robert Kim",
    metric_value: 42.1, threshold: 50, message: "Provider Dr. Kim: capture_rate=42.1% < 50%",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-23T09:12:00Z",
  },
  {
    id: 5, rule_id: 3, entity_type: "provider", entity_id: 9, entity_name: "Dr. David Wilson",
    metric_value: 45.8, threshold: 50, message: "Provider Dr. Wilson: capture_rate=45.8% < 50%",
    acknowledged: true, acknowledged_by: 2, created_at: "2026-03-23T09:12:00Z",
  },
  {
    id: 6, rule_id: 4, entity_type: "measure", entity_id: 4, entity_name: "Kidney Health Evaluation for Diabetes",
    metric_value: 41.2, threshold: 50, message: "Measure KED: closure_rate=41.2% < 50%",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-20T16:30:00Z",
  },
  {
    id: 7, rule_id: 5, entity_type: "member", entity_id: 7, entity_name: "George Miller",
    metric_value: 3, threshold: 2, message: "Member George Miller: admissions=3 >= 2",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-21T10:05:00Z",
  },
  {
    id: 8, rule_id: 6, entity_type: "member", entity_id: 22, entity_name: "Catherine Thomas",
    metric_value: 247, threshold: 180, message: "Member Catherine Thomas: days_since_visit=247 > 180",
    acknowledged: false, acknowledged_by: null, created_at: "2026-03-25T08:00:00Z",
  },
];

export const mockAlertRulePresets = [
  {
    name: "High-cost member alert",
    description: "Alert when any member's 12-month spend exceeds $100,000",
    entity_type: "member", metric: "spend_12mo", operator: "gt", threshold: 100000,
    severity: "critical", notify_channels: { in_app: true },
  },
  {
    name: "ER frequent flyer",
    description: "Alert when a member has 4 or more ER visits",
    entity_type: "member", metric: "er_visits", operator: "gte", threshold: 4,
    severity: "high", notify_channels: { in_app: true },
  },
  {
    name: "Provider capture rate declining",
    description: "Alert when a provider's HCC capture rate drops below 50%",
    entity_type: "provider", metric: "capture_rate", operator: "lt", threshold: 50,
    severity: "medium", notify_channels: { in_app: true },
  },
  {
    name: "Stars measure at risk",
    description: "Alert when a measure's closure rate falls below its 3-star cutpoint",
    entity_type: "measure", metric: "closure_rate", operator: "lt", threshold: 50,
    severity: "high", notify_channels: { in_app: true },
  },
  {
    name: "Readmission alert",
    description: "Alert when a member has 2+ inpatient admissions (potential readmission)",
    entity_type: "member", metric: "admissions", operator: "gte", threshold: 2,
    severity: "high", notify_channels: { in_app: true },
  },
  {
    name: "Member not seen",
    description: "Alert when a member has not had a visit in over 180 days",
    entity_type: "member", metric: "days_since_visit", operator: "gt", threshold: 180,
    severity: "medium", notify_channels: { in_app: true },
  },
];

// ---------------------------------------------------------------------------
// Practice Expense Management — Staff, Expense Categories, Expense Entries
// ---------------------------------------------------------------------------

export const mockStaffMembers = [
  { id: 1, name: "Dr. James Rivera", role: "physician", practice_group_id: 1, salary: 280000, benefits_cost: 56000, fte: 1.0, hire_date: "2019-03-15", is_active: true },
  { id: 2, name: "Dr. Sarah Chen", role: "physician", practice_group_id: 2, salary: 265000, benefits_cost: 53000, fte: 1.0, hire_date: "2020-07-01", is_active: true },
  { id: 3, name: "Dr. Michael Okafor", role: "physician", practice_group_id: 3, salary: 290000, benefits_cost: 58000, fte: 1.0, hire_date: "2018-01-10", is_active: true },
  { id: 4, name: "Lisa Tran, NP", role: "np", practice_group_id: 1, salary: 125000, benefits_cost: 25000, fte: 1.0, hire_date: "2021-02-14", is_active: true },
  { id: 5, name: "Marcus Johnson, NP", role: "np", practice_group_id: 4, salary: 130000, benefits_cost: 26000, fte: 1.0, hire_date: "2020-11-20", is_active: true },
  { id: 6, name: "Angela Martinez", role: "ma", practice_group_id: 1, salary: 42000, benefits_cost: 8400, fte: 1.0, hire_date: "2022-05-01", is_active: true },
  { id: 7, name: "Kevin Williams", role: "ma", practice_group_id: 2, salary: 40000, benefits_cost: 8000, fte: 1.0, hire_date: "2023-01-15", is_active: true },
  { id: 8, name: "Jessica Park", role: "ma", practice_group_id: 3, salary: 41000, benefits_cost: 8200, fte: 0.75, hire_date: "2023-08-01", is_active: true },
  { id: 9, name: "Destiny Brown", role: "ma", practice_group_id: 5, salary: 39000, benefits_cost: 7800, fte: 1.0, hire_date: "2024-03-10", is_active: true },
  { id: 10, name: "Patricia Wilson", role: "front_desk", practice_group_id: 1, salary: 38000, benefits_cost: 7600, fte: 1.0, hire_date: "2021-09-01", is_active: true },
  { id: 11, name: "Robert Garcia", role: "front_desk", practice_group_id: 3, salary: 36000, benefits_cost: 7200, fte: 0.5, hire_date: "2023-06-15", is_active: true },
  { id: 12, name: "Diana Lee", role: "biller", practice_group_id: null, salary: 52000, benefits_cost: 10400, fte: 1.0, hire_date: "2020-04-01", is_active: true },
  { id: 13, name: "Thomas Wright", role: "coder", practice_group_id: null, salary: 58000, benefits_cost: 11600, fte: 1.0, hire_date: "2021-01-15", is_active: true },
  { id: 14, name: "Sandra Nguyen", role: "care_manager", practice_group_id: null, salary: 72000, benefits_cost: 14400, fte: 1.0, hire_date: "2022-10-01", is_active: true },
  { id: 15, name: "James Cooper", role: "admin", practice_group_id: null, salary: 65000, benefits_cost: 13000, fte: 1.0, hire_date: "2019-08-15", is_active: true },
];

export const mockExpenseCategories = [
  { id: 1, name: "Staffing", budget_annual: 1850000, parent_category_id: null },
  { id: 2, name: "Supplies", budget_annual: 36000, parent_category_id: null },
  { id: 3, name: "Rent & Facilities", budget_annual: 96000, parent_category_id: null },
  { id: 4, name: "Software & IT", budget_annual: 24000, parent_category_id: null },
  { id: 5, name: "Equipment", budget_annual: 18000, parent_category_id: null },
  { id: 6, name: "Insurance", budget_annual: 48000, parent_category_id: null },
  { id: 7, name: "Marketing", budget_annual: 12000, parent_category_id: null },
];

export const mockExpenseEntries = [
  { id: 1, category_id: 3, description: "Office rent — Main Location", amount: 8000, expense_date: "2026-03-01", practice_group_id: 1, vendor: "Westfield Properties", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 2, category_id: 2, description: "Medical supplies — March", amount: 2850, expense_date: "2026-03-05", practice_group_id: 1, vendor: "McKesson Medical", recurring: true, recurring_frequency: "monthly", notes: "Includes gloves, syringes, gauze" },
  { id: 3, category_id: 4, description: "EHR license — monthly", amount: 1800, expense_date: "2026-03-01", practice_group_id: null, vendor: "AthenaHealth", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 4, category_id: 6, description: "Malpractice insurance — Q1", amount: 12000, expense_date: "2026-01-15", practice_group_id: null, vendor: "Medical Protective", recurring: true, recurring_frequency: "quarterly", notes: "Covers 3 physicians, 2 NPs" },
  { id: 5, category_id: 7, description: "Google Ads campaign", amount: 950, expense_date: "2026-03-10", practice_group_id: null, vendor: "Google Ads", recurring: true, recurring_frequency: "monthly", notes: "Patient acquisition" },
  { id: 6, category_id: 2, description: "Office supplies — printer paper, toner", amount: 340, expense_date: "2026-03-12", practice_group_id: 2, vendor: "Staples", recurring: false, recurring_frequency: null, notes: null },
  { id: 7, category_id: 5, description: "Blood pressure monitors (x4)", amount: 1200, expense_date: "2026-02-20", practice_group_id: null, vendor: "Omron Healthcare", recurring: false, recurring_frequency: null, notes: "Replacement for aging units" },
  { id: 8, category_id: 3, description: "Office rent — Satellite", amount: 4500, expense_date: "2026-03-01", practice_group_id: 3, vendor: "Oakwood Realty", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 9, category_id: 4, description: "Telehealth platform", amount: 450, expense_date: "2026-03-01", practice_group_id: null, vendor: "Doxy.me", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 10, category_id: 2, description: "Lab supplies restock", amount: 1650, expense_date: "2026-03-08", practice_group_id: 2, vendor: "Fisher Scientific", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 11, category_id: 6, description: "General liability insurance", amount: 2200, expense_date: "2026-03-01", practice_group_id: null, vendor: "Hartford Insurance", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 12, category_id: 5, description: "Exam table — new office", amount: 3200, expense_date: "2026-01-25", practice_group_id: 5, vendor: "Midmark Corp", recurring: false, recurring_frequency: null, notes: "For new satellite location" },
  { id: 13, category_id: 7, description: "Community health fair sponsorship", amount: 500, expense_date: "2026-02-15", practice_group_id: null, vendor: "Community Health Network", recurring: false, recurring_frequency: null, notes: "Annual event" },
  { id: 14, category_id: 4, description: "Cybersecurity software", amount: 280, expense_date: "2026-03-01", practice_group_id: null, vendor: "CrowdStrike", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 15, category_id: 2, description: "PPE supplies — N95 masks", amount: 420, expense_date: "2026-03-15", practice_group_id: null, vendor: "3M Healthcare", recurring: false, recurring_frequency: null, notes: "Quarterly restock" },
  { id: 16, category_id: 3, description: "Janitorial service", amount: 1200, expense_date: "2026-03-01", practice_group_id: 1, vendor: "CleanCare Services", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 17, category_id: 5, description: "Digital scale (x2)", amount: 380, expense_date: "2026-03-03", practice_group_id: 4, vendor: "Detecto", recurring: false, recurring_frequency: null, notes: null },
  { id: 18, category_id: 6, description: "Workers comp insurance", amount: 850, expense_date: "2026-03-01", practice_group_id: null, vendor: "State Fund", recurring: true, recurring_frequency: "monthly", notes: null },
  { id: 19, category_id: 2, description: "Vaccine supplies — flu season", amount: 2100, expense_date: "2026-02-01", practice_group_id: null, vendor: "Sanofi Pasteur", recurring: false, recurring_frequency: null, notes: "Special order for flu drive" },
  { id: 20, category_id: 4, description: "Analytics platform subscription", amount: 600, expense_date: "2026-03-01", practice_group_id: null, vendor: "AQSoft Health", recurring: true, recurring_frequency: "monthly", notes: null },
];

export const mockExpenseDashboard = {
  total_budget: 2084000,
  total_actual: 1636200,
  budget_utilization: 78.5,
  staffing_cost: 1473600,
  categories: [
    { name: "Staffing", budget_annual: 1850000, actual_ytd: 1473600, pct_of_budget: 79.7, variance: 376400 },
    { name: "Supplies", budget_annual: 36000, actual_ytd: 27360, pct_of_budget: 76.0, variance: 8640 },
    { name: "Rent & Facilities", budget_annual: 96000, actual_ytd: 82200, pct_of_budget: 85.6, variance: 13800 },
    { name: "Software & IT", budget_annual: 24000, actual_ytd: 18780, pct_of_budget: 78.3, variance: 5220 },
    { name: "Equipment", budget_annual: 18000, actual_ytd: 14780, pct_of_budget: 82.1, variance: 3220 },
    { name: "Insurance", budget_annual: 48000, actual_ytd: 15050, pct_of_budget: 31.4, variance: 32950 },
    { name: "Marketing", budget_annual: 12000, actual_ytd: 4430, pct_of_budget: 36.9, variance: 7570 },
  ],
};

export const mockStaffingAnalysis = {
  total_staff: 15,
  total_cost: 1473600,
  provider_count: 5,
  staff_to_provider_ratio: 3.0,
  staff_to_member_ratio: 3.1, // per 1000 members
  by_role: [
    { role: "physician", count: 3, total_salary: 835000, total_benefits: 167000, total_cost: 1002000, total_fte: 3.0 },
    { role: "np", count: 2, total_salary: 255000, total_benefits: 51000, total_cost: 306000, total_fte: 2.0 },
    { role: "ma", count: 4, total_salary: 162000, total_benefits: 32400, total_cost: 194400, total_fte: 3.75 },
    { role: "front_desk", count: 2, total_salary: 74000, total_benefits: 14800, total_cost: 88800, total_fte: 1.5 },
    { role: "biller", count: 1, total_salary: 52000, total_benefits: 10400, total_cost: 62400, total_fte: 1.0 },
    { role: "coder", count: 1, total_salary: 58000, total_benefits: 11600, total_cost: 69600, total_fte: 1.0 },
    { role: "care_manager", count: 1, total_salary: 72000, total_benefits: 14400, total_cost: 86400, total_fte: 1.0 },
    { role: "admin", count: 1, total_salary: 65000, total_benefits: 13000, total_cost: 78000, total_fte: 1.0 },
  ],
  benchmarks: {
    staff_to_provider: { current: 3.0, benchmark: 2.5, status: "above" },
    ma_to_provider: { current: 0.8, benchmark: 1.5, status: "below" },
    front_desk_to_provider: { current: 0.4, benchmark: 0.5, status: "below" },
    staff_per_1000_members: { current: 3.1, benchmark: 3.5, status: "below" },
  },
  ai_recommendations: [
    { type: "warning", message: "MA-to-provider ratio (0.8) is below the 1.5 benchmark. Consider hiring 1 additional MA to reduce provider burnout and improve throughput." },
    { type: "info", message: "Front desk staffing (0.4 per provider) is slightly below benchmark. Part-time hire could improve patient scheduling efficiency." },
    { type: "success", message: "Billing staff ratio is optimal for current panel size. No changes needed." },
    { type: "info", message: "Care manager caseload is 4,832 members. Industry benchmark is 3,000-4,000. Consider adding a part-time care manager as panel grows." },
  ],
};

export const mockExpenseTrends = [
  { month: "2025-10", staffing: 122800, supplies: 2280, rent: 6850, software: 1565, equipment: 580, insurance: 1250, marketing: 370 },
  { month: "2025-11", staffing: 122800, supplies: 2440, rent: 6850, software: 1565, equipment: 0, insurance: 1250, marketing: 450 },
  { month: "2025-12", staffing: 122800, supplies: 2100, rent: 6850, software: 1565, equipment: 1200, insurance: 13250, marketing: 500 },
  { month: "2026-01", staffing: 122800, supplies: 2850, rent: 6850, software: 1565, equipment: 3200, insurance: 12850, marketing: 0 },
  { month: "2026-02", staffing: 122800, supplies: 3750, rent: 6850, software: 1565, equipment: 0, insurance: 1250, marketing: 500 },
  { month: "2026-03", staffing: 122800, supplies: 3260, rent: 6850, software: 1565, equipment: 380, insurance: 3050, marketing: 950 },
];

export const mockEfficiencyMetrics = {
  total_staff: 15,
  total_expenses: 1636200,
  expense_per_staff: 109080,
  revenue_per_staff: 401280, // $6.019M total / 15
  cost_per_member: 338.75, // $1.636M / 4832 members
  overhead_ratio: 10.2, // non-staffing costs as % of total
  supply_cost_per_visit: 4.25, // $27.3K supplies / ~6400 visits
  staffing_pct_of_revenue: 24.5, // $1.474M / $6.019M
  benchmarks: {
    revenue_per_staff: { current: 401280, benchmark: 350000, status: "above", label: "Revenue per Staff" },
    cost_per_member: { current: 338.75, benchmark: 400, status: "below", label: "Cost per Member" },
    overhead_ratio: { current: 10.2, benchmark: 12, status: "below", label: "Overhead Ratio %" },
    supply_cost_per_visit: { current: 4.25, benchmark: 5.50, status: "below", label: "Supply Cost per Visit" },
    staffing_pct_of_revenue: { current: 24.5, benchmark: 30, status: "below", label: "Staffing % of Revenue" },
  },
};

export const mockHiringAnalysis = {
  current_staff: 15,
  current_cost: 1473600,
  monthly_revenue: 501600,
  provider_count: 5,
  panel_size: 4832,
  staff_to_provider_ratio: 3.0,
  financial_capacity: {
    annual_surplus: 842400,
    max_new_hire_budget: 85000,
    surplus_after_hire: 757400,
    can_hire: true,
  },
  recommended_hires: [
    {
      role: "ma",
      title: "Medical Assistant",
      estimated_salary: 42000,
      estimated_benefits: 8400,
      total_cost: 50400,
      impact: "Reduce provider documentation burden by ~30 min/day. Improve patient throughput by 2-3 visits/day per provider.",
      revenue_impact: 156000,
      break_even_months: 4,
      priority: "high",
    },
    {
      role: "care_manager",
      title: "Part-Time Care Manager",
      estimated_salary: 36000,
      estimated_benefits: 7200,
      total_cost: 43200,
      impact: "Reduce caseload to 2,416 per CM. Improve chronic care management billing and gap closure rates.",
      revenue_impact: 98000,
      break_even_months: 6,
      priority: "medium",
    },
    {
      role: "front_desk",
      title: "Part-Time Front Desk",
      estimated_salary: 19000,
      estimated_benefits: 3800,
      total_cost: 22800,
      impact: "Reduce phone wait times. Improve AWV scheduling rate by ~15%.",
      revenue_impact: 48000,
      break_even_months: 7,
      priority: "low",
    },
  ],
};

// ---------------------------------------------------------------------------
// BOI (Benefit of Investment) Analytics — Interventions
// ---------------------------------------------------------------------------

export const mockInterventions = [
  {
    id: 1,
    name: "Diabetes Coding Education Program",
    description: "Trained 5 providers on proper HCC coding for diabetes with complications (HCC 37/38). Included documentation templates, coding cheat sheets, and monthly audit feedback.",
    intervention_type: "education",
    target: "diabetes_capture",
    investment_amount: 18500,
    investment_period: "one_time",
    start_date: "2025-07-01",
    end_date: "2025-12-31",
    baseline_metric: 52.3,
    current_metric: 74.1,
    metric_name: "capture_rate",
    estimated_return: 55000,
    actual_return: 81400,
    roi_percentage: 340,
    affected_members: 342,
    affected_providers: 5,
    status: "completed",
    timeline: [
      { month: "2025-07", metric: 52.3, label: "Baseline" },
      { month: "2025-08", metric: 55.8, label: "Month 1" },
      { month: "2025-09", metric: 60.2, label: "Month 2" },
      { month: "2025-10", metric: 65.7, label: "Month 3" },
      { month: "2025-11", metric: 70.4, label: "Month 4" },
      { month: "2025-12", metric: 74.1, label: "Month 5" },
    ],
  },
  {
    id: 2,
    name: "Readmission Prevention Program",
    description: "Implemented 48-hour post-discharge follow-up calls and care transition coordination for high-risk members. Partnered with SNFs for warm handoffs.",
    intervention_type: "program",
    target: "readmission_reduction",
    investment_amount: 42000,
    investment_period: "annual",
    start_date: "2025-09-01",
    end_date: null,
    baseline_metric: 18.4,
    current_metric: 11.2,
    metric_name: "readmit_rate",
    estimated_return: 100000,
    actual_return: 159600,
    roi_percentage: 280,
    affected_members: 189,
    affected_providers: 5,
    status: "active",
    timeline: [
      { month: "2025-09", metric: 18.4, label: "Baseline" },
      { month: "2025-10", metric: 16.8, label: "Month 1" },
      { month: "2025-11", metric: 14.5, label: "Month 2" },
      { month: "2025-12", metric: 13.1, label: "Month 3" },
      { month: "2026-01", metric: 12.4, label: "Month 4" },
      { month: "2026-02", metric: 11.8, label: "Month 5" },
      { month: "2026-03", metric: 11.2, label: "Month 6" },
    ],
  },
  {
    id: 3,
    name: "Statin Adherence Outreach",
    description: "Pharmacy-led outreach to non-adherent statin patients. Included medication therapy management calls, adherence packaging, and 90-day supply conversions.",
    intervention_type: "outreach",
    target: "gap_closure",
    investment_amount: 8200,
    investment_period: "one_time",
    start_date: "2025-10-15",
    end_date: "2026-01-31",
    baseline_metric: 64.0,
    current_metric: 82.5,
    metric_name: "gap_closure",
    estimated_return: 35000,
    actual_return: 50840,
    roi_percentage: 520,
    affected_members: 267,
    affected_providers: 3,
    status: "completed",
    timeline: [
      { month: "2025-10", metric: 64.0, label: "Baseline" },
      { month: "2025-11", metric: 69.3, label: "Month 1" },
      { month: "2025-12", metric: 75.8, label: "Month 2" },
      { month: "2026-01", metric: 82.5, label: "Month 3" },
    ],
  },
  {
    id: 4,
    name: "AWV Scheduling Campaign",
    description: "Dedicated outbound calling campaign for Annual Wellness Visits. Front desk trained on scheduling scripts, automated reminder texts, and provider schedule optimization.",
    intervention_type: "process",
    target: "gap_closure",
    investment_amount: 4800,
    investment_period: "one_time",
    start_date: "2025-08-01",
    end_date: "2025-11-30",
    baseline_metric: 38.0,
    current_metric: 67.2,
    metric_name: "gap_closure",
    estimated_return: 30000,
    actual_return: 47520,
    roi_percentage: 890,
    affected_members: 4832,
    affected_providers: 5,
    status: "completed",
    timeline: [
      { month: "2025-08", metric: 38.0, label: "Baseline" },
      { month: "2025-09", metric: 45.6, label: "Month 1" },
      { month: "2025-10", metric: 54.3, label: "Month 2" },
      { month: "2025-11", metric: 67.2, label: "Month 3" },
    ],
  },
  {
    id: 5,
    name: "Care Manager Hire",
    description: "Added a dedicated care manager (Sandra Nguyen) for chronic disease management, care transitions, and proactive outreach to high-risk members.",
    intervention_type: "staffing",
    target: "cost_reduction",
    investment_amount: 86400,
    investment_period: "annual",
    start_date: "2022-10-01",
    end_date: null,
    baseline_metric: 1340,
    current_metric: 1247,
    metric_name: "pmpm",
    estimated_return: 150000,
    actual_return: 267840,
    roi_percentage: 210,
    affected_members: 4832,
    affected_providers: 5,
    status: "active",
    timeline: [
      { month: "2022-10", metric: 1340, label: "Baseline" },
      { month: "2023-03", metric: 1318, label: "6 Months" },
      { month: "2023-09", metric: 1295, label: "12 Months" },
      { month: "2024-03", metric: 1280, label: "18 Months" },
      { month: "2024-09", metric: 1265, label: "24 Months" },
      { month: "2025-03", metric: 1255, label: "30 Months" },
      { month: "2025-09", metric: 1250, label: "36 Months" },
      { month: "2026-03", metric: 1247, label: "42 Months" },
    ],
  },
];

export const mockBOIDashboard = {
  interventions: mockInterventions,
  total_invested: 159900,
  total_returned: 607200,
  avg_roi: 448,
  intervention_count: 5,
};

export const mockBOIRecommendations = [
  {
    id: "rec-1",
    name: "CKD Coding & Documentation Improvement",
    description: "Current CKD capture rate is 41%. Industry benchmark is 65%. A targeted education program for CKD staging documentation could capture an additional $180K in RAF revenue.",
    intervention_type: "education",
    target: "diabetes_capture",
    estimated_investment: 12000,
    estimated_return: 180000,
    estimated_roi: 1400,
    confidence: 85,
    rationale: "267 members with CKD diagnoses but only 41% are captured in current year. V28 model increases CKD coefficient by 18%.",
  },
  {
    id: "rec-2",
    name: "Depression Screening Initiative",
    description: "PHQ-9 screening rate is only 28%. Adding systematic screening at AWVs and chronic care visits could close 340+ gaps and improve Stars measures.",
    intervention_type: "process",
    target: "gap_closure",
    estimated_investment: 3500,
    estimated_return: 52000,
    estimated_roi: 1385,
    confidence: 78,
    rationale: "Depression screening (C12Q) is one of the lowest-performing Stars measures. Quick-win with workflow changes.",
  },
  {
    id: "rec-3",
    name: "High-Risk Member Home Visit Program",
    description: "Top 50 high-cost members account for 22% of total spend. Home visits with NP + care manager could reduce ER visits by 35% and inpatient admits by 25%.",
    intervention_type: "program",
    target: "cost_reduction",
    estimated_investment: 65000,
    estimated_return: 285000,
    estimated_roi: 338,
    confidence: 72,
    rationale: "Based on similar programs at peer MSOs. Requires NP time allocation and transportation logistics.",
  },
];

// ==========================================================================
// Clinical Data Exchange
// ==========================================================================

export const mockExchangeDashboard = {
  total_requests: 8,
  auto_responded: 3,
  pending: 3,
  completed: 2,
  avg_response_hours: 4.2,
  auto_respond_rate: 37.5,
  requests_this_month: 5,
  requests_last_month: 3,
};

export const mockExchangeRequests = [
  {
    id: 1,
    request_type: "hcc_evidence",
    requestor: "Aetna Medicare",
    member_id: 1042,
    member_name: "Margaret Sullivan",
    hcc_code: 19,
    hcc_label: "Diabetes with Chronic Complications",
    measure_code: null,
    status: "auto_responded",
    request_date: "2026-03-10",
    response_date: "2026-03-10",
    auto_generated: true,
    notes: "Routine chart request for HCC validation",
  },
  {
    id: 2,
    request_type: "quality_evidence",
    requestor: "Humana Gold Plus",
    member_id: 2087,
    member_name: "Robert Chen",
    hcc_code: null,
    hcc_label: null,
    measure_code: "C01-HbA1c",
    status: "auto_responded",
    request_date: "2026-03-08",
    response_date: "2026-03-08",
    auto_generated: true,
    notes: "Stars measure documentation request",
  },
  {
    id: 3,
    request_type: "radv_audit",
    requestor: "CMS RADV",
    member_id: 3156,
    member_name: "Dorothy Williams",
    hcc_code: null,
    hcc_label: null,
    measure_code: null,
    status: "auto_responded",
    request_date: "2026-03-05",
    response_date: "2026-03-06",
    auto_generated: true,
    notes: "RADV audit year 2025",
  },
  {
    id: 4,
    request_type: "hcc_evidence",
    requestor: "UnitedHealthcare",
    member_id: 4201,
    member_name: "James Patterson",
    hcc_code: 85,
    hcc_label: "Congestive Heart Failure",
    measure_code: null,
    status: "pending",
    request_date: "2026-03-18",
    response_date: null,
    auto_generated: false,
    notes: "Requesting supporting documentation for CHF diagnosis",
  },
  {
    id: 5,
    request_type: "chart_request",
    requestor: "Anthem Blue Cross",
    member_id: 5044,
    member_name: "Patricia Gonzalez",
    hcc_code: 111,
    hcc_label: "COPD",
    measure_code: null,
    status: "pending",
    request_date: "2026-03-20",
    response_date: null,
    auto_generated: false,
    notes: "Full chart request for COPD documentation",
  },
  {
    id: 6,
    request_type: "quality_evidence",
    requestor: "Humana Gold Plus",
    member_id: 6078,
    member_name: "Helen Nakamura",
    hcc_code: null,
    hcc_label: null,
    measure_code: "C09-BPControl",
    status: "pending",
    request_date: "2026-03-22",
    response_date: null,
    auto_generated: false,
    notes: "Blood pressure control measure evidence needed",
  },
  {
    id: 7,
    request_type: "hcc_evidence",
    requestor: "Aetna Medicare",
    member_id: 7112,
    member_name: "Frank Morrison",
    hcc_code: 18,
    hcc_label: "Diabetes without Chronic Complications",
    measure_code: null,
    status: "completed",
    request_date: "2026-02-15",
    response_date: "2026-02-18",
    auto_generated: false,
    notes: "Manual review completed - evidence accepted by payer",
  },
  {
    id: 8,
    request_type: "radv_audit",
    requestor: "CMS RADV",
    member_id: 8045,
    member_name: "Virginia Baker",
    hcc_code: null,
    hcc_label: null,
    measure_code: null,
    status: "completed",
    request_date: "2026-02-01",
    response_date: "2026-02-10",
    auto_generated: false,
    notes: "Full RADV audit package submitted and validated",
  },
];

export const mockEvidencePackageExample = {
  request_id: 1,
  member_id: 1042,
  member_name: "Margaret Sullivan",
  hcc_code: 19,
  hcc_label: "Diabetes with Chronic Complications",
  package_type: "hcc_evidence",
  generated_at: "2026-03-10T14:32:00Z",
  supporting_claims: [
    { claim_id: "CLM-20260108-001", date_of_service: "2026-01-08", provider: "Dr. James Rivera", diagnosis_codes: ["E11.65", "E11.22"], cpt_codes: ["99214", "83036"], facility: "AQSoft Demo Medical Group" },
    { claim_id: "CLM-20251012-042", date_of_service: "2025-10-12", provider: "Dr. James Rivera", diagnosis_codes: ["E11.65"], cpt_codes: ["99213", "82947"], facility: "AQSoft Demo Medical Group" },
    { claim_id: "CLM-20250715-018", date_of_service: "2025-07-15", provider: "Dr. Lisa Park", diagnosis_codes: ["E11.65", "E11.40"], cpt_codes: ["99214", "83036", "81003"], facility: "Sunrise Family Medicine" },
  ],
  meat_documentation: {
    monitored: { status: true, evidence: "HbA1c monitored quarterly - 3 results in past 12 months (8.2%, 7.9%, 7.6%)" },
    evaluated: { status: true, evidence: "Comprehensive metabolic panel, lipid panel, renal function assessed at each visit" },
    assessed: { status: true, evidence: "Assessment documented at all 3 visits: 'Diabetes with chronic kidney disease, improving control'" },
    treated: { status: true, evidence: "Metformin 1000mg BID, Jardiance 25mg daily, insulin glargine 20 units QHS" },
    overall_score: 95,
  },
  medication_support: [
    { drug: "Metformin 1000mg", start_date: "2024-03-15", prescriber: "Dr. James Rivera", implies: "Type 2 Diabetes management" },
    { drug: "Jardiance 25mg", start_date: "2025-02-01", prescriber: "Dr. James Rivera", implies: "Diabetes with renal protection" },
    { drug: "Insulin Glargine 20u", start_date: "2025-07-15", prescriber: "Dr. Lisa Park", implies: "Advanced diabetes requiring insulin" },
  ],
  lab_results: [
    { test: "HbA1c", date: "2026-01-08", result: "7.6%", reference_range: "<7.0%", interpretation: "Above target but improving" },
    { test: "HbA1c", date: "2025-10-12", result: "7.9%", reference_range: "<7.0%", interpretation: "Above target" },
    { test: "HbA1c", date: "2025-07-15", result: "8.2%", reference_range: "<7.0%", interpretation: "Poor control" },
    { test: "eGFR", date: "2026-01-08", result: "52 mL/min", reference_range: ">60 mL/min", interpretation: "Stage 3a CKD" },
    { test: "Urine Albumin/Creatinine", date: "2026-01-08", result: "145 mg/g", reference_range: "<30 mg/g", interpretation: "Moderate albuminuria" },
  ],
  documentation_timeline: [
    { date: "2025-07-15", event: "Office visit - comprehensive diabetes evaluation", provider: "Dr. Lisa Park" },
    { date: "2025-10-12", event: "Follow-up visit - medication adjustment", provider: "Dr. James Rivera" },
    { date: "2025-11-20", event: "Ophthalmology referral - diabetic retinopathy screening", provider: "Dr. James Rivera" },
    { date: "2026-01-08", event: "Quarterly follow-up - HbA1c improving", provider: "Dr. James Rivera" },
  ],
  evidence_strength: "strong",
  recommendation: "Auto-submit - all MEAT criteria met with strong supporting evidence",
};


// ==========================================================================
// Risk / Capitation Accounting
// ==========================================================================

export const mockCapitationPayments = [
  // Aetna Medicare Advantage - 6 months
  { id: 1, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2025-10-01", member_count: 1842, pmpm_rate: 1150.00, total_payment: 2118300.00, adjustment_amount: null, notes: null },
  { id: 2, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2025-11-01", member_count: 1856, pmpm_rate: 1150.00, total_payment: 2134400.00, adjustment_amount: 12500.00, notes: "Retro adjustment for Q3 enrollment true-up" },
  { id: 3, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2025-12-01", member_count: 1861, pmpm_rate: 1150.00, total_payment: 2140150.00, adjustment_amount: null, notes: null },
  { id: 4, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2026-01-01", member_count: 1878, pmpm_rate: 1185.00, total_payment: 2225430.00, adjustment_amount: null, notes: "New rate effective Jan 2026" },
  { id: 5, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2026-02-01", member_count: 1890, pmpm_rate: 1185.00, total_payment: 2239650.00, adjustment_amount: -8200.00, notes: "Disenrollment adjustment" },
  { id: 6, plan_name: "Aetna Medicare Advantage", product_type: "MA", payment_month: "2026-03-01", member_count: 1895, pmpm_rate: 1185.00, total_payment: 2245575.00, adjustment_amount: null, notes: null },

  // Humana Gold Plus - 6 months
  { id: 7, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2025-10-01", member_count: 1245, pmpm_rate: 1280.00, total_payment: 1593600.00, adjustment_amount: null, notes: null },
  { id: 8, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2025-11-01", member_count: 1252, pmpm_rate: 1280.00, total_payment: 1602560.00, adjustment_amount: null, notes: null },
  { id: 9, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2025-12-01", member_count: 1260, pmpm_rate: 1280.00, total_payment: 1612800.00, adjustment_amount: 18700.00, notes: "Quality bonus payment" },
  { id: 10, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2026-01-01", member_count: 1275, pmpm_rate: 1310.00, total_payment: 1670250.00, adjustment_amount: null, notes: "New rate effective Jan 2026" },
  { id: 11, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2026-02-01", member_count: 1282, pmpm_rate: 1310.00, total_payment: 1679420.00, adjustment_amount: null, notes: null },
  { id: 12, plan_name: "Humana Gold Plus", product_type: "MAPD", payment_month: "2026-03-01", member_count: 1290, pmpm_rate: 1310.00, total_payment: 1689900.00, adjustment_amount: null, notes: null },

  // UnitedHealthcare DSNP - 6 months
  { id: 13, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2025-10-01", member_count: 620, pmpm_rate: 1520.00, total_payment: 942400.00, adjustment_amount: null, notes: null },
  { id: 14, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2025-11-01", member_count: 628, pmpm_rate: 1520.00, total_payment: 954560.00, adjustment_amount: null, notes: null },
  { id: 15, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2025-12-01", member_count: 635, pmpm_rate: 1520.00, total_payment: 965200.00, adjustment_amount: 5400.00, notes: "Retro enrollment true-up" },
  { id: 16, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2026-01-01", member_count: 642, pmpm_rate: 1560.00, total_payment: 1001520.00, adjustment_amount: null, notes: null },
  { id: 17, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2026-02-01", member_count: 648, pmpm_rate: 1560.00, total_payment: 1010880.00, adjustment_amount: null, notes: null },
  { id: 18, plan_name: "UHC Dual Complete", product_type: "DSNP", payment_month: "2026-03-01", member_count: 655, pmpm_rate: 1560.00, total_payment: 1021800.00, adjustment_amount: null, notes: null },

  // Anthem Commercial - 6 months
  { id: 19, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2025-10-01", member_count: 425, pmpm_rate: 680.00, total_payment: 289000.00, adjustment_amount: null, notes: null },
  { id: 20, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2025-11-01", member_count: 430, pmpm_rate: 680.00, total_payment: 292400.00, adjustment_amount: null, notes: null },
  { id: 21, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2025-12-01", member_count: 428, pmpm_rate: 680.00, total_payment: 291040.00, adjustment_amount: null, notes: null },
  { id: 22, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2026-01-01", member_count: 435, pmpm_rate: 695.00, total_payment: 302325.00, adjustment_amount: null, notes: null },
  { id: 23, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2026-02-01", member_count: 440, pmpm_rate: 695.00, total_payment: 305800.00, adjustment_amount: null, notes: null },
  { id: 24, plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", payment_month: "2026-03-01", member_count: 442, pmpm_rate: 695.00, total_payment: 307190.00, adjustment_amount: null, notes: null },
];

export const mockSubcapPayments = [
  { id: 1, provider_id: 1, group_name: "Rivera Primary Care", specialty: "Primary Care", payment_month: "2026-03-01", member_count: 980, pmpm_rate: 85.00, total_payment: 83300.00 },
  { id: 2, provider_id: 2, group_name: "Park Family Medicine", specialty: "Primary Care", payment_month: "2026-03-01", member_count: 720, pmpm_rate: 85.00, total_payment: 61200.00 },
  { id: 3, provider_id: null, group_name: "Valley Cardiology Associates", specialty: "Cardiology", payment_month: "2026-03-01", member_count: 1450, pmpm_rate: 42.00, total_payment: 60900.00 },
  { id: 4, provider_id: null, group_name: "Metro Behavioral Health", specialty: "Behavioral Health", payment_month: "2026-03-01", member_count: 2100, pmpm_rate: 28.00, total_payment: 58800.00 },
  { id: 5, provider_id: null, group_name: "Pacific Imaging Center", specialty: "Radiology", payment_month: "2026-03-01", member_count: 4282, pmpm_rate: 15.50, total_payment: 66371.00 },
];

export const mockRiskPools = [
  {
    id: 1,
    plan_name: "Aetna Medicare Advantage",
    pool_year: 2025,
    withhold_percentage: 10.0,
    total_withheld: 1280000.00,
    quality_bonus_earned: 384000.00,
    surplus_share: 520000.00,
    deficit_share: null,
    settlement_date: null,
    status: "active",
  },
  {
    id: 2,
    plan_name: "Humana Gold Plus",
    pool_year: 2025,
    withhold_percentage: 12.0,
    total_withheld: 1152000.00,
    quality_bonus_earned: 288000.00,
    surplus_share: 195000.00,
    deficit_share: null,
    settlement_date: null,
    status: "active",
  },
  {
    id: 3,
    plan_name: "UHC Dual Complete",
    pool_year: 2025,
    withhold_percentage: 8.0,
    total_withheld: 475000.00,
    quality_bonus_earned: 118750.00,
    surplus_share: null,
    deficit_share: 62000.00,
    settlement_date: null,
    status: "active",
  },
  {
    id: 4,
    plan_name: "Anthem Blue Cross Commercial",
    pool_year: 2025,
    withhold_percentage: 5.0,
    total_withheld: 87500.00,
    quality_bonus_earned: null,
    surplus_share: 42000.00,
    deficit_share: null,
    settlement_date: "2026-03-15",
    status: "settled",
  },
];

export const mockRiskIBNR = {
  total_estimate: 342000,
  confidence: 89,
  completion_factor: 0.94,
  as_of_date: "2026-03-26",
  by_category: [
    { category: "Inpatient", estimate: 145000, confidence: 85, avg_lag_days: 42 },
    { category: "Outpatient", estimate: 82000, confidence: 92, avg_lag_days: 28 },
    { category: "Professional", estimate: 55000, confidence: 94, avg_lag_days: 21 },
    { category: "Pharmacy", estimate: 28000, confidence: 96, avg_lag_days: 14 },
    { category: "Behavioral Health", estimate: 18000, confidence: 88, avg_lag_days: 35 },
    { category: "Other", estimate: 14000, confidence: 82, avg_lag_days: 45 },
  ],
  monthly_trend: [
    { month: "2025-10", estimate: 380000 },
    { month: "2025-11", estimate: 365000 },
    { month: "2025-12", estimate: 358000 },
    { month: "2026-01", estimate: 352000 },
    { month: "2026-02", estimate: 348000 },
    { month: "2026-03", estimate: 342000 },
  ],
};

export const mockSurplusDeficitByPlan = [
  { plan_name: "Aetna Medicare Advantage", cap_revenue: 13103505, medical_spend: 10744874, admin_costs: 655175, surplus_deficit: 1703456, mlr: 0.82 },
  { plan_name: "Humana Gold Plus", cap_revenue: 9848530, medical_spend: 8370251, admin_costs: 492427, surplus_deficit: 985852, mlr: 0.85 },
  { plan_name: "UHC Dual Complete", cap_revenue: 5896360, medical_spend: 5424148, admin_costs: 294818, surplus_deficit: 177394, mlr: 0.92 },
  { plan_name: "Anthem Blue Cross Commercial", cap_revenue: 1787755, medical_spend: 1465558, admin_costs: 89388, surplus_deficit: 232809, mlr: 0.82 },
];

export const mockSurplusDeficitByGroup = [
  { group_name: "Rivera Primary Care", members: 980, cap_allocated: 1421000, medical_spend: 1108380, admin_costs: 71050, surplus_deficit: 241570, mlr: 0.78 },
  { group_name: "Park Family Medicine", members: 720, cap_allocated: 1044000, medical_spend: 856080, admin_costs: 52200, surplus_deficit: 135720, mlr: 0.82 },
  { group_name: "Valley Cardiology Associates", members: 1450, cap_allocated: 2102500, medical_spend: 1870225, admin_costs: 105125, surplus_deficit: 127150, mlr: 0.89 },
  { group_name: "Metro Behavioral Health", members: 2100, cap_allocated: 3045000, medical_spend: 2588250, admin_costs: 152250, surplus_deficit: 304500, mlr: 0.85 },
  { group_name: "Pacific Imaging Center", members: 4282, cap_allocated: 6208900, medical_spend: 5712188, admin_costs: 310445, surplus_deficit: 186267, mlr: 0.92 },
  { group_name: "Sunrise Endocrinology", members: 380, cap_allocated: 551000, medical_spend: 501410, admin_costs: 27550, surplus_deficit: 22040, mlr: 0.91 },
  { group_name: "Coastal Nephrology Group", members: 295, cap_allocated: 427750, medical_spend: 414098, admin_costs: 21388, surplus_deficit: -7736, mlr: 0.968 },
];

export const mockRiskDashboard = {
  total_cap_revenue: 30636150,
  total_medical_spend: 26004831,
  total_admin_costs: 1531808,
  surplus_deficit: 3099511,
  mlr: 0.849,
  ibnr_estimate: 342000,
  member_months: 24846,
  pmpm_revenue: 1233,
  pmpm_spend: 1047,
  by_plan: [
    { plan_name: "Aetna Medicare Advantage", product_type: "MA", cap_revenue: 13103505, medical_spend: 10744874, mlr: 0.82, member_count: 1895 },
    { plan_name: "Humana Gold Plus", product_type: "MAPD", cap_revenue: 9848530, medical_spend: 8370251, mlr: 0.85, member_count: 1290 },
    { plan_name: "UHC Dual Complete", product_type: "DSNP", cap_revenue: 5896360, medical_spend: 5424148, mlr: 0.92, member_count: 655 },
    { plan_name: "Anthem Blue Cross Commercial", product_type: "commercial", cap_revenue: 1787755, medical_spend: 1465558, mlr: 0.82, member_count: 442 },
  ],
};

// ---- Care Plans ----

export const mockCarePlans = [
  {
    id: 1, member_id: 101, title: "Diabetes Management — Smith, John", status: "active",
    created_by: 1, care_manager_id: 1, start_date: "2025-11-01", target_end_date: "2026-05-01",
    actual_end_date: null, notes: "Focus on A1c reduction and medication adherence.",
    goals_count: 3, goals_met: 1, completion_pct: 33.3,
  },
  {
    id: 2, member_id: 102, title: "CHF Post-Discharge — Garcia, Maria", status: "active",
    created_by: 1, care_manager_id: 2, start_date: "2026-01-15", target_end_date: "2026-07-15",
    actual_end_date: null, notes: "30-day readmission prevention plan.",
    goals_count: 2, goals_met: 0, completion_pct: 0.0,
  },
  {
    id: 3, member_id: 103, title: "COPD Maintenance — Williams, Robert", status: "completed",
    created_by: 2, care_manager_id: 1, start_date: "2025-06-01", target_end_date: "2025-12-01",
    actual_end_date: "2025-11-20", notes: "Successfully completed pulmonary rehab.",
    goals_count: 2, goals_met: 2, completion_pct: 100.0,
  },
  {
    id: 4, member_id: 104, title: "Depression Screening — Lee, Susan", status: "draft",
    created_by: 2, care_manager_id: null, start_date: "2026-03-20", target_end_date: null,
    actual_end_date: null, notes: "Pending care manager assignment.",
    goals_count: 0, goals_met: 0, completion_pct: 0.0,
  },
  {
    id: 5, member_id: 105, title: "Renal Management — Chen, David", status: "discontinued",
    created_by: 1, care_manager_id: 3, start_date: "2025-08-01", target_end_date: "2026-02-01",
    actual_end_date: "2025-10-15", notes: "Member transferred to hospice.",
    goals_count: 2, goals_met: 0, completion_pct: 0.0,
  },
];

export const mockCarePlanDetail = {
  id: 1, member_id: 101, title: "Diabetes Management — Smith, John", status: "active",
  created_by: 1, care_manager_id: 1, start_date: "2025-11-01", target_end_date: "2026-05-01",
  actual_end_date: null, notes: "Focus on A1c reduction and medication adherence.",
  goals_count: 3, goals_met: 1, completion_pct: 33.3,
  goals: [
    {
      id: 1, care_plan_id: 1, description: "Reduce A1c below 8%", target_metric: "hba1c",
      target_value: "<8.0", baseline_value: "9.2", current_value: "8.4", status: "in_progress",
      target_date: "2026-04-01",
      interventions: [
        { id: 1, goal_id: 1, description: "Refer to endocrinology", intervention_type: "referral", assigned_to: "Dr. Patel", due_date: "2025-12-15", completed_date: "2025-12-10", status: "completed", notes: "Appointment completed." },
        { id: 2, goal_id: 1, description: "Start Metformin 1000mg", intervention_type: "medication", assigned_to: "Dr. Rivera", due_date: "2025-11-15", completed_date: "2025-11-14", status: "completed", notes: null },
        { id: 3, goal_id: 1, description: "Monthly glucose monitoring education", intervention_type: "education", assigned_to: "RN Sarah", due_date: "2026-02-01", completed_date: null, status: "in_progress", notes: "2 of 4 sessions completed." },
      ],
    },
    {
      id: 2, care_plan_id: 1, description: "Achieve BMI below 30", target_metric: "bmi",
      target_value: "<30", baseline_value: "33.1", current_value: "31.5", status: "in_progress",
      target_date: "2026-05-01",
      interventions: [
        { id: 4, goal_id: 2, description: "Nutritional counseling referral", intervention_type: "referral", assigned_to: "Dietitian Kim", due_date: "2026-01-01", completed_date: null, status: "pending", notes: null },
        { id: 5, goal_id: 2, description: "Weekly exercise program", intervention_type: "education", assigned_to: "PT Lopez", due_date: "2026-03-01", completed_date: null, status: "in_progress", notes: "Attending 2x/week." },
      ],
    },
    {
      id: 3, care_plan_id: 1, description: "Complete annual eye exam", target_metric: "screening",
      target_value: "completed", baseline_value: "not_done", current_value: "completed", status: "met",
      target_date: "2026-02-01",
      interventions: [
        { id: 6, goal_id: 3, description: "Schedule ophthalmology appointment", intervention_type: "screening", assigned_to: "MA Johnson", due_date: "2026-01-15", completed_date: "2026-01-10", status: "completed", notes: "Exam completed, no retinopathy found." },
      ],
    },
  ],
};

export const mockCarePlanSummary = {
  active_plans: 2,
  total_goals: 5,
  met_goals: 1,
  past_due_goals: 1,
  overall_completion_pct: 20.0,
};

// ---- Case Management ----

export const mockCaseDashboard = {
  total_active: 8,
  by_manager: [
    { care_manager_id: 1, care_manager_name: "Sarah Johnson, RN", case_count: 3 },
    { care_manager_id: 2, care_manager_name: "Michael Torres, LCSW", case_count: 3 },
    { care_manager_id: 3, care_manager_name: "Angela Brooks, RN", case_count: 2 },
  ],
  by_priority: { high: 3, medium: 3, low: 2 },
  overdue_contacts: 2,
};

export const mockCaseAssignments = [
  { id: 1, member_id: 101, care_manager_id: 1, care_manager_name: "Sarah Johnson, RN", assignment_date: "2025-10-01", end_date: null, reason: "chronic_disease", status: "active", priority: "high", last_contact_date: "2026-03-20", next_contact_date: "2026-04-03", contact_count: 12, notes: "Diabetes + CHF management" },
  { id: 2, member_id: 102, care_manager_id: 1, care_manager_name: "Sarah Johnson, RN", assignment_date: "2026-01-15", end_date: null, reason: "post_discharge", status: "active", priority: "high", last_contact_date: "2026-03-18", next_contact_date: "2026-03-25", contact_count: 6, notes: "CHF readmission prevention" },
  { id: 3, member_id: 103, care_manager_id: 1, care_manager_name: "Sarah Johnson, RN", assignment_date: "2025-08-01", end_date: null, reason: "chronic_disease", status: "active", priority: "medium", last_contact_date: "2026-02-10", next_contact_date: "2026-03-10", contact_count: 8, notes: "COPD stable, routine follow-up" },
  { id: 4, member_id: 106, care_manager_id: 2, care_manager_name: "Michael Torres, LCSW", assignment_date: "2025-12-01", end_date: null, reason: "complex_case", status: "active", priority: "high", last_contact_date: "2026-03-22", next_contact_date: "2026-03-29", contact_count: 9, notes: "Behavioral health + substance use" },
  { id: 5, member_id: 107, care_manager_id: 2, care_manager_name: "Michael Torres, LCSW", assignment_date: "2026-02-01", end_date: null, reason: "high_risk", status: "active", priority: "medium", last_contact_date: "2026-03-15", next_contact_date: "2026-04-01", contact_count: 3, notes: "Rising risk score, multiple comorbidities" },
  { id: 6, member_id: 108, care_manager_id: 2, care_manager_name: "Michael Torres, LCSW", assignment_date: "2025-09-15", end_date: null, reason: "chronic_disease", status: "active", priority: "low", last_contact_date: "2026-01-20", next_contact_date: "2026-02-20", contact_count: 5, notes: "Stable hypertension management" },
  { id: 7, member_id: 109, care_manager_id: 3, care_manager_name: "Angela Brooks, RN", assignment_date: "2026-01-01", end_date: null, reason: "post_discharge", status: "active", priority: "medium", last_contact_date: "2026-03-10", next_contact_date: "2026-03-24", contact_count: 4, notes: "Hip replacement recovery" },
  { id: 8, member_id: 110, care_manager_id: 3, care_manager_name: "Angela Brooks, RN", assignment_date: "2025-11-01", end_date: null, reason: "high_risk", status: "active", priority: "low", last_contact_date: "2026-03-05", next_contact_date: "2026-04-05", contact_count: 6, notes: "Medication reconciliation needed" },
];

export const mockCaseDetail = {
  id: 1, member_id: 101, care_manager_id: 1, care_manager_name: "Sarah Johnson, RN",
  assignment_date: "2025-10-01", end_date: null, reason: "chronic_disease", status: "active",
  priority: "high", last_contact_date: "2026-03-20", next_contact_date: "2026-04-03",
  contact_count: 12, notes: "Diabetes + CHF management",
  case_notes: [
    { id: 1, note_type: "phone_call", content: "Discussed medication adherence. Patient reports taking Metformin consistently. A1c improved to 8.4. Will continue monitoring.", contact_method: "phone", duration_minutes: 15, author_id: 1, author_name: "Sarah Johnson, RN", created_at: "2026-03-20T14:30:00Z" },
    { id: 2, note_type: "coordination", content: "Coordinated with endocrinology for follow-up visit. Appointment scheduled for April 5.", contact_method: "phone", duration_minutes: 10, author_id: 1, author_name: "Sarah Johnson, RN", created_at: "2026-03-15T10:00:00Z" },
    { id: 3, note_type: "assessment", content: "Quarterly risk assessment completed. Risk score stable at 2.1. CHF well-managed with current regimen.", contact_method: "in_person", duration_minutes: 30, author_id: 1, author_name: "Sarah Johnson, RN", created_at: "2026-03-01T11:00:00Z" },
  ],
};

export const mockCaseWorkload = [
  { care_manager_id: 1, care_manager_name: "Sarah Johnson, RN", total_cases: 3, high_priority: 2, overdue_contacts: 1 },
  { care_manager_id: 2, care_manager_name: "Michael Torres, LCSW", total_cases: 3, high_priority: 1, overdue_contacts: 1 },
  { care_manager_id: 3, care_manager_name: "Angela Brooks, RN", total_cases: 2, high_priority: 0, overdue_contacts: 0 },
];

// ---- Prior Auth / UM ----

export const mockAuthDashboard = {
  pending_count: 4,
  avg_turnaround_hours: 38.5,
  approval_rate: 72.7,
  compliance_rate: 91.3,
  by_service_type: [
    { service_type: "imaging", count: 4 },
    { service_type: "specialist_referral", count: 3 },
    { service_type: "inpatient", count: 2 },
    { service_type: "DME", count: 1 },
    { service_type: "home_health", count: 1 },
    { service_type: "medication", count: 1 },
  ],
};

export const mockAuthRequests = [
  { id: 1, auth_number: "PA-2026-001", member_id: 101, service_type: "imaging", procedure_code: "74177", diagnosis_code: "K80.20", requesting_provider_name: "Dr. Sarah Patel", servicing_facility: "Metro Imaging Center", request_date: "2026-03-20", decision_date: null, urgency: "standard", status: "pending", turnaround_hours: null, compliant: null, notes: "CT abdomen for suspected gallstones" },
  { id: 2, auth_number: "PA-2026-002", member_id: 102, service_type: "inpatient", procedure_code: "99223", diagnosis_code: "I50.9", requesting_provider_name: "Dr. James Rivera", servicing_facility: "Memorial Hospital", request_date: "2026-03-22", decision_date: null, urgency: "urgent", status: "pending", turnaround_hours: null, compliant: null, notes: "CHF exacerbation, needs inpatient admission" },
  { id: 3, auth_number: "PA-2026-003", member_id: 106, service_type: "specialist_referral", procedure_code: "99205", diagnosis_code: "E11.65", requesting_provider_name: "Dr. Lisa Chen", servicing_facility: "Endocrine Associates", request_date: "2026-03-18", decision_date: null, urgency: "standard", status: "pending", turnaround_hours: null, compliant: null, notes: null },
  { id: 4, auth_number: "PA-2026-004", member_id: 107, service_type: "DME", procedure_code: "E0601", diagnosis_code: "G47.33", requesting_provider_name: "Dr. Michael Torres", servicing_facility: "National DME Supply", request_date: "2026-03-15", decision_date: null, urgency: "standard", status: "pending", turnaround_hours: null, compliant: null, notes: "CPAP machine for OSA" },
  { id: 5, auth_number: "PA-2026-005", member_id: 103, service_type: "imaging", procedure_code: "71250", diagnosis_code: "J44.1", requesting_provider_name: "Dr. Angela Brooks", servicing_facility: "Metro Imaging Center", request_date: "2026-03-10", decision_date: "2026-03-12", urgency: "standard", status: "approved", turnaround_hours: 48, compliant: true, notes: "CT chest for COPD exacerbation" },
  { id: 6, auth_number: "PA-2026-006", member_id: 108, service_type: "specialist_referral", procedure_code: "99204", diagnosis_code: "M17.11", requesting_provider_name: "Dr. Robert Kim", servicing_facility: "Ortho Specialists", request_date: "2026-03-05", decision_date: "2026-03-07", urgency: "standard", status: "approved", turnaround_hours: 42, compliant: true, notes: "Knee pain evaluation" },
  { id: 7, auth_number: "PA-2026-007", member_id: 109, service_type: "home_health", procedure_code: "99341", diagnosis_code: "Z96.641", requesting_provider_name: "Dr. David Wilson", servicing_facility: "HomeFirst Health", request_date: "2026-02-28", decision_date: "2026-03-03", urgency: "standard", status: "approved", turnaround_hours: 72, compliant: true, notes: "Post hip replacement PT" },
  { id: 8, auth_number: "PA-2026-008", member_id: 104, service_type: "imaging", procedure_code: "70553", diagnosis_code: "R51.9", requesting_provider_name: "Dr. Karen Murphy", servicing_facility: "Advanced Imaging", request_date: "2026-02-20", decision_date: "2026-02-25", urgency: "standard", status: "denied", turnaround_hours: 120, compliant: true, denial_reason: "Does not meet medical necessity criteria. Conservative treatment not attempted.", notes: null },
  { id: 9, auth_number: "PA-2026-009", member_id: 110, service_type: "medication", procedure_code: null, diagnosis_code: "M05.79", requesting_provider_name: "Dr. Jennifer Adams", servicing_facility: null, request_date: "2026-02-15", decision_date: "2026-02-20", urgency: "standard", status: "denied", turnaround_hours: 120, compliant: true, denial_reason: "Step therapy required. Must trial methotrexate first.", notes: "Humira prior auth request" },
  { id: 10, auth_number: "PA-2026-010", member_id: 110, service_type: "medication", procedure_code: null, diagnosis_code: "M05.79", requesting_provider_name: "Dr. Jennifer Adams", servicing_facility: null, request_date: "2026-02-20", decision_date: null, urgency: "standard", status: "appealed", appeal_date: "2026-03-01", appeal_status: "under_review", peer_to_peer_date: "2026-03-10", turnaround_hours: null, compliant: null, notes: "Appeal of PA-009 denial. P2P completed." },
  { id: 11, auth_number: "PA-2026-011", member_id: 106, service_type: "inpatient", procedure_code: "27447", diagnosis_code: "M17.11", requesting_provider_name: "Dr. Thomas Lee", servicing_facility: "Memorial Hospital", request_date: "2026-03-01", decision_date: null, urgency: "standard", status: "pending", turnaround_hours: null, compliant: null, notes: "OVERDUE: Total knee replacement. Submitted 25 days ago." },
  { id: 12, auth_number: "PA-2026-012", member_id: 102, service_type: "specialist_referral", procedure_code: "99205", diagnosis_code: "I50.9", requesting_provider_name: "Dr. James Rivera", servicing_facility: "Cardiology Associates", request_date: "2026-03-19", decision_date: null, urgency: "urgent", status: "pending", turnaround_hours: null, compliant: null, notes: "OVERDUE: Urgent cardiology consult. >72 hrs pending." },
];

export const mockAuthCompliance = {
  by_urgency: [
    { urgency: "standard", total: 8, compliant: 7, compliance_rate: 87.5, avg_turnaround_hours: 80.4, max_allowed_hours: 336 },
    { urgency: "urgent", total: 3, compliant: 3, compliance_rate: 100.0, avg_turnaround_hours: 28.0, max_allowed_hours: 72 },
  ],
};

export const mockAuthOverdue = [
  mockAuthRequests[10],  // PA-2026-011
  mockAuthRequests[11],  // PA-2026-012
];

// ---- Medicare Part A/B/C/D ----

export const mockPartAnalysis = {
  parts: {
    part_a: { part: "A", label: "Part A (Inpatient/SNF/Home Health)", total_spend: 7240000, pmpm: 612, claim_count: 520, member_count: 890, trend: 3.2 },
    part_b: { part: "B", label: "Part B (Outpatient/Professional/DME)", total_spend: 4850000, pmpm: 410, claim_count: 6200, member_count: 3100, trend: 1.8 },
    part_c: { part: "C", label: "Part C (Medicare Advantage Admin)", total_spend: 1200000, pmpm: 101, claim_count: 0, member_count: 4832, trend: 0.0 },
    part_d: { part: "D", label: "Part D (Pharmacy)", total_spend: 2851000, pmpm: 241, claim_count: 9200, member_count: 4100, trend: 5.1 },
  },
  total_spend: 16141000,
  member_count: 4832,
  member_months: 57984,
};

export const mockExpenditureByPeriod = [
  { period: "2025-07", total_spend: 1180000, pmpm: 1020, by_category: { inpatient: 410000, ed_observation: 135000, professional: 240000, snf_postacute: 95000, pharmacy: 200000, home_health: 50000, dme: 30000, other: 20000 }, by_part: { A: 555000, B: 425000, C: 0, D: 200000 } },
  { period: "2025-08", total_spend: 1220000, pmpm: 1054, by_category: { inpatient: 430000, ed_observation: 140000, professional: 245000, snf_postacute: 100000, pharmacy: 205000, home_health: 48000, dme: 32000, other: 20000 }, by_part: { A: 578000, B: 437000, C: 0, D: 205000 } },
  { period: "2025-09", total_spend: 1290000, pmpm: 1115, by_category: { inpatient: 460000, ed_observation: 150000, professional: 250000, snf_postacute: 105000, pharmacy: 215000, home_health: 52000, dme: 35000, other: 23000 }, by_part: { A: 617000, B: 458000, C: 0, D: 215000 } },
  { period: "2025-10", total_spend: 1310000, pmpm: 1132, by_category: { inpatient: 470000, ed_observation: 148000, professional: 255000, snf_postacute: 108000, pharmacy: 218000, home_health: 55000, dme: 33000, other: 23000 }, by_part: { A: 633000, B: 459000, C: 0, D: 218000 } },
  { period: "2025-11", total_spend: 1350000, pmpm: 1167, by_category: { inpatient: 480000, ed_observation: 155000, professional: 260000, snf_postacute: 112000, pharmacy: 225000, home_health: 58000, dme: 35000, other: 25000 }, by_part: { A: 650000, B: 475000, C: 0, D: 225000 } },
  { period: "2025-12", total_spend: 1400000, pmpm: 1210, by_category: { inpatient: 510000, ed_observation: 160000, professional: 265000, snf_postacute: 118000, pharmacy: 228000, home_health: 60000, dme: 34000, other: 25000 }, by_part: { A: 688000, B: 484000, C: 0, D: 228000 } },
  { period: "2026-01", total_spend: 1380000, pmpm: 1193, by_category: { inpatient: 495000, ed_observation: 158000, professional: 262000, snf_postacute: 115000, pharmacy: 230000, home_health: 62000, dme: 33000, other: 25000 }, by_part: { A: 672000, B: 478000, C: 0, D: 230000 } },
  { period: "2026-02", total_spend: 1320000, pmpm: 1141, by_category: { inpatient: 470000, ed_observation: 150000, professional: 258000, snf_postacute: 110000, pharmacy: 222000, home_health: 55000, dme: 32000, other: 23000 }, by_part: { A: 635000, B: 463000, C: 0, D: 222000 } },
  { period: "2026-03", total_spend: 1250000, pmpm: 1080, by_category: { inpatient: 440000, ed_observation: 142000, professional: 250000, snf_postacute: 100000, pharmacy: 210000, home_health: 52000, dme: 33000, other: 23000 }, by_part: { A: 592000, B: 448000, C: 0, D: 210000 } },
];

// ---- Dashboard Actions ----

export const mockDashboardActions = {
  pending_auths: 4,
  overdue_auths: 2,
  past_due_care_plan_goals: 1,
  members_not_contacted: 2,
  critical_care_gaps: 5,
  unacknowledged_adt_alerts: 3,
  triggered_alert_rules: 1,
  total_action_items: 14,
};

export const mockRiskCorridorAnalysis = {
  target_mlr: 0.85,
  actual_mlr: 0.849,
  corridor_position: "within",
  shared_risk_exposure: 0,
  stop_loss_threshold: 0.95,
  bands: [
    { band: "Full Surplus", range: "< 80%", description: "MSO retains 100% of savings", status: "inactive", mlr_range: [0, 0.80] },
    { band: "Shared Surplus", range: "80% - 85%", description: "MSO shares 50% of savings with plan", status: "inactive", mlr_range: [0.80, 0.85] },
    { band: "Target Corridor", range: "85% - 88%", description: "No risk sharing - within target range", status: "active", mlr_range: [0.85, 0.88] },
    { band: "Shared Deficit", range: "88% - 95%", description: "MSO shares 50% of excess with plan", status: "inactive", mlr_range: [0.88, 0.95] },
    { band: "Stop-Loss", range: "> 95%", description: "Plan absorbs 100% of excess above stop-loss", status: "inactive", mlr_range: [0.95, 1.00] },
  ],
};

// ==========================================================================
// Utilization Command Center
// ==========================================================================

export const mockUtilizationDashboard = {
  current_census: {
    total_admitted: 18,
    by_class: { inpatient: 8, observation: 3, snf: 5, er: 2 },
    by_facility: [
      { facility: "Memorial Regional Medical Center", count: 6, inpatient: 3, observation: 1, snf: 1, er: 1 },
      { facility: "St. Luke's Community Hospital", count: 4, inpatient: 2, observation: 1, snf: 1, er: 0 },
      { facility: "Mercy General Hospital", count: 3, inpatient: 1, observation: 1, snf: 0, er: 1 },
      { facility: "Riverside SNF & Rehab", count: 3, inpatient: 0, observation: 0, snf: 3, er: 0 },
      { facility: "Parkview Standalone ER", count: 2, inpatient: 2, observation: 0, snf: 0, er: 0 },
    ],
  },
  recent_activity: {
    admits_24h: 4,
    admits_48h: 7,
    admits_7d: 22,
    discharges_1d: 2,
    discharges_3d: 8,
    discharges_7d: 19,
  },
  alos_by_facility: [
    { facility: "Memorial Regional Medical Center", alos: 5.8, benchmark: 4.5, variance: 1.3, admits: 42 },
    { facility: "St. Luke's Community Hospital", alos: 4.2, benchmark: 4.5, variance: -0.3, admits: 31 },
    { facility: "Mercy General Hospital", alos: 5.1, benchmark: 4.5, variance: 0.6, admits: 28 },
    { facility: "Riverside SNF & Rehab", alos: 18.4, benchmark: 20.0, variance: -1.6, admits: 15 },
    { facility: "Parkview Standalone ER", alos: 0.3, benchmark: 0.4, variance: -0.1, admits: 38 },
  ],
  alos_by_diagnosis: [
    { drg: "DRG 291", diagnosis: "Heart Failure & Shock", alos: 5.9, benchmark: 5.2, cases: 12 },
    { drg: "DRG 190", diagnosis: "COPD w/ MCC", alos: 6.4, benchmark: 5.8, cases: 8 },
    { drg: "DRG 683", diagnosis: "Renal Failure", alos: 4.8, benchmark: 4.5, cases: 6 },
    { drg: "DRG 392", diagnosis: "Esophagitis & GI", alos: 3.2, benchmark: 3.5, cases: 9 },
    { drg: "DRG 470", diagnosis: "Major Hip/Knee Joint", alos: 2.8, benchmark: 3.0, cases: 5 },
    { drg: "DRG 871", diagnosis: "Sepsis w/o MV >96hrs", alos: 7.1, benchmark: 6.2, cases: 4 },
  ],
  follow_up_needed: [
    { member_id: "M1001", name: "Robert Chen", discharged: "2026-03-25", facility: "Memorial Regional Medical Center", diagnosis: "CHF Exacerbation", pcp: "Dr. Rivera", days_since_discharge: 1, urgency: "high", follow_up_due: "2026-03-28" },
    { member_id: "M1008", name: "Dorothy Williams", discharged: "2026-03-24", facility: "St. Luke's Community Hospital", diagnosis: "COPD Exacerbation", pcp: "Dr. Patel", days_since_discharge: 2, urgency: "high", follow_up_due: "2026-03-27" },
    { member_id: "M1015", name: "James Thompson", discharged: "2026-03-23", facility: "Mercy General Hospital", diagnosis: "Pneumonia", pcp: "Dr. Nguyen", days_since_discharge: 3, urgency: "medium", follow_up_due: "2026-03-30" },
  ],
  obs_vs_inpatient: [
    { facility: "Memorial Regional Medical Center", obs_count: 14, inpatient_count: 28, conversion_rate: 42.9, obs_alos: 1.2, inpatient_alos: 5.8 },
    { facility: "St. Luke's Community Hospital", obs_count: 11, inpatient_count: 20, conversion_rate: 35.5, obs_alos: 1.0, inpatient_alos: 4.2 },
    { facility: "Mercy General Hospital", obs_count: 8, inpatient_count: 20, conversion_rate: 28.6, obs_alos: 1.1, inpatient_alos: 5.1 },
  ],
  er_snapshot: {
    current_er_visits: 2,
    by_facility: [
      { facility: "Memorial Regional Medical Center", count: 1, avg_wait_hrs: 2.3 },
      { facility: "Mercy General Hospital", count: 1, avg_wait_hrs: 1.8 },
    ],
    by_diagnosis: [
      { diagnosis: "Chest Pain", count: 1 },
      { diagnosis: "Abdominal Pain", count: 1 },
    ],
    after_hours_pct: 35,
    weekend_pct: 28,
  },
  facility_comparison: [
    { facility: "Memorial Regional Medical Center", type: "acute", admits_90d: 42, alos: 5.8, cost_per_admit: 14200, readmit_rate: 12.4, hcc_capture_rate: 68.2, er_conversion_rate: 42.9 },
    { facility: "St. Luke's Community Hospital", type: "acute", admits_90d: 31, alos: 4.2, cost_per_admit: 11800, readmit_rate: 8.1, hcc_capture_rate: 72.5, er_conversion_rate: 35.5 },
    { facility: "Mercy General Hospital", type: "acute", admits_90d: 28, alos: 5.1, cost_per_admit: 13100, readmit_rate: 10.7, hcc_capture_rate: 65.8, er_conversion_rate: 28.6 },
    { facility: "Riverside SNF & Rehab", type: "snf", admits_90d: 15, alos: 18.4, cost_per_admit: 22500, readmit_rate: 6.7, hcc_capture_rate: 58.3, er_conversion_rate: 0 },
    { facility: "Parkview Standalone ER", type: "standalone_er", admits_90d: 38, alos: 0.3, cost_per_admit: 1850, readmit_rate: 0, hcc_capture_rate: 12.1, er_conversion_rate: 15.8 },
  ],
};

export const mockFacilityIntelligence = {
  facility_profiles: [
    { id: "F001", name: "Memorial Regional Medical Center", type: "acute", admits_90d: 42, alos: 5.8, cost_per_admit: 14200, readmit_rate: 12.4, hcc_capture_rate: 68.2, discharge_disposition: { home: 62, snf: 18, rehab: 10, home_health: 8, deceased: 2 } },
    { id: "F002", name: "St. Luke's Community Hospital", type: "acute", admits_90d: 31, alos: 4.2, cost_per_admit: 11800, readmit_rate: 8.1, hcc_capture_rate: 72.5, discharge_disposition: { home: 68, snf: 14, rehab: 8, home_health: 7, deceased: 3 } },
    { id: "F003", name: "Mercy General Hospital", type: "acute", admits_90d: 28, alos: 5.1, cost_per_admit: 13100, readmit_rate: 10.7, hcc_capture_rate: 65.8, discharge_disposition: { home: 60, snf: 20, rehab: 9, home_health: 9, deceased: 2 } },
    { id: "F004", name: "Riverside SNF & Rehab", type: "snf", admits_90d: 15, alos: 18.4, cost_per_admit: 22500, readmit_rate: 6.7, hcc_capture_rate: 58.3, discharge_disposition: { home: 45, snf: 0, rehab: 30, home_health: 20, deceased: 5 } },
    { id: "F005", name: "Parkview Standalone ER", type: "standalone_er", admits_90d: 38, alos: 0.3, cost_per_admit: 1850, readmit_rate: 0, hcc_capture_rate: 12.1, discharge_disposition: { home: 84, snf: 0, rehab: 0, home_health: 0, admitted: 16 } },
  ],
  facility_types: { acute: 3, standalone_er: 1, snf: 1 },
  facility_aliases: [
    { canonical: "Memorial Regional Medical Center", aliases: ["Memorial Regional", "MRMC", "Memorial Hospital"] },
    { canonical: "St. Luke's Community Hospital", aliases: ["St Lukes", "St. Luke's", "SLCH"] },
  ],
  cost_comparison: [
    { drg: "DRG 291", diagnosis: "Heart Failure", memorial: 15800, st_lukes: 12400, mercy: 14100, benchmark: 13500 },
    { drg: "DRG 190", diagnosis: "COPD", memorial: 13200, st_lukes: 11800, mercy: 12900, benchmark: 12200 },
    { drg: "DRG 470", diagnosis: "Major Joint", memorial: 22100, st_lukes: 19800, mercy: 21500, benchmark: 20000 },
  ],
};

// Calendar: 3 months of daily admission counts
function generateCalendarData(): { date: string; total: number; inpatient: number; observation: number; er: number; snf: number; facility_breakdown: { facility: string; count: number }[] }[] {
  const data: any[] = [];
  const startDate = new Date("2026-01-01");
  const endDate = new Date("2026-03-26");
  const facilities = ["Memorial Regional Medical Center", "St. Luke's Community Hospital", "Mercy General Hospital", "Riverside SNF & Rehab", "Parkview Standalone ER"];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseAdmits = isWeekend ? 2 : 3;
    const total = baseAdmits + Math.floor(Math.random() * 4);
    const inpatient = Math.max(1, Math.floor(total * 0.45));
    const er = Math.floor(total * 0.25);
    const obs = Math.floor(total * 0.15);
    const snf = total - inpatient - er - obs;

    const facilityBreakdown = facilities.map((f) => ({
      facility: f,
      count: Math.floor(Math.random() * 3),
    }));

    data.push({
      date: d.toISOString().slice(0, 10),
      total,
      inpatient,
      observation: obs,
      er,
      snf,
      facility_breakdown: facilityBreakdown,
    });
  }
  return data;
}

export const mockAdmissionCalendar = generateCalendarData();

export const mockAdmissionPatterns = {
  time_of_day: [
    { period: "Early Morning (12am-6am)", count: 18, pct: 12 },
    { period: "Morning (6am-12pm)", count: 42, pct: 28 },
    { period: "Afternoon (12pm-6pm)", count: 53, pct: 35 },
    { period: "Evening (6pm-12am)", count: 37, pct: 25 },
  ],
  day_of_week: [
    { day: "Monday", count: 28, pct: 18.7 },
    { day: "Tuesday", count: 25, pct: 16.7 },
    { day: "Wednesday", count: 22, pct: 14.7 },
    { day: "Thursday", count: 20, pct: 13.3 },
    { day: "Friday", count: 19, pct: 12.7 },
    { day: "Saturday", count: 18, pct: 12.0 },
    { day: "Sunday", count: 18, pct: 12.0 },
  ],
  weekend_vs_weekday: { weekday_avg: 22.8, weekend_avg: 18.0, weekend_pct: 28 },
  after_hours_er_rate: 35,
  seasonal_trends: [
    { month: "Jan", admits: 52 },
    { month: "Feb", admits: 48 },
    { month: "Mar", admits: 50 },
    { month: "Apr", admits: 42 },
    { month: "May", admits: 38 },
    { month: "Jun", admits: 35 },
    { month: "Jul", admits: 36 },
    { month: "Aug", admits: 34 },
    { month: "Sep", admits: 38 },
    { month: "Oct", admits: 44 },
    { month: "Nov", admits: 48 },
    { month: "Dec", admits: 55 },
  ],
  heatmap: [
    // hours x days: [hour, dayIndex(0=Sun), count]
    [0,0,1],[0,1,2],[0,2,1],[0,3,2],[0,4,1],[0,5,1],[0,6,1],
    [6,0,2],[6,1,4],[6,2,3],[6,3,4],[6,4,3],[6,5,2],[6,6,2],
    [8,0,3],[8,1,6],[8,2,5],[8,3,5],[8,4,5],[8,5,4],[8,6,3],
    [10,0,3],[10,1,5],[10,2,6],[10,3,5],[10,4,5],[10,5,4],[10,6,3],
    [12,0,4],[12,1,7],[12,2,6],[12,3,7],[12,4,6],[12,5,5],[12,6,4],
    [14,0,3],[14,1,6],[14,2,5],[14,3,6],[14,4,5],[14,5,4],[14,6,3],
    [16,0,3],[16,1,5],[16,2,4],[16,3,5],[16,4,4],[16,5,3],[16,6,3],
    [18,0,2],[18,1,4],[18,2,3],[18,3,4],[18,4,3],[18,5,2],[18,6,2],
    [20,0,2],[20,1,3],[20,2,2],[20,3,3],[20,4,2],[20,5,2],[20,6,2],
    [22,0,1],[22,1,2],[22,2,1],[22,3,2],[22,4,1],[22,5,1],[22,6,1],
  ],
};

// ==========================================================================
// Avoidable Admission Analysis
// ==========================================================================

export const mockAvoidableAnalysis = {
  summary: {
    total_er_visits: 38,
    avoidable_er_visits: 5,
    potentially_avoidable_admissions: 4,
    avoidable_readmissions: 3,
    estimated_annual_savings: 145000,
    avoidable_er_pct: 13.2,
    avoidable_admission_pct: 9.5,
  },
  by_provider: [
    { provider: "Dr. Rivera", pcp_id: 1, panel_size: 820, er_visits: 12, avoidable_er: 3, avoidable_rate: 25.0, access_score: "C", avg_3rd_available: 8.2 },
    { provider: "Dr. Patel", pcp_id: 2, panel_size: 780, er_visits: 8, avoidable_er: 1, avoidable_rate: 12.5, access_score: "B", avg_3rd_available: 4.1 },
    { provider: "Dr. Nguyen", pcp_id: 3, panel_size: 650, er_visits: 10, avoidable_er: 1, avoidable_rate: 10.0, access_score: "B+", avg_3rd_available: 3.2 },
    { provider: "Dr. Thompson", pcp_id: 4, panel_size: 710, er_visits: 5, avoidable_er: 0, avoidable_rate: 0, access_score: "A", avg_3rd_available: 1.8 },
    { provider: "Dr. Kim", pcp_id: 5, panel_size: 590, er_visits: 3, avoidable_er: 0, avoidable_rate: 0, access_score: "A", avg_3rd_available: 2.1 },
  ],
  by_facility: [
    { facility: "Memorial Regional Medical Center", er_visits: 14, er_to_inpatient: 6, conversion_rate: 42.9 },
    { facility: "St. Luke's Community Hospital", er_visits: 10, er_to_inpatient: 4, conversion_rate: 40.0 },
    { facility: "Mercy General Hospital", er_visits: 8, er_to_inpatient: 2, conversion_rate: 25.0 },
    { facility: "Parkview Standalone ER", er_visits: 6, er_to_inpatient: 1, conversion_rate: 16.7 },
  ],
  dollar_impact: {
    avoidable_er_cost: 8500,
    per_avoidable_er: 1700,
    avoidable_admission_cost: 56800,
    per_avoidable_admission: 14200,
    avoidable_readmission_cost: 79700,
    per_avoidable_readmission: 26567,
    total_annual_impact: 145000,
    description: "Preventing 5 avoidable ER visits, 4 avoidable admissions, and 3 avoidable readmissions saves an estimated $145K/year",
  },
};

export const mockAvoidableERDetail = [
  { id: "ER001", member_id: "M1003", name: "Maria Garcia", date: "2026-03-20", time: "22:15", facility: "Memorial Regional Medical Center", diagnosis: "Upper Respiratory Infection", icd10: "J06.9", avoidable: true, alternative: "Urgent Care / Telehealth", pcp: "Dr. Rivera", pcp_visit_prior_7d: false, day_of_week: "Friday", after_hours: true, cost: 1850, notes: "Low-acuity URI presenting after hours. No PCP visit in prior 7 days." },
  { id: "ER002", member_id: "M1005", name: "James Wilson", date: "2026-03-19", time: "14:30", facility: "St. Luke's Community Hospital", diagnosis: "Acute Exacerbation of CHF", icd10: "I50.21", avoidable: false, alternative: null, pcp: "Dr. Patel", pcp_visit_prior_7d: true, day_of_week: "Thursday", after_hours: false, cost: 3200, notes: "Acute CHF exacerbation requiring IV diuretics. Appropriate ER use." },
  { id: "ER003", member_id: "M1009", name: "Thomas Brown", date: "2026-03-18", time: "19:45", facility: "Parkview Standalone ER", diagnosis: "Low Back Pain", icd10: "M54.5", avoidable: true, alternative: "Office Visit / Urgent Care", pcp: "Dr. Rivera", pcp_visit_prior_7d: false, day_of_week: "Wednesday", after_hours: true, cost: 1650, notes: "Chronic low back pain flare. Could be managed in office setting." },
  { id: "ER004", member_id: "M1012", name: "Susan Davis", date: "2026-03-17", time: "10:20", facility: "Mercy General Hospital", diagnosis: "Chest Pain - Ruled Out", icd10: "R07.9", avoidable: false, alternative: null, pcp: "Dr. Nguyen", pcp_visit_prior_7d: false, day_of_week: "Tuesday", after_hours: false, cost: 4100, notes: "Chest pain workup with troponin and EKG. Appropriate ER visit." },
  { id: "ER005", member_id: "M1002", name: "Linda Johnson", date: "2026-03-16", time: "23:10", facility: "Memorial Regional Medical Center", diagnosis: "Urinary Tract Infection", icd10: "N39.0", avoidable: true, alternative: "Nurse Triage Line / Telehealth", pcp: "Dr. Rivera", pcp_visit_prior_7d: false, day_of_week: "Monday", after_hours: true, cost: 1420, notes: "Uncomplicated UTI. After-hours visit. PCP access may be an issue." },
  { id: "ER006", member_id: "M1018", name: "Richard Martinez", date: "2026-03-15", time: "16:00", facility: "St. Luke's Community Hospital", diagnosis: "COPD Exacerbation", icd10: "J44.1", avoidable: false, alternative: null, pcp: "Dr. Patel", pcp_visit_prior_7d: true, day_of_week: "Sunday", after_hours: false, cost: 2900, notes: "Moderate COPD exacerbation requiring nebulizer and steroids." },
  { id: "ER007", member_id: "M1006", name: "Patricia Lee", date: "2026-03-14", time: "08:30", facility: "Mercy General Hospital", diagnosis: "Fall with Minor Laceration", icd10: "W19.XXXA", avoidable: true, alternative: "Urgent Care", pcp: "Dr. Nguyen", pcp_visit_prior_7d: false, day_of_week: "Saturday", after_hours: false, cost: 1200, notes: "Minor laceration requiring 3 sutures. Urgent care appropriate." },
  { id: "ER008", member_id: "M1020", name: "Charles Anderson", date: "2026-03-13", time: "02:45", facility: "Memorial Regional Medical Center", diagnosis: "Acute MI", icd10: "I21.9", avoidable: false, alternative: null, pcp: "Dr. Thompson", pcp_visit_prior_7d: false, day_of_week: "Friday", after_hours: true, cost: 8500, notes: "STEMI requiring emergent catheterization. Appropriate ER use." },
  { id: "ER009", member_id: "M1014", name: "Helen Taylor", date: "2026-03-12", time: "11:15", facility: "Parkview Standalone ER", diagnosis: "Dizziness", icd10: "R42", avoidable: true, alternative: "Office Visit", pcp: "Dr. Kim", pcp_visit_prior_7d: false, day_of_week: "Thursday", after_hours: false, cost: 1580, notes: "Benign positional vertigo. Could be managed in office setting." },
  { id: "ER010", member_id: "M1022", name: "Barbara White", date: "2026-03-11", time: "15:00", facility: "St. Luke's Community Hospital", diagnosis: "Hip Fracture", icd10: "S72.001A", avoidable: false, alternative: null, pcp: "Dr. Patel", pcp_visit_prior_7d: false, day_of_week: "Wednesday", after_hours: false, cost: 6200, notes: "Displaced hip fracture requiring surgical intervention." },
  { id: "ER011", member_id: "M1007", name: "George Clark", date: "2026-03-10", time: "20:30", facility: "Mercy General Hospital", diagnosis: "Diabetic Ketoacidosis", icd10: "E11.10", avoidable: false, alternative: null, pcp: "Dr. Nguyen", pcp_visit_prior_7d: false, day_of_week: "Tuesday", after_hours: true, cost: 5800, notes: "DKA requiring insulin drip and ICU monitoring." },
  { id: "ER012", member_id: "M1025", name: "Nancy Harris", date: "2026-03-09", time: "09:00", facility: "Memorial Regional Medical Center", diagnosis: "Pneumonia", icd10: "J18.9", avoidable: false, alternative: null, pcp: "Dr. Thompson", pcp_visit_prior_7d: true, day_of_week: "Monday", after_hours: false, cost: 3400, notes: "Community-acquired pneumonia with hypoxia. Appropriate ER visit." },
];

export const mockAvoidableEducation = [
  { id: "EDU001", type: "member", member_id: "M1003", name: "Maria Garcia", reason: "2 avoidable ER visits in 90 days (URI, sore throat)", recommendation: "ER vs office visit education; enroll in nurse triage line", pcp: "Dr. Rivera", priority: "high", estimated_savings: 3200 },
  { id: "EDU002", type: "member", member_id: "M1002", name: "Linda Johnson", reason: "3 avoidable ER visits in 6 months (UTI x2, headache)", recommendation: "After-hours care education; telehealth enrollment", pcp: "Dr. Rivera", priority: "high", estimated_savings: 4800 },
  { id: "EDU003", type: "member", member_id: "M1009", name: "Thomas Brown", reason: "Chronic back pain managed via ER visits", recommendation: "Pain management referral; care plan for chronic pain", pcp: "Dr. Rivera", priority: "medium", estimated_savings: 2400 },
  { id: "EDU004", type: "provider", provider_id: 1, name: "Dr. Rivera", reason: "25% avoidable ER rate — highest in network. 3rd available appointment: 8.2 days.", recommendation: "Increase same-day/next-day appointment availability; implement nurse triage callback", priority: "high", estimated_savings: 18000 },
  { id: "EDU005", type: "readmission", member_id: "M1001", name: "Robert Chen", reason: "Readmitted for CHF within 14 days — medication non-compliance", recommendation: "Medication reconciliation; 48-hour post-discharge call; care manager outreach", pcp: "Dr. Rivera", priority: "high", estimated_savings: 14200 },
  { id: "EDU006", type: "readmission", member_id: "M1008", name: "Dorothy Williams", reason: "Readmitted for COPD within 21 days — missed follow-up", recommendation: "Mandatory 7-day post-discharge follow-up; pulmonary rehab referral", pcp: "Dr. Patel", priority: "high", estimated_savings: 12800 },
];

// ==========================================================================
// FHIR Capability Statement (mock)
// ==========================================================================

export const mockFHIRCapability = {
  resourceType: "CapabilityStatement",
  status: "active",
  date: "2026-03-26",
  kind: "instance",
  fhirVersion: "4.0.1",
  format: ["json"],
  rest: [
    {
      mode: "server",
      resource: [
        { type: "Patient", interaction: [{ code: "create" }] },
        { type: "Condition", interaction: [{ code: "create" }] },
        { type: "Encounter", interaction: [{ code: "create" }] },
        { type: "MedicationRequest", interaction: [{ code: "create" }] },
        { type: "Observation", interaction: [{ code: "create" }] },
        { type: "Procedure", interaction: [{ code: "create" }] },
      ],
    },
  ],
};

// ==========================================================================
// Data Interfaces — Universal Integration Layer
// ==========================================================================

export const mockDataInterfaces = [
  {
    id: 1,
    name: "Humana Claims Feed",
    interface_type: "x12_837",
    direction: "inbound",
    config: { host: "sftp.humana.com", port: 22, directory: "/outbound/837/", schedule: "0 2 * * *", username: "aqsoft_prod" },
    is_active: true,
    schedule: "0 2 * * *",
    last_received: "2026-03-26T02:14:00Z",
    last_error: null,
    records_processed: 2340,
    error_count: 0,
  },
  {
    id: 2,
    name: "Memorial Hospital ADT",
    interface_type: "hl7v2",
    direction: "inbound",
    config: { host: "adt.memorial.org", port: 2575, protocol: "mllp", message_types: ["ADT^A01", "ADT^A02", "ADT^A03", "ADT^A04"] },
    is_active: true,
    schedule: "realtime",
    last_received: "2026-03-26T14:32:00Z",
    last_error: null,
    records_processed: 890,
    error_count: 2,
  },
  {
    id: 3,
    name: "eCW FHIR Connection",
    interface_type: "fhir",
    direction: "inbound",
    config: { url: "https://fhir.ecw-cloud.com/R4", auth_type: "smart_on_fhir", client_id: "aqsoft-prod", scope: "patient/*.read" },
    is_active: true,
    schedule: "0 */4 * * *",
    last_received: "2026-03-26T12:00:00Z",
    last_error: null,
    records_processed: 1200,
    error_count: 0,
  },
  {
    id: 4,
    name: "Aetna Enrollment",
    interface_type: "x12_834",
    direction: "inbound",
    config: { host: "sftp.aetna.com", port: 22, directory: "/enrollment/834/", schedule: "0 1 1,15 * *", username: "aqsoft_elig" },
    is_active: true,
    schedule: "0 1 1,15 * *",
    last_received: "2026-03-15T01:22:00Z",
    last_error: null,
    records_processed: 500,
    error_count: 0,
  },
  {
    id: 5,
    name: "Quest Labs",
    interface_type: "hl7v2",
    direction: "inbound",
    config: { host: "results.questdiagnostics.com", port: 2576, protocol: "mllp", message_types: ["ORU^R01"] },
    is_active: true,
    schedule: "realtime",
    last_received: "2026-03-26T13:45:00Z",
    last_error: null,
    records_processed: 340,
    error_count: 1,
  },
  {
    id: 6,
    name: "Availity ADT",
    interface_type: "webhook",
    direction: "inbound",
    config: { secret: "whsec_***", expected_headers: { "X-Availity-Signature": true }, event_types: ["admission", "discharge", "transfer"] },
    is_active: true,
    schedule: "realtime",
    last_received: "2026-03-23T09:15:00Z",
    last_error: "Connection timeout after 30s — remote server unresponsive",
    records_processed: 156,
    error_count: 7,
  },
];

export const mockInterfaceLogs: Record<number, any[]> = {
  1: [
    { id: 101, event_type: "receive", message: "Received 837 file: HUMANA_837P_20260326.edi (245 claims)", records_count: 245, created_at: "2026-03-26T02:14:00Z" },
    { id: 102, event_type: "parse", message: "Parsed 245 claims, 0 errors", records_count: 245, created_at: "2026-03-26T02:14:12Z" },
    { id: 103, event_type: "normalize", message: "Normalised 245 claims to platform model", records_count: 245, created_at: "2026-03-26T02:14:18Z" },
    { id: 104, event_type: "receive", message: "Received 837 file: HUMANA_837P_20260325.edi (198 claims)", records_count: 198, created_at: "2026-03-25T02:11:00Z" },
    { id: 105, event_type: "parse", message: "Parsed 198 claims, 0 errors", records_count: 198, created_at: "2026-03-25T02:11:08Z" },
  ],
  2: [
    { id: 201, event_type: "receive", message: "ADT^A01 — Admit: Johnson, Linda (MRN: 4482901)", records_count: 1, created_at: "2026-03-26T14:32:00Z" },
    { id: 202, event_type: "normalize", message: "Created encounter + care alert for admission", records_count: 1, created_at: "2026-03-26T14:32:01Z" },
    { id: 203, event_type: "receive", message: "ADT^A03 — Discharge: Chen, Robert (MRN: 4482876)", records_count: 1, created_at: "2026-03-26T13:15:00Z" },
    { id: 204, event_type: "receive", message: "ADT^A01 — Admit: Garcia, Maria (MRN: 4483012)", records_count: 1, created_at: "2026-03-26T11:45:00Z" },
    { id: 205, event_type: "error", message: "Failed to parse PID segment — missing required field PID.5 (patient name)", records_count: 0, created_at: "2026-03-25T22:10:00Z" },
  ],
  3: [
    { id: 301, event_type: "receive", message: "FHIR Bundle: 42 Patient resources, 156 Condition resources", records_count: 198, created_at: "2026-03-26T12:00:00Z" },
    { id: 302, event_type: "normalize", message: "Mapped 42 patients, 156 conditions to platform model", records_count: 198, created_at: "2026-03-26T12:00:15Z" },
    { id: 303, event_type: "receive", message: "FHIR Bundle: 38 Patient resources, 142 Condition resources", records_count: 180, created_at: "2026-03-26T08:00:00Z" },
  ],
  4: [
    { id: 401, event_type: "receive", message: "Received 834 file: AETNA_834_20260315.edi (500 members)", records_count: 500, created_at: "2026-03-15T01:22:00Z" },
    { id: 402, event_type: "parse", message: "Parsed 500 enrollment records, 0 errors", records_count: 500, created_at: "2026-03-15T01:22:30Z" },
    { id: 403, event_type: "normalize", message: "Updated 482 existing members, added 18 new members", records_count: 500, created_at: "2026-03-15T01:23:00Z" },
  ],
  5: [
    { id: 501, event_type: "receive", message: "ORU^R01 — Lab result: Garcia, Maria — HbA1c: 7.2%", records_count: 1, created_at: "2026-03-26T13:45:00Z" },
    { id: 502, event_type: "normalize", message: "Mapped lab result to Observation model", records_count: 1, created_at: "2026-03-26T13:45:01Z" },
    { id: 503, event_type: "receive", message: "ORU^R01 — Lab result: Wilson, James — BMP panel (8 results)", records_count: 8, created_at: "2026-03-26T11:30:00Z" },
    { id: 504, event_type: "error", message: "Invalid OBX segment — value type mismatch (expected NM, got ST)", records_count: 0, created_at: "2026-03-25T16:00:00Z" },
  ],
  6: [
    { id: 601, event_type: "receive", message: "Webhook: admission event for member M1005 at St. Luke's", records_count: 1, created_at: "2026-03-23T09:15:00Z" },
    { id: 602, event_type: "error", message: "Connection timeout after 30s — remote server unresponsive", records_count: 0, created_at: "2026-03-24T08:00:00Z" },
    { id: 603, event_type: "error", message: "Connection timeout after 30s — remote server unresponsive", records_count: 0, created_at: "2026-03-25T08:00:00Z" },
    { id: 604, event_type: "error", message: "Connection timeout after 30s — remote server unresponsive", records_count: 0, created_at: "2026-03-26T08:00:00Z" },
  ],
};

export const mockInterfaceStatus = {
  total: 6,
  active: 6,
  healthy: 4,
  stale: 1,
  error: 1,
  total_records_24h: 693,
  formats_supported: [
    { format: "REST API", description: "Push JSON data via authenticated REST endpoints", status: "available" },
    { format: "FHIR R4", description: "HL7 FHIR R4 Bundles and individual resources", status: "available" },
    { format: "HL7v2", description: "ADT (A01-A04), ORU (lab results), SIU (scheduling)", status: "available" },
    { format: "X12 837", description: "Professional and institutional claims", status: "available" },
    { format: "X12 835", description: "Remittance advice / payment records", status: "available" },
    { format: "X12 834", description: "Enrollment and eligibility", status: "available" },
    { format: "CDA/CCDA", description: "Clinical Document Architecture (XML summaries)", status: "available" },
    { format: "SFTP", description: "Scheduled file pickup from SFTP servers", status: "available" },
    { format: "Webhook", description: "Real-time event push notifications", status: "available" },
    { format: "Database", description: "Direct SQL connections to EMR data warehouses", status: "available" },
    { format: "CSV/Excel", description: "Manual file upload (already built)", status: "available" },
  ],
};


// ==========================================================================
// AI Pipeline — Self-Learning Data Transformation Engine
// ==========================================================================

export const mockPipelineDashboard = {
  total_processed: 12450,
  auto_clean_rate: 94.2,
  ai_accuracy: 91.8,
  rules_learned: 47,
  auto_clean_rate_trend: [
    { month: "Oct 2025", rate: 87.0 },
    { month: "Nov 2025", rate: 89.4 },
    { month: "Dec 2025", rate: 90.1 },
    { month: "Jan 2026", rate: 91.8 },
    { month: "Feb 2026", rate: 93.0 },
    { month: "Mar 2026", rate: 94.2 },
  ],
  processing_trend: [
    { week: "Feb 3", records: 1420 },
    { week: "Feb 10", records: 1680 },
    { week: "Feb 17", records: 1540 },
    { week: "Feb 24", records: 1890 },
    { week: "Mar 3", records: 2010 },
    { week: "Mar 10", records: 1760 },
    { week: "Mar 17", records: 2240 },
    { week: "Mar 24", records: 1910 },
  ],
  top_issues: [
    { issue: "Date format variations", percentage: 23, count: 2864 },
    { issue: "Name capitalization", percentage: 18, count: 2241 },
    { issue: "Missing ICD-10 dots", percentage: 15, count: 1868 },
    { issue: "Gender code mapping", percentage: 12, count: 1494 },
    { issue: "Phone format", percentage: 10, count: 1245 },
    { issue: "Amount formatting", percentage: 8, count: 996 },
    { issue: "State abbreviation", percentage: 7, count: 872 },
    { issue: "NPI validation", percentage: 4, count: 498 },
    { issue: "ZIP code format", percentage: 3, count: 372 },
  ],
};

export const mockPipelineRules = [
  {
    id: 1,
    source_name: "Humana Claims Feed",
    data_type: "claims",
    field: "gender",
    rule_type: "value_map",
    condition: { value: "1" },
    transformation: { to: "M" },
    created_from: "human",
    times_applied: 340,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-11-15T10:30:00Z",
  },
  {
    id: 2,
    source_name: "Humana Claims Feed",
    data_type: "claims",
    field: "gender",
    rule_type: "value_map",
    condition: { value: "2" },
    transformation: { to: "F" },
    created_from: "human",
    times_applied: 312,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-11-15T10:30:00Z",
  },
  {
    id: 3,
    source_name: null,
    data_type: null,
    field: "date_of_birth",
    rule_type: "format_convert",
    condition: { pattern: "\\d{2}/\\d{2}/\\d{2}" },
    transformation: { format: "YYYY-MM-DD", century_pivot: 50 },
    created_from: "pattern",
    times_applied: 2100,
    times_overridden: 3,
    accuracy: 99.9,
    is_active: true,
    created_at: "2025-10-22T08:15:00Z",
  },
  {
    id: 4,
    source_name: null,
    data_type: null,
    field: "service_date",
    rule_type: "format_convert",
    condition: { pattern: "\\d{2}/\\d{2}/\\d{4}" },
    transformation: { format: "YYYY-MM-DD" },
    created_from: "pattern",
    times_applied: 1840,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-10-22T08:15:00Z",
  },
  {
    id: 5,
    source_name: "Aetna Enrollment",
    data_type: "roster",
    field: "subscriber_id",
    rule_type: "value_map",
    condition: { field_name: "subscriber_id" },
    transformation: { rename_to: "member_id" },
    created_from: "human",
    times_applied: 500,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-12-01T14:00:00Z",
  },
  {
    id: 6,
    source_name: "Memorial Hospital ADT",
    data_type: null,
    field: "facility_name",
    rule_type: "value_map",
    condition: { value: "Memorial Hospital Tampa" },
    transformation: { to: "Memorial Hospital" },
    created_from: "human",
    times_applied: 187,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-12-10T09:45:00Z",
  },
  {
    id: 7,
    source_name: null,
    data_type: "claims",
    field: "diagnosis_1",
    rule_type: "code_correction",
    condition: { pattern: "^[A-Z]\\d{3,}$" },
    transformation: { action: "insert_dot_after_3" },
    created_from: "pattern",
    times_applied: 1868,
    times_overridden: 2,
    accuracy: 99.9,
    is_active: true,
    created_at: "2025-11-05T11:20:00Z",
  },
  {
    id: 8,
    source_name: null,
    data_type: null,
    field: "patient_name",
    rule_type: "format_convert",
    condition: { pattern: "^[A-Z\\s,]+$" },
    transformation: { action: "parse_name_last_first", title_case: true },
    created_from: "ai",
    times_applied: 1560,
    times_overridden: 12,
    accuracy: 99.2,
    is_active: true,
    created_at: "2025-11-18T16:30:00Z",
  },
  {
    id: 9,
    source_name: "Quest Labs",
    data_type: "lab_results",
    field: "result_units",
    rule_type: "value_map",
    condition: { value: "MG/DL" },
    transformation: { to: "mg/dL" },
    created_from: "ai",
    times_applied: 245,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2026-01-08T13:00:00Z",
  },
  {
    id: 10,
    source_name: null,
    data_type: null,
    field: "phone",
    rule_type: "regex_transform",
    condition: { pattern: "^(\\d{3})(\\d{3})(\\d{4})$" },
    transformation: { format: "($1) $2-$3" },
    created_from: "pattern",
    times_applied: 980,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-11-20T09:00:00Z",
  },
  {
    id: 11,
    source_name: "eCW FHIR Connection",
    data_type: "roster",
    field: "gender",
    rule_type: "value_map",
    condition: { value: "male" },
    transformation: { to: "M" },
    created_from: "ai",
    times_applied: 420,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2026-01-15T11:00:00Z",
  },
  {
    id: 12,
    source_name: null,
    data_type: "claims",
    field: "billed_amount",
    rule_type: "regex_transform",
    condition: { pattern: "^\\$([\\d,]+\\.?\\d*)$" },
    transformation: { action: "strip_currency_and_commas" },
    created_from: "pattern",
    times_applied: 890,
    times_overridden: 0,
    accuracy: 100.0,
    is_active: true,
    created_at: "2025-12-20T10:30:00Z",
  },
];

export const mockPipelineRuns = [
  {
    id: 1,
    source_name: "Humana Claims Feed",
    interface_id: 1,
    format_detected: "x12_837",
    data_type_detected: "claims",
    total_records: 245,
    clean_records: 238,
    quarantined_records: 7,
    ai_cleaned: 42,
    rules_applied: 198,
    rules_created: 0,
    entities_matched: 231,
    processing_time_ms: 3240,
    errors: null,
    created_at: "2026-03-26T02:14:00Z",
    changes: [
      { field: "service_date", original: "03/25/2026", cleaned: "2026-03-25", reason: "Converted from MM/DD/YYYY" },
      { field: "diagnosis_1", original: "E119", cleaned: "E11.9", reason: "Added decimal to ICD-10 code" },
      { field: "gender", original: "1", cleaned: "M", reason: "Mapped '1' to 'M' (learned rule)" },
      { field: "billed_amount", original: "$1,234.56", cleaned: 1234.56, reason: "Stripped currency and commas" },
      { field: "patient_name", original: "SMITH, JOHN A", cleaned: { first_name: "John", last_name: "Smith", middle_name: "A" }, reason: "Parsed and normalised name" },
    ],
  },
  {
    id: 2,
    source_name: "Memorial Hospital ADT",
    interface_id: 2,
    format_detected: "hl7v2",
    data_type_detected: "roster",
    total_records: 18,
    clean_records: 17,
    quarantined_records: 1,
    ai_cleaned: 5,
    rules_applied: 14,
    rules_created: 0,
    entities_matched: 16,
    processing_time_ms: 890,
    errors: null,
    created_at: "2026-03-26T14:32:00Z",
    changes: [
      { field: "facility_name", original: "Memorial Hospital Tampa", cleaned: "Memorial Hospital", reason: "Applied facility normalization rule" },
      { field: "admit_date", original: "26-Mar-26", cleaned: "2026-03-26", reason: "Converted from DD-Mon-YY" },
    ],
  },
  {
    id: 3,
    source_name: "eCW FHIR Connection",
    interface_id: 3,
    format_detected: "fhir",
    data_type_detected: "roster",
    total_records: 198,
    clean_records: 195,
    quarantined_records: 3,
    ai_cleaned: 28,
    rules_applied: 156,
    rules_created: 1,
    entities_matched: 189,
    processing_time_ms: 4520,
    errors: null,
    created_at: "2026-03-26T12:00:00Z",
    changes: [
      { field: "gender", original: "male", cleaned: "M", reason: "Mapped 'male' to 'M'" },
      { field: "phone", original: "5551234567", cleaned: "(555) 123-4567", reason: "Formatted phone number" },
    ],
  },
  {
    id: 4,
    source_name: "Aetna Enrollment",
    interface_id: 4,
    format_detected: "x12_834",
    data_type_detected: "roster",
    total_records: 500,
    clean_records: 492,
    quarantined_records: 8,
    ai_cleaned: 67,
    rules_applied: 445,
    rules_created: 2,
    entities_matched: 482,
    processing_time_ms: 8900,
    errors: null,
    created_at: "2026-03-15T01:22:00Z",
    changes: [
      { field: "subscriber_id", original: "subscriber_id", cleaned: "member_id", reason: "Renamed field (learned rule)" },
      { field: "date_of_birth", original: "05/12/78", cleaned: "1978-05-12", reason: "Converted 2-digit year from MM/DD/YY" },
      { field: "state", original: "Florida", cleaned: "FL", reason: "Abbreviated state name" },
    ],
  },
  {
    id: 5,
    source_name: "Quest Labs",
    interface_id: 5,
    format_detected: "hl7v2",
    data_type_detected: "lab_results",
    total_records: 45,
    clean_records: 44,
    quarantined_records: 1,
    ai_cleaned: 8,
    rules_applied: 38,
    rules_created: 0,
    entities_matched: 42,
    processing_time_ms: 1250,
    errors: null,
    created_at: "2026-03-26T13:45:00Z",
    changes: [
      { field: "result_units", original: "MG/DL", cleaned: "mg/dL", reason: "Normalised unit casing" },
      { field: "collection_date", original: "03/25/26", cleaned: "2026-03-25", reason: "Converted 2-digit year" },
    ],
  },
  {
    id: 6,
    source_name: "Manual Upload — Provider Roster",
    interface_id: null,
    format_detected: "csv",
    data_type_detected: "roster",
    total_records: 120,
    clean_records: 108,
    quarantined_records: 12,
    ai_cleaned: 34,
    rules_applied: 78,
    rules_created: 3,
    entities_matched: 95,
    processing_time_ms: 2100,
    errors: null,
    created_at: "2026-03-24T10:30:00Z",
    changes: [
      { field: "npi", original: "123456789", cleaned: "123456789", reason: "FLAGGED: NPI must be 10 digits, got 9" },
      { field: "patient_name", original: "GARCIA, MARIA L", cleaned: { first_name: "Maria", last_name: "Garcia", middle_name: "L" }, reason: "Parsed and normalised name" },
      { field: "zip_code", original: "336120456", cleaned: "33612-0456", reason: "Formatted ZIP+4" },
    ],
  },
  {
    id: 7,
    source_name: "Humana Claims Feed",
    interface_id: 1,
    format_detected: "x12_837",
    data_type_detected: "claims",
    total_records: 198,
    clean_records: 194,
    quarantined_records: 4,
    ai_cleaned: 31,
    rules_applied: 162,
    rules_created: 0,
    entities_matched: 190,
    processing_time_ms: 2680,
    errors: null,
    created_at: "2026-03-25T02:11:00Z",
    changes: [
      { field: "diagnosis_2", original: "I509", cleaned: "I50.9", reason: "Added decimal to ICD-10 code" },
      { field: "billed_amount", original: "(500)", cleaned: -500, reason: "Converted parenthetical negative" },
    ],
  },
  {
    id: 8,
    source_name: "Availity ADT",
    interface_id: 6,
    format_detected: "json",
    data_type_detected: "roster",
    total_records: 12,
    clean_records: 10,
    quarantined_records: 2,
    ai_cleaned: 4,
    rules_applied: 8,
    rules_created: 0,
    entities_matched: 9,
    processing_time_ms: 650,
    errors: { webhook_retries: 2, last_error: "Timeout on initial attempt" },
    created_at: "2026-03-23T09:15:00Z",
    changes: [
      { field: "admit_date", original: "2026-3-23", cleaned: "2026-03-23", reason: "Padded single-digit month" },
      { field: "gender", original: "Female", cleaned: "F", reason: "Mapped 'Female' to 'F'" },
    ],
  },
];


// ==========================================================================
// Skills / Automation — Self-Learning Workflow Engine
// ==========================================================================

export const mockSkills = [
  {
    id: 1,
    name: "New Data Refresh",
    description: "Complete data pipeline: ingest, validate, analyze, and refresh dashboards when new data arrives.",
    trigger_type: "event",
    trigger_config: { event_type: "data_ingested", filter: {} },
    steps: [
      { order: 1, action: "run_quality_checks", params: { scope: "latest_batch" }, description: "Run data quality checks on new data" },
      { order: 2, action: "run_hcc_engine", params: { scope: "new_claims_only" }, description: "Run HCC suspect detection on new claims" },
      { order: 3, action: "detect_care_gaps", params: { scope: "affected_members" }, description: "Detect care gaps for affected members" },
      { order: 4, action: "run_discovery", params: { full: false }, description: "Run pattern discovery on new data" },
      { order: 5, action: "generate_insights", params: { scope: "incremental" }, description: "Generate AI insights from new data" },
      { order: 6, action: "refresh_dashboard", params: {}, description: "Refresh all dashboard metrics" },
    ],
    created_by: 1,
    created_from: "preset",
    is_active: true,
    times_executed: 47,
    last_executed: "2026-03-27T02:14:00Z",
    avg_duration_seconds: 45,
    scope: "tenant",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-03-27T02:14:00Z",
  },
  {
    id: 2,
    name: "Post-Discharge Protocol",
    description: "Automatically initiates care coordination after a patient discharge: TCM case, HCC review, care manager assignment.",
    trigger_type: "event",
    trigger_config: { event_type: "adt_discharge", filter: { patient_class: "inpatient" } },
    steps: [
      { order: 1, action: "create_action_items", params: { type: "tcm_case", priority: "high", assign_to_role: "care_manager" }, description: "Create TCM case for discharged patient" },
      { order: 2, action: "run_hcc_engine", params: { scope: "single_member" }, description: "Check HCC opportunities for patient" },
      { order: 3, action: "detect_care_gaps", params: { scope: "single_member" }, description: "Check for open care gaps" },
      { order: 4, action: "create_action_items", params: { type: "follow_up", days_from_now: 2, assign_to_role: "care_manager" }, description: "Schedule 48-hour follow-up" },
      { order: 5, action: "send_notification", params: { channel: "in_app", template: "post_discharge_alert" }, description: "Notify care team of discharge" },
    ],
    created_by: 1,
    created_from: "preset",
    is_active: true,
    times_executed: 23,
    last_executed: "2026-03-26T14:32:00Z",
    avg_duration_seconds: 12,
    scope: "tenant",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-03-26T14:32:00Z",
  },
  {
    id: 3,
    name: "Quarterly HCC Chase",
    description: "Run full HCC analysis, generate prioritized chase lists, and assign to providers for documentation.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 8 1 1,4,7,10 *" },
    steps: [
      { order: 1, action: "run_hcc_engine", params: { scope: "full_population" }, description: "Run HCC suspect detection on full population" },
      { order: 2, action: "generate_chase_list", params: { sort_by: "raf_value", min_raf: 0.1 }, description: "Generate prioritized chase list" },
      { order: 3, action: "create_action_items", params: { assign_to_role: "care_manager", priority: "high" }, description: "Create action items for care managers" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "chase_list_ready" }, description: "Notify team that chase list is ready" },
    ],
    created_by: 1,
    created_from: "preset",
    is_active: true,
    times_executed: 3,
    last_executed: "2026-01-01T08:00:00Z",
    avg_duration_seconds: 180,
    scope: "tenant",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-01T08:00:00Z",
  },
  {
    id: 4,
    name: "AWV Campaign",
    description: "Identify members due for Annual Wellness Visits, generate outreach lists, and schedule reminders.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 9 1 * *" },
    steps: [
      { order: 1, action: "detect_care_gaps", params: { measures: ["AWV"], scope: "full_population" }, description: "Identify members due for AWV" },
      { order: 2, action: "generate_chase_list", params: { type: "awv_outreach", sort_by: "raf_value" }, description: "Generate AWV outreach list" },
      { order: 3, action: "create_action_items", params: { type: "outreach_call", assign_to_role: "outreach" }, description: "Create outreach tasks" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "awv_campaign_started" }, description: "Notify outreach team of new campaign" },
    ],
    created_by: 1,
    created_from: "preset",
    is_active: true,
    times_executed: 3,
    last_executed: "2026-03-01T09:00:00Z",
    avg_duration_seconds: 60,
    scope: "tenant",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-03-01T09:00:00Z",
  },
  {
    id: 5,
    name: "Monthly Board Report",
    description: "Refresh all data, generate comprehensive insights, and produce the monthly executive report.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 6 1 * *" },
    steps: [
      { order: 1, action: "refresh_dashboard", params: {}, description: "Refresh all dashboard metrics" },
      { order: 2, action: "run_hcc_engine", params: { scope: "full_population" }, description: "Run full HCC analysis" },
      { order: 3, action: "detect_care_gaps", params: { scope: "full_population" }, description: "Run care gap detection" },
      { order: 4, action: "calculate_stars", params: {}, description: "Calculate current star rating projection" },
      { order: 5, action: "generate_insights", params: { scope: "full", report_type: "executive" }, description: "Generate executive insights" },
      { order: 6, action: "generate_report", params: { template: "monthly_board", format: "pdf" }, description: "Generate board report PDF" },
      { order: 7, action: "send_notification", params: { channel: "in_app", template: "board_report_ready", roles: ["mso_admin"] }, description: "Notify admin that report is ready" },
    ],
    created_by: 1,
    created_from: "preset",
    is_active: true,
    times_executed: 3,
    last_executed: "2026-03-01T06:00:00Z",
    avg_duration_seconds: 240,
    scope: "tenant",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-03-01T06:00:00Z",
  },
];

export const mockSkillExecutions = [
  {
    id: 1,
    skill_id: 1,
    skill_name: "New Data Refresh",
    triggered_by: "event",
    status: "completed",
    steps_completed: 6,
    steps_total: 6,
    results: [
      { step: 1, action: "run_quality_checks", status: "completed", output: { issues_found: 3, message: "Quality checks completed" } },
      { step: 2, action: "run_hcc_engine", status: "completed", output: { suspects_found: 12, message: "HCC engine analysis completed" } },
      { step: 3, action: "detect_care_gaps", status: "completed", output: { gaps_found: 8, message: "Care gap detection completed" } },
      { step: 4, action: "run_discovery", status: "completed", output: { patterns_found: 3, message: "Discovery analysis completed" } },
      { step: 5, action: "generate_insights", status: "completed", output: { insights_created: 5, message: "Insight generation completed" } },
      { step: 6, action: "refresh_dashboard", status: "completed", output: { message: "Dashboard metrics refreshed" } },
    ],
    error: null,
    duration_seconds: 42,
    executed_by: null,
    created_at: "2026-03-27T02:14:00Z",
  },
  {
    id: 2,
    skill_id: 2,
    skill_name: "Post-Discharge Protocol",
    triggered_by: "event",
    status: "completed",
    steps_completed: 5,
    steps_total: 5,
    results: [
      { step: 1, action: "create_action_items", status: "completed", output: { items_created: 1, message: "TCM case created" } },
      { step: 2, action: "run_hcc_engine", status: "completed", output: { suspects_found: 2, message: "HCC opportunities found" } },
      { step: 3, action: "detect_care_gaps", status: "completed", output: { gaps_found: 1, message: "1 open care gap found" } },
      { step: 4, action: "create_action_items", status: "completed", output: { items_created: 1, message: "Follow-up scheduled" } },
      { step: 5, action: "send_notification", status: "completed", output: { notifications_sent: 3, message: "Care team notified" } },
    ],
    error: null,
    duration_seconds: 8,
    executed_by: null,
    created_at: "2026-03-26T14:32:00Z",
  },
  {
    id: 3,
    skill_id: 1,
    skill_name: "New Data Refresh",
    triggered_by: "event",
    status: "failed",
    steps_completed: 3,
    steps_total: 6,
    results: [
      { step: 1, action: "run_quality_checks", status: "completed", output: { issues_found: 1, message: "Quality checks completed" } },
      { step: 2, action: "run_hcc_engine", status: "completed", output: { suspects_found: 8, message: "HCC engine analysis completed" } },
      { step: 3, action: "detect_care_gaps", status: "completed", output: { gaps_found: 4, message: "Care gap detection completed" } },
      { step: 4, action: "run_discovery", status: "failed", error: "Timeout after 60s" },
    ],
    error: "Step 4 (run_discovery) failed: Timeout after 60s",
    duration_seconds: 65,
    executed_by: null,
    created_at: "2026-03-26T02:14:00Z",
  },
];

export const mockSkillPresets = [
  {
    id: "preset_new_data_refresh",
    name: "New Data Refresh",
    description: "Complete data pipeline: ingest, validate, analyze, and refresh dashboards when new data arrives.",
    trigger_type: "event",
    trigger_config: { event_type: "data_ingested" },
    steps: [
      { order: 1, action: "run_quality_checks", params: { scope: "latest_batch" }, description: "Run data quality checks on new data" },
      { order: 2, action: "run_hcc_engine", params: { scope: "new_claims_only" }, description: "Run HCC suspect detection on new claims" },
      { order: 3, action: "detect_care_gaps", params: { scope: "affected_members" }, description: "Detect care gaps for affected members" },
      { order: 4, action: "run_discovery", params: { full: false }, description: "Run pattern discovery on new data" },
      { order: 5, action: "generate_insights", params: { scope: "incremental" }, description: "Generate AI insights from new data" },
      { order: 6, action: "refresh_dashboard", params: {}, description: "Refresh all dashboard metrics" },
    ],
    created_from: "preset",
    scope: "global",
    expected_outcome: "Dashboards reflect new data, new suspects and gaps identified, insights generated.",
  },
  {
    id: "preset_post_discharge",
    name: "Post-Discharge Protocol",
    description: "Automatically initiates care coordination after a patient discharge: TCM case, HCC review, care manager assignment.",
    trigger_type: "event",
    trigger_config: { event_type: "adt_discharge", filter: { patient_class: "inpatient" } },
    steps: [
      { order: 1, action: "create_action_items", params: { type: "tcm_case", priority: "high", assign_to_role: "care_manager" }, description: "Create TCM case for discharged patient" },
      { order: 2, action: "run_hcc_engine", params: { scope: "single_member" }, description: "Check HCC opportunities for patient" },
      { order: 3, action: "detect_care_gaps", params: { scope: "single_member" }, description: "Check for open care gaps" },
      { order: 4, action: "create_action_items", params: { type: "follow_up", days_from_now: 2, assign_to_role: "care_manager" }, description: "Schedule 48-hour follow-up" },
      { order: 5, action: "send_notification", params: { channel: "in_app", template: "post_discharge_alert" }, description: "Notify care team of discharge" },
    ],
    created_from: "preset",
    scope: "global",
    expected_outcome: "Care team is alerted, TCM case created, follow-up scheduled within 48 hours.",
  },
  {
    id: "preset_quarterly_hcc_chase",
    name: "Quarterly HCC Chase",
    description: "Run full HCC analysis, generate prioritized chase lists, and assign to providers for documentation.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 8 1 1,4,7,10 *" },
    steps: [
      { order: 1, action: "run_hcc_engine", params: { scope: "full_population" }, description: "Run HCC suspect detection on full population" },
      { order: 2, action: "generate_chase_list", params: { sort_by: "raf_value", min_raf: 0.1 }, description: "Generate prioritized chase list" },
      { order: 3, action: "create_action_items", params: { assign_to_role: "care_manager", priority: "high" }, description: "Create action items for care managers" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "chase_list_ready" }, description: "Notify team that chase list is ready" },
    ],
    created_from: "preset",
    scope: "global",
    expected_outcome: "Chase list distributed to providers, action items created for top RAF-value suspects.",
  },
  {
    id: "preset_awv_campaign",
    name: "AWV Campaign",
    description: "Identify members due for Annual Wellness Visits, generate outreach lists, and schedule reminders.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 9 1 * *" },
    steps: [
      { order: 1, action: "detect_care_gaps", params: { measures: ["AWV"], scope: "full_population" }, description: "Identify members due for AWV" },
      { order: 2, action: "generate_chase_list", params: { type: "awv_outreach", sort_by: "raf_value" }, description: "Generate AWV outreach list" },
      { order: 3, action: "create_action_items", params: { type: "outreach_call", assign_to_role: "outreach" }, description: "Create outreach tasks" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "awv_campaign_started" }, description: "Notify outreach team of new campaign" },
    ],
    created_from: "preset",
    scope: "global",
    expected_outcome: "Outreach team receives prioritized list of members due for AWV, tasks created.",
  },
  {
    id: "preset_monthly_board_report",
    name: "Monthly Board Report",
    description: "Refresh all data, generate comprehensive insights, and produce the monthly executive report.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 6 1 * *" },
    steps: [
      { order: 1, action: "refresh_dashboard", params: {}, description: "Refresh all dashboard metrics" },
      { order: 2, action: "run_hcc_engine", params: { scope: "full_population" }, description: "Run full HCC analysis" },
      { order: 3, action: "detect_care_gaps", params: { scope: "full_population" }, description: "Run care gap detection" },
      { order: 4, action: "calculate_stars", params: {}, description: "Calculate current star rating projection" },
      { order: 5, action: "generate_insights", params: { scope: "full", report_type: "executive" }, description: "Generate executive insights" },
      { order: 6, action: "generate_report", params: { template: "monthly_board", format: "pdf" }, description: "Generate board report PDF" },
      { order: 7, action: "send_notification", params: { channel: "in_app", template: "board_report_ready", roles: ["mso_admin"] }, description: "Notify admin that report is ready" },
    ],
    created_from: "preset",
    scope: "global",
    expected_outcome: "Board report generated with latest metrics, insights, and projections.",
  },
];

export const mockSkillSuggestions = [
  {
    name: "Weekly Quality Review",
    description: "Every Monday, run quality checks, detect care gaps, evaluate alert rules, and notify the quality team of any issues.",
    trigger_type: "schedule",
    trigger_config: { cron: "0 8 * * 1" },
    steps: [
      { order: 1, action: "run_quality_checks", params: {}, description: "Run data quality checks" },
      { order: 2, action: "detect_care_gaps", params: { scope: "full_population" }, description: "Detect care gaps" },
      { order: 3, action: "evaluate_alert_rules", params: {}, description: "Evaluate alert rules" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "weekly_quality" }, description: "Notify quality team" },
    ],
    reason: "You run quality checks and gap detection frequently. Automating this weekly would save ~2 hours per week.",
  },
  {
    name: "High-Risk Member Monitor",
    description: "When a member's RAF score changes by more than 0.5, automatically run HCC analysis, check care gaps, and alert the care manager.",
    trigger_type: "condition",
    trigger_config: { metric: "raf_change", operator: "gt", threshold: 0.5 },
    steps: [
      { order: 1, action: "run_hcc_engine", params: { scope: "single_member" }, description: "Run HCC analysis for member" },
      { order: 2, action: "detect_care_gaps", params: { scope: "single_member" }, description: "Check care gaps" },
      { order: 3, action: "create_action_items", params: { priority: "high", assign_to_role: "care_manager" }, description: "Create high-priority action item" },
      { order: 4, action: "send_notification", params: { channel: "in_app", template: "high_risk_alert" }, description: "Alert care manager" },
    ],
    reason: "Proactive monitoring of high-risk members ensures timely intervention and better outcomes.",
  },
];

export const mockSkillActions = [
  { action: "run_hcc_engine", label: "Run HCC Engine", description: "Analyze population for HCC suspect conditions", category: "Revenue" },
  { action: "generate_chase_list", label: "Generate Chase List", description: "Create prioritized list of HCC suspects for provider review", category: "Revenue" },
  { action: "detect_care_gaps", label: "Detect Care Gaps", description: "Run care gap detection for quality measures", category: "Quality" },
  { action: "generate_insights", label: "Generate Insights", description: "Use AI to generate actionable insights from data", category: "Intelligence" },
  { action: "run_discovery", label: "Run Discovery", description: "AI pattern discovery across population data", category: "Intelligence" },
  { action: "create_action_items", label: "Create Action Items", description: "Create tasks and assign to team members", category: "Workflow" },
  { action: "send_notification", label: "Send Notification", description: "Send in-app or email notifications", category: "Communication" },
  { action: "generate_report", label: "Generate Report", description: "Generate PDF/Excel report from template", category: "Reporting" },
  { action: "evaluate_alert_rules", label: "Evaluate Alert Rules", description: "Check all alert rules against current data", category: "Monitoring" },
  { action: "refresh_dashboard", label: "Refresh Dashboard", description: "Recalculate all dashboard metrics", category: "Data" },
  { action: "run_quality_checks", label: "Run Quality Checks", description: "Execute data quality validation rules", category: "Data" },
  { action: "calculate_stars", label: "Calculate Stars", description: "Run Stars rating projection calculator", category: "Quality" },
];

// ---- Data Protection ----

export const mockProtectionDashboard = {
  overall_score: 94,
  layers: [
    {
      name: "Source Fingerprinting",
      status: "active",
      description: "Recognize returning sources instantly for zero-config re-import",
      metric: "4 known sources, 47 auto-matches",
      last_triggered: "2 hours ago",
      effectiveness: 97,
    },
    {
      name: "Field Confidence Scoring",
      status: "active",
      description: "Every field gets 0-100 confidence score",
      metric: "Avg confidence: 91",
      last_triggered: "1 hour ago",
      effectiveness: 93,
    },
    {
      name: "Shadow Processing",
      status: "active",
      description: "Compare new data against prior state from same source",
      metric: "3 anomalies caught this month",
      last_triggered: "4 hours ago",
      effectiveness: 89,
    },
    {
      name: "Cross-Source Validation",
      status: "active",
      description: "Use multiple sources to validate each other",
      metric: "12 conflicts resolved",
      last_triggered: "6 hours ago",
      effectiveness: 95,
    },
    {
      name: "Statistical Anomaly Detection",
      status: "active",
      description: "File-level sanity checks before any row processing",
      metric: "2 files flagged this week",
      last_triggered: "3 hours ago",
      effectiveness: 96,
    },
    {
      name: "Golden Record Management",
      status: "active",
      description: "Maintain best-known version of each entity",
      metric: "4,832 members tracked, 38,656 fields",
      last_triggered: "1 hour ago",
      effectiveness: 92,
    },
    {
      name: "Batch Rollback",
      status: "active",
      description: "Undo an entire ingestion if problems are found",
      metric: "1 rollback of 8 batches",
      last_triggered: "2 days ago",
      effectiveness: 100,
    },
    {
      name: "Data Contract Testing",
      status: "active",
      description: "Validate files against expected schemas",
      metric: "3 active contracts",
      last_triggered: "5 hours ago",
      effectiveness: 91,
    },
  ],
};

export const mockFingerprints = [
  {
    id: 1,
    source_name: "Acme Health Plan — Monthly Roster",
    fingerprint_hash: "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    column_count: 18,
    column_names: ["member_id", "first_name", "last_name", "dob", "gender", "address", "city", "state", "zip", "phone", "pcp_npi", "plan_id", "lob", "effective_date", "term_date", "raf_score", "risk_level", "attribution_group"],
    date_formats: { dob: "MM/DD/YYYY", effective_date: "YYYY-MM-DD", term_date: "YYYY-MM-DD" },
    value_patterns: { member_id: "text", raf_score: "numeric", pcp_npi: "npi", zip: "numeric" },
    mapping_template_id: 1,
    times_matched: 23,
    created_at: "2025-09-15T10:30:00Z",
    updated_at: "2026-03-25T14:22:00Z",
  },
  {
    id: 2,
    source_name: "Claims Clearinghouse — 837P",
    fingerprint_hash: "b4c3d9e2f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    column_count: 24,
    column_names: ["claim_id", "member_id", "service_date", "billed_date", "provider_npi", "rendering_npi", "facility_npi", "place_of_service", "primary_dx", "dx2", "dx3", "dx4", "cpt_code", "modifier", "units", "billed_amount", "allowed_amount", "paid_amount", "copay", "coinsurance", "deductible", "plan_id", "lob", "auth_number"],
    date_formats: { service_date: "YYYY-MM-DD", billed_date: "YYYY-MM-DD" },
    value_patterns: { claim_id: "text", member_id: "text", provider_npi: "npi", primary_dx: "icd10", cpt_code: "cpt", billed_amount: "numeric" },
    mapping_template_id: 2,
    times_matched: 12,
    created_at: "2025-10-01T08:15:00Z",
    updated_at: "2026-03-20T11:45:00Z",
  },
  {
    id: 3,
    source_name: "PharmaRx — Pharmacy Claims",
    fingerprint_hash: "c5d4e0f3a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
    column_count: 16,
    column_names: ["rx_claim_id", "member_id", "fill_date", "ndc_code", "drug_name", "quantity", "days_supply", "pharmacy_npi", "prescriber_npi", "ingredient_cost", "dispensing_fee", "copay", "plan_paid", "formulary_tier", "generic_indicator", "refill_number"],
    date_formats: { fill_date: "MM/DD/YYYY" },
    value_patterns: { rx_claim_id: "text", member_id: "text", ndc_code: "text", quantity: "numeric", ingredient_cost: "numeric" },
    mapping_template_id: 3,
    times_matched: 8,
    created_at: "2025-11-12T09:00:00Z",
    updated_at: "2026-03-18T16:30:00Z",
  },
  {
    id: 4,
    source_name: "LabCorp — Results Feed",
    fingerprint_hash: "d6e5f1a4b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
    column_count: 14,
    column_names: ["order_id", "member_id", "collection_date", "result_date", "loinc_code", "test_name", "result_value", "result_unit", "reference_range", "abnormal_flag", "ordering_npi", "performing_lab", "specimen_type", "status"],
    date_formats: { collection_date: "YYYY-MM-DD", result_date: "YYYY-MM-DD" },
    value_patterns: { order_id: "text", member_id: "text", loinc_code: "text", result_value: "numeric", ordering_npi: "npi" },
    mapping_template_id: null,
    times_matched: 4,
    created_at: "2026-01-08T13:20:00Z",
    updated_at: "2026-03-22T10:10:00Z",
  },
];

export const mockDataContracts = [
  {
    id: 1,
    name: "Standard Roster Contract",
    source_name: "Acme Health Plan — Monthly Roster",
    contract_rules: {
      required_columns: ["member_id", "first_name", "last_name", "dob", "pcp_npi"],
      expected_columns: ["member_id", "first_name", "last_name", "dob", "gender", "address", "city", "state", "zip", "phone", "pcp_npi", "plan_id", "lob", "effective_date", "term_date", "raf_score", "risk_level", "attribution_group"],
      column_types: { member_id: "string", dob: "date", pcp_npi: "npi", raf_score: "decimal", zip: "string" },
      row_count_range: { min: 4000, max: 6000 },
      unique_keys: ["member_id"],
    },
    is_active: true,
    violations_last_30d: 2,
    last_tested: "2026-03-25T14:22:00Z",
    created_at: "2025-09-20T10:00:00Z",
    updated_at: "2026-03-25T14:22:00Z",
  },
  {
    id: 2,
    name: "Claims 837P Contract",
    source_name: "Claims Clearinghouse — 837P",
    contract_rules: {
      required_columns: ["claim_id", "member_id", "service_date", "primary_dx", "cpt_code", "billed_amount"],
      column_types: { service_date: "date", primary_dx: "icd10", cpt_code: "string", billed_amount: "decimal", provider_npi: "npi" },
      row_count_range: { min: 500, max: 50000 },
      unique_keys: ["claim_id"],
      value_ranges: { billed_amount: { min: 0, max: 500000 } },
    },
    is_active: true,
    violations_last_30d: 0,
    last_tested: "2026-03-20T11:45:00Z",
    created_at: "2025-10-05T08:30:00Z",
    updated_at: "2026-03-20T11:45:00Z",
  },
  {
    id: 3,
    name: "Pharmacy Claims Contract",
    source_name: "PharmaRx — Pharmacy Claims",
    contract_rules: {
      required_columns: ["rx_claim_id", "member_id", "fill_date", "ndc_code", "drug_name"],
      column_types: { fill_date: "date", quantity: "integer", days_supply: "integer", ingredient_cost: "decimal" },
      row_count_range: { min: 200, max: 30000 },
      unique_keys: ["rx_claim_id"],
    },
    is_active: true,
    violations_last_30d: 1,
    last_tested: "2026-03-18T16:30:00Z",
    created_at: "2025-11-15T09:15:00Z",
    updated_at: "2026-03-18T16:30:00Z",
  },
];

export const mockGoldenRecords = [
  { id: 1, member_id: 1001, field_name: "first_name", value: "Margaret", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 95, updated_at: "2026-03-25T14:22:00Z" },
  { id: 2, member_id: 1001, field_name: "last_name", value: "Thompson", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 95, updated_at: "2026-03-25T14:22:00Z" },
  { id: 3, member_id: 1001, field_name: "dob", value: "1948-06-15", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 99, updated_at: "2026-03-25T14:22:00Z" },
  { id: 4, member_id: 1001, field_name: "gender", value: "F", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 99, updated_at: "2026-03-25T14:22:00Z" },
  { id: 5, member_id: 1001, field_name: "address", value: "1247 Oak Ridge Dr", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 85, updated_at: "2026-03-20T10:00:00Z" },
  { id: 6, member_id: 1001, field_name: "city", value: "Springfield", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 90, updated_at: "2026-03-20T10:00:00Z" },
  { id: 7, member_id: 1001, field_name: "state", value: "IL", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 99, updated_at: "2026-03-20T10:00:00Z" },
  { id: 8, member_id: 1001, field_name: "zip", value: "62704", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 95, updated_at: "2026-03-20T10:00:00Z" },
  { id: 9, member_id: 1001, field_name: "pcp_npi", value: "1234567893", source: "Claims Clearinghouse — 837P", source_priority: 70, confidence: 99, updated_at: "2026-03-22T08:15:00Z" },
  { id: 10, member_id: 1001, field_name: "primary_dx", value: "E11.65", source: "Claims Clearinghouse — 837P", source_priority: 90, confidence: 99, updated_at: "2026-03-22T08:15:00Z" },
  { id: 11, member_id: 1001, field_name: "phone", value: "(217) 555-0142", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 75, updated_at: "2026-02-15T11:30:00Z" },
  { id: 12, member_id: 1001, field_name: "raf_score", value: "1.847", source: "Acme Health Plan — Monthly Roster", source_priority: 80, confidence: 95, updated_at: "2026-03-25T14:22:00Z" },
];

export const mockIngestionBatches = [
  { id: 8, source_name: "Acme Health Plan — Monthly Roster", upload_job_id: 42, record_count: 4832, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-03-25T14:00:00Z" },
  { id: 7, source_name: "Claims Clearinghouse — 837P", upload_job_id: 41, record_count: 12847, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-03-20T11:30:00Z" },
  { id: 6, source_name: "PharmaRx — Pharmacy Claims", upload_job_id: 40, record_count: 8234, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-03-18T16:00:00Z" },
  { id: 5, source_name: "LabCorp — Results Feed", upload_job_id: 39, record_count: 3421, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-03-15T09:45:00Z" },
  { id: 4, source_name: "Acme Health Plan — Monthly Roster", upload_job_id: 38, record_count: 4801, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-02-25T14:15:00Z" },
  { id: 3, source_name: "Claims Clearinghouse — 837P", upload_job_id: 37, record_count: 11923, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-02-20T10:00:00Z" },
  { id: 2, source_name: "Claims Clearinghouse — 837P", upload_job_id: 36, record_count: 145, status: "rolled_back", rolled_back_at: "2026-02-15T16:30:00Z", rolled_back_by: 1, rollback_reason: "File contained only 145 records — suspected truncation. Normal batch is 10,000+. Vendor confirmed partial export error.", created_at: "2026-02-15T15:00:00Z" },
  { id: 1, source_name: "Acme Health Plan — Monthly Roster", upload_job_id: 35, record_count: 4756, status: "active", rolled_back_at: null, rolled_back_by: null, rollback_reason: null, created_at: "2026-01-25T13:30:00Z" },
];
