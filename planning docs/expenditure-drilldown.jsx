import { useState } from "react";

const C = {
  bg: "#09090b", surface: "#18181b", card: "#1c1c21",
  border: "#27272a", borderLight: "#3f3f46",
  text: "#fafafa", sub: "#a1a1aa", dim: "#71717a",
  g: "#22c55e", gM: "rgba(34,197,94,0.12)",
  b: "#3b82f6", bM: "rgba(59,130,246,0.12)",
  a: "#f59e0b", aM: "rgba(245,158,11,0.12)",
  r: "#ef4444", rM: "rgba(239,68,68,0.12)",
  p: "#a78bfa", pM: "rgba(167,139,250,0.1)",
  c: "#06b6d4", cM: "rgba(6,182,212,0.1)",
};
const m = "'IBM Plex Mono','JetBrains Mono',monospace";
const s = "'Outfit','Inter',system-ui,sans-serif";

const Badge = ({ children, color = C.g, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: m, fontWeight: 600, color, background: bg || C.gM }}>{children}</span>
);
const Chip = ({ label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontFamily: m, fontWeight: 700, color: C.p, background: C.pM }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.p }} />{label}
  </span>
);

function Bar({ value, max, color = C.b, height = 6 }) {
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.border }}>
      <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.6s ease" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = [
  { id: "inpatient", label: "Inpatient", icon: "🏥", pmpm: 412, prior: 458, benchmark: 380, pct: 33 },
  { id: "er", label: "ED / Observation", icon: "🚑", pmpm: 187, prior: 201, benchmark: 155, pct: 15 },
  { id: "professional", label: "Professional", icon: "👨‍⚕️", pmpm: 224, prior: 218, benchmark: 200, pct: 18 },
  { id: "snf", label: "SNF / Post-Acute", icon: "🏠", pmpm: 156, prior: 171, benchmark: 130, pct: 13 },
  { id: "pharmacy", label: "Pharmacy", icon: "💊", pmpm: 198, prior: 192, benchmark: 175, pct: 16 },
  { id: "other", label: "Ancillary / Other", icon: "📋", pmpm: 70, prior: 72, benchmark: 60, pct: 5 },
];

const DRILL = {
  inpatient: {
    title: "Inpatient Spend Breakdown",
    totalPmpm: 412, targetPmpm: 380,
    kpis: [
      { label: "Admits / 1K", value: "248", benchmark: "220", status: "over" },
      { label: "ALOS", value: "5.2d", benchmark: "4.8d", status: "over" },
      { label: "Readmit Rate", value: "14.2%", benchmark: "11%", status: "over" },
      { label: "Cost / Admit", value: "$18,420", benchmark: "$16,800", status: "over" },
    ],
    facilities: [
      { name: "Memorial Hospital", admits: 142, alos: 5.8, cost: 2614, readmit: 16.2, trend: "↑", flag: true },
      { name: "St. Luke's Medical Ctr", admits: 98, alos: 4.6, cost: 1607, readmit: 11.3, trend: "↓" },
      { name: "Bayfront Health", admits: 67, alos: 5.1, cost: 1134, readmit: 14.9, trend: "→", flag: true },
      { name: "Tampa General", admits: 34, alos: 6.2, cost: 816, readmit: 12.1, trend: "↑" },
    ],
    topDrgs: [
      { drg: "291", desc: "Heart Failure & Shock w/ MCC", cases: 38, avgCost: 14200, benchmark: 12800, excess: 53200 },
      { drg: "193", desc: "Pneumonia w/ MCC", cases: 29, avgCost: 11800, benchmark: 10200, excess: 46400 },
      { drg: "470", desc: "Major Hip/Knee Joint Replacement", cases: 24, avgCost: 22100, benchmark: 19500, excess: 62400 },
      { drg: "689", desc: "Kidney & UTI w/ MCC", cases: 22, avgCost: 9800, benchmark: 8900, excess: 19800 },
      { drg: "392", desc: "Esophagitis & GI w/o MCC", cases: 18, avgCost: 7200, benchmark: 6800, excess: 7200 },
    ],
    aiInsights: [
      { type: "critical", text: "Memorial Hospital readmission rate 16.2% — 47% above benchmark. 23 potentially avoidable readmissions in 12mo. Estimated waste: $423K.", action: "Implement SNF transition protocol + 48hr post-discharge calls" },
      { type: "high", text: "DRG 291 (CHF) cost/case $1,400 above benchmark across all facilities. Driven by ALOS 6.1 vs 5.2 benchmark.", action: "Deploy CHF clinical pathway with daily weight monitoring + early diuresis protocol" },
      { type: "high", text: "34 observation-to-inpatient conversions in Q1 — 18 could have remained obs based on clinical criteria.", action: "Implement InterQual/MCG real-time utilization review at ED" },
      { type: "medium", text: "Bayfront Health accepting 22% of admits that other facilities would manage as outpatient. Physician practice pattern variance.", action: "Share facility-level benchmarking data with admitting physicians" },
    ],
  },
  er: {
    title: "ED / Observation Spend Breakdown",
    totalPmpm: 187, targetPmpm: 155,
    kpis: [
      { label: "ED Visits / 1K", value: "412", benchmark: "350", status: "over" },
      { label: "Obs Stays / 1K", value: "48", benchmark: "38", status: "over" },
      { label: "ED→Admit Rate", value: "28%", benchmark: "24%", status: "over" },
      { label: "Avg ED Cost", value: "$1,847", benchmark: "$1,520", status: "over" },
    ],
    details: [
      { category: "Low-acuity ED visits (avoidable)", visits: 847, cost: 42, pctTotal: 22, flag: true },
      { category: "Observation stays", visits: 137, cost: 58, pctTotal: 31 },
      { category: "ED treat-and-release (appropriate)", visits: 612, cost: 47, pctTotal: 25 },
      { category: "ED → Inpatient conversion", visits: 178, cost: 40, pctTotal: 22 },
    ],
    obsVsInpatient: [
      { scenario: "Obs stays that should have been inpatient", count: 12, lostRevenue: "$86K", impact: "Under-coded — lost DRG payment" },
      { scenario: "Inpatient stays that could have been obs", count: 18, savedCost: "$142K", impact: "Excess bed days + higher cost share" },
      { scenario: "2-midnight rule violations", count: 7, riskAmount: "$54K", impact: "RAC audit exposure" },
    ],
    aiInsights: [
      { type: "critical", text: "847 low-acuity ED visits (22% of total) — primary care accessible conditions. $423K in avoidable ED spend.", action: "Deploy nurse triage line + after-hours urgent care access for top 5 SNFs" },
      { type: "high", text: "Obs-to-inpatient classification errors costing $228K in either lost revenue or excess spend. 37 cases flagged.", action: "Implement AI-powered status determination at point of admission using clinical criteria" },
      { type: "medium", text: "7 potential 2-midnight rule violations creating RAC audit exposure of ~$54K.", action: "Auto-flag admits under 48hrs for physician advisor review" },
    ],
  },
  professional: {
    title: "Professional Services Breakdown",
    totalPmpm: 224, targetPmpm: 200,
    kpis: [
      { label: "PCP Visits / 1K", value: "4,120", benchmark: "4,500", status: "under" },
      { label: "Specialist Visits / 1K", value: "3,840", benchmark: "3,200", status: "over" },
      { label: "Specialist Referral Rate", value: "38%", benchmark: "28%", status: "over" },
      { label: "Avg Specialist Cost", value: "$342", benchmark: "$295", status: "over" },
    ],
    specialists: [
      { specialty: "Cardiology", visits: 412, pmpm: 38, benchmark: 28, excess: "$28K", topProvider: "Heart Assoc of FL", flag: true },
      { specialty: "Orthopedics", visits: 298, pmpm: 31, benchmark: 22, excess: "$25K", topProvider: "Coastal Ortho", flag: true },
      { specialty: "Gastroenterology", visits: 187, pmpm: 22, benchmark: 18, excess: "$11K", topProvider: "Bay GI Specialists" },
      { specialty: "Pulmonology", visits: 156, pmpm: 18, benchmark: 15, excess: "$8K", topProvider: "FL Lung Center" },
      { specialty: "Nephrology", visits: 134, pmpm: 16, benchmark: 14, excess: "$6K", topProvider: "Kidney Care FL" },
      { specialty: "Endocrinology", visits: 89, pmpm: 11, benchmark: 10, excess: "$3K", topProvider: "Endocrine Assoc" },
      { specialty: "Psychiatry", visits: 67, pmpm: 8, benchmark: 9, excess: null, topProvider: "BayCare Behavioral" },
      { specialty: "All Other", visits: 497, pmpm: 80, benchmark: 84, excess: null, topProvider: "Various" },
    ],
    aiInsights: [
      { type: "critical", text: "Specialist referral rate 38% vs 28% benchmark — 285 potentially avoidable specialist visits. Primary care managing fewer conditions in-house.", action: "Implement eConsult program for cardiology + orthopedics (top 2 excess specialties). Avg eConsult resolves 40% without face-to-face visit." },
      { type: "high", text: "Cardiology utilization $10/PMPM over benchmark. Heart Assoc of FL ordering 2.3x more echos per patient than peer cardiologists.", action: "Peer benchmarking report to cardiology group + utilization review on advanced imaging" },
      { type: "high", text: "PCP visit rate below benchmark — under-utilizing primary care while over-utilizing specialists. Inverse of optimal managed care pattern.", action: "Incentivize PCP panel engagement through quality bonus tied to visit completeness" },
      { type: "medium", text: "Psychiatry under benchmark — good cost position but potential access gap given depression prevalence in panel (PHQ-9 data shows 18% moderate+).", action: "Monitor behavioral health access metrics. Consider collaborative care model integration." },
    ],
  },
  snf: {
    title: "SNF / Post-Acute Spend Breakdown",
    totalPmpm: 156, targetPmpm: 130,
    kpis: [
      { label: "SNF Admits / 1K", value: "89", benchmark: "72", status: "over" },
      { label: "Avg LOS", value: "24.3d", benchmark: "19d", status: "over" },
      { label: "SNF→Hospital Rate", value: "18%", benchmark: "12%", status: "over" },
      { label: "Home Health Util", value: "Low", benchmark: "Moderate", status: "under" },
    ],
    facilities: [
      { name: "Sunrise SNF", admits: 87, alos: 22.1, costPerDay: 412, rehospRate: 14, qualityScore: 4, star: "★★★★" },
      { name: "Palm Gardens", admits: 64, alos: 28.4, costPerDay: 388, rehospRate: 22, qualityScore: 2, star: "★★", flag: true },
      { name: "Bayshore Care", admits: 52, alos: 21.8, costPerDay: 395, rehospRate: 16, qualityScore: 3, star: "★★★" },
      { name: "Harbor Health", admits: 41, alos: 26.1, costPerDay: 405, rehospRate: 19, qualityScore: 2, star: "★★", flag: true },
      { name: "Gulf Breeze Rehab", admits: 38, alos: 18.2, costPerDay: 435, rehospRate: 8, qualityScore: 5, star: "★★★★★" },
    ],
    aiInsights: [
      { type: "critical", text: "Palm Gardens: 22% rehospitalization rate (2× benchmark), ALOS 28.4 days (49% above benchmark). Estimated excess spend: $312K/year. CMS 2-star facility.", action: "Restrict new admissions to Palm Gardens. Redirect to Gulf Breeze Rehab (5-star, 8% rehosp, lower ALOS) or Sunrise (4-star). Projected savings: $180-240K." },
      { type: "critical", text: "SNF admission rate 89/1K vs 72/1K benchmark — 17 excess SNF admissions per 1,000 members. Many post-surgical patients could discharge home with home health.", action: "Implement home health first protocol: PT/OT eval at bedside pre-discharge. If safe for home + HH, avoid SNF. Target: 30% reduction in SNF admits for joint replacement." },
      { type: "high", text: "Home health utilization significantly below benchmark. Inversely correlated with high SNF utilization — members going to SNF who could be managed at home.", action: "Partner with home health agency for bundled post-acute program. Estimated PMPM reduction: $18-26." },
      { type: "medium", text: "Harbor Health: 19% rehosp rate with 2-star quality. Accepting complex patients beyond their clinical capability.", action: "Implement acuity-based SNF placement — high-acuity patients to 4/5-star facilities only." },
    ],
  },
  pharmacy: {
    title: "Pharmacy Spend Breakdown",
    totalPmpm: 198, targetPmpm: 175,
    kpis: [
      { label: "Generic Rate", value: "82%", benchmark: "88%", status: "under" },
      { label: "Specialty %", value: "42%", benchmark: "38%", status: "over" },
      { label: "Adherence (PDC)", value: "76%", benchmark: "80%", status: "under" },
      { label: "Polypharmacy Rate", value: "34%", benchmark: "28%", status: "over" },
    ],
    topClasses: [
      { cls: "GLP-1 Agonists", pmpm: 42, prior: 31, growth: "+35%", members: 312, avgCost: 1247, flag: true },
      { cls: "Anticoagulants (DOACs)", pmpm: 28, prior: 26, growth: "+8%", members: 487, avgCost: 485 },
      { cls: "Insulin (all types)", pmpm: 22, prior: 24, growth: "-8%", members: 298, avgCost: 612 },
      { cls: "Specialty Oncology", pmpm: 18, prior: 15, growth: "+20%", members: 34, avgCost: 4847, flag: true },
      { cls: "PPI / GI", pmpm: 14, prior: 14, growth: "0%", members: 512, avgCost: 86 },
      { cls: "Statins", pmpm: 12, prior: 13, growth: "-8%", members: 892, avgCost: 42 },
      { cls: "ACE/ARB", pmpm: 9, prior: 9, growth: "0%", members: 756, avgCost: 28 },
      { cls: "Opioids", pmpm: 8, prior: 11, growth: "-27%", members: 124, avgCost: 187 },
    ],
    brandToGeneric: [
      { brand: "Eliquis (apixaban)", members: 312, monthCost: 520, genericAlt: "Rivaroxaban generic", altCost: 45, savings: "$178K/yr" },
      { brand: "Jardiance", members: 89, monthCost: 580, genericAlt: "Metformin optimization", altCost: 12, savings: "$61K/yr" },
      { brand: "Symbicort", members: 67, monthCost: 380, genericAlt: "Budesonide/formoterol generic", altCost: 85, savings: "$24K/yr" },
    ],
    aiInsights: [
      { type: "critical", text: "GLP-1 spend up 35% YoY ($42 PMPM) — fastest growing category. 312 members, 87 on Ozempic for weight management (non-DM indication). Coverage criteria review needed.", action: "Implement prior auth for GLP-1 non-DM use. Ensure DM patients on GLP-1s have diagnosis properly coded (HCC 37/38). Review step therapy requirements." },
      { type: "high", text: "Generic dispensing rate 82% vs 88% benchmark. Top brand-to-generic opportunities worth $263K/year in savings across 3 drug classes.", action: "Pharmacy benefit manager therapeutic interchange program for Eliquis→generic DOAC, brand inhaler→generic alternatives." },
      { type: "high", text: "PDC adherence 76% vs 80% target. Non-adherence in diabetes + statins + RAS antagonists directly impacts HEDIS Stars (D12-D14 measures, triple-weighted).", action: "Auto-flag members with PDC <80% for pharmacist outreach. 90-day supply + mail order incentives. Ties directly to Star Ratings improvement." },
      { type: "medium", text: "Polypharmacy rate 34% — 968 members on 10+ medications. Associated with higher fall risk, ADEs, and ER utilization.", action: "Deprescribing review program via clinical pharmacist embedded in top 3 PCP practices. Target: 15% reduction in unnecessary meds." },
    ],
  },
  other: {
    title: "Ancillary / Other Spend",
    totalPmpm: 70, targetPmpm: 60,
    kpis: [
      { label: "Imaging PMPM", value: "$28", benchmark: "$22", status: "over" },
      { label: "DME PMPM", value: "$18", benchmark: "$15", status: "over" },
      { label: "Lab PMPM", value: "$14", benchmark: "$13", status: "ok" },
      { label: "Transport PMPM", value: "$10", benchmark: "$10", status: "ok" },
    ],
    aiInsights: [
      { type: "high", text: "Advanced imaging (MRI/CT) utilization 22% above benchmark. 34% ordered by specialists without prior PCP review.", action: "Implement radiology benefit management program with prior auth for advanced imaging. eConsult pathway for MSK imaging." },
      { type: "medium", text: "DME spend driven by hospital beds + wheelchairs for SNF-to-home transitions. 28% of DME orders lack supporting documentation.", action: "Standardize DME ordering templates with required clinical justification. Competitive bidding for top 5 DME categories." },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// Components
// ═══════════════════════════════════════════════════════════════

function InsightCard({ insight }) {
  const colors = { critical: C.r, high: C.a, medium: C.b };
  const bgs = { critical: C.rM, high: C.aM, medium: C.bM };
  return (
    <div style={{ padding: 14, background: bgs[insight.type], borderRadius: 8, border: `1px solid ${colors[insight.type]}22`, borderLeft: `3px solid ${colors[insight.type]}`, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Chip label="AI INSIGHT" />
        <Badge color={colors[insight.type]} bg={`${colors[insight.type]}22`}>{insight.type.toUpperCase()}</Badge>
      </div>
      <div style={{ fontFamily: s, fontSize: 12, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{insight.text}</div>
      <div style={{ fontFamily: s, fontSize: 11, color: colors[insight.type], fontWeight: 600 }}>
        → {insight.action}
      </div>
    </div>
  );
}

function DrillView({ data }) {
  if (!data) return null;
  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.kpis.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
        {data.kpis.map((k, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", borderTop: `2px solid ${k.status === "over" ? C.r : k.status === "under" ? C.a : C.g}` }}>
            <div style={{ fontFamily: m, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontFamily: m, fontSize: 20, fontWeight: 700, color: C.text, marginTop: 4 }}>{k.value}</div>
            <div style={{ fontFamily: m, fontSize: 10, color: C.dim }}>Benchmark: {k.benchmark}</div>
          </div>
        ))}
      </div>

      {/* Facility/detail tables */}
      {data.facilities && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Facility Performance</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.facilities.map((f, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1.5fr 0.5fr 0.5fr 0.7fr 0.6fr 0.4fr",
                gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`,
                borderLeft: f.flag ? `3px solid ${C.r}` : "3px solid transparent",
                background: f.flag ? "rgba(239,68,68,0.03)" : "transparent",
              }}>
                <div>
                  <span style={{ fontFamily: s, fontSize: 12, fontWeight: 600, color: C.text }}>{f.name}</span>
                  {f.star && <span style={{ marginLeft: 6, fontSize: 10, color: C.a }}>{f.star}</span>}
                </div>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{f.admits} admits</span>
                <span style={{ fontFamily: m, fontSize: 11, color: f.alos > 25 ? C.r : C.sub }}>ALOS {f.alos}d</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{f.cost ? `$${f.cost.toLocaleString()}K` : `$${f.costPerDay}/day`}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: (f.readmit || f.rehospRate) > 15 ? C.r : C.g }}>{f.readmit || f.rehospRate}% readmit</span>
                <span style={{ fontFamily: m, fontSize: 12, color: f.trend === "↑" ? C.r : f.trend === "↓" ? C.g : C.dim }}>{f.trend}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top DRGs */}
      {data.topDrgs && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Top DRGs by Excess Cost</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.topDrgs.map((d, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1.5fr 0.4fr 0.6fr 0.6fr 0.6fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: m, fontSize: 11, fontWeight: 600, color: C.b }}>DRG {d.drg}</span>
                <span style={{ fontFamily: s, fontSize: 11, color: C.text }}>{d.desc}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{d.cases} cases</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.r }}>${d.avgCost.toLocaleString()}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.dim }}>Bench: ${d.benchmark.toLocaleString()}</span>
                <span style={{ fontFamily: m, fontSize: 11, fontWeight: 700, color: C.r }}>+${d.excess.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Specialist breakdown */}
      {data.specialists && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Specialist Utilization</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.specialists.map((sp, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 0.5fr 0.5fr 0.6fr 1fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`, borderLeft: sp.flag ? `3px solid ${C.a}` : "3px solid transparent" }}>
                <span style={{ fontFamily: s, fontSize: 12, fontWeight: 600, color: C.text }}>{sp.specialty}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{sp.visits} visits</span>
                <span style={{ fontFamily: m, fontSize: 11, color: sp.pmpm > sp.benchmark ? C.r : C.g }}>${sp.pmpm}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.dim }}>Bench: ${sp.benchmark}</span>
                <span style={{ fontFamily: m, fontSize: 11, fontWeight: 600, color: sp.excess ? C.r : C.g }}>{sp.excess || "✓ At/Under"}</span>
                <span style={{ fontFamily: m, fontSize: 10, color: C.dim }}>{sp.topProvider}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Obs vs Inpatient */}
      {data.obsVsInpatient && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Observation vs Inpatient Status Analysis</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.obsVsInpatient.map((o, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.4fr 0.6fr 1fr", gap: 8, padding: "12px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: s, fontSize: 12, color: C.text }}>{o.scenario}</span>
                <span style={{ fontFamily: m, fontSize: 12, fontWeight: 700, color: C.a }}>{o.count} cases</span>
                <span style={{ fontFamily: m, fontSize: 12, fontWeight: 600, color: C.r }}>{o.lostRevenue || o.savedCost || o.riskAmount}</span>
                <span style={{ fontFamily: s, fontSize: 11, color: C.sub }}>{o.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pharmacy details */}
      {data.topClasses && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Drug Class Spend</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.topClasses.map((d, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`, borderLeft: d.flag ? `3px solid ${C.a}` : "3px solid transparent" }}>
                <span style={{ fontFamily: s, fontSize: 12, fontWeight: 600, color: C.text }}>{d.cls}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>${d.pmpm} PMPM</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.dim }}>${d.prior} prior</span>
                <span style={{ fontFamily: m, fontSize: 11, color: d.growth.startsWith("+") && parseInt(d.growth) > 10 ? C.r : d.growth.startsWith("-") ? C.g : C.dim }}>{d.growth}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{d.members} mbrs</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.dim }}>${d.avgCost}/mbr/mo</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand to generic */}
      {data.brandToGeneric && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Brand → Generic / Therapeutic Interchange Opportunities</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {data.brandToGeneric.map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.4fr 0.5fr 1.2fr 0.5fr 0.6fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: s, fontSize: 12, fontWeight: 600, color: C.text }}>{b.brand}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.sub }}>{b.members} mbrs</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.r }}>${b.monthCost}/mo</span>
                <span style={{ fontFamily: s, fontSize: 11, color: C.g }}>→ {b.genericAlt}</span>
                <span style={{ fontFamily: m, fontSize: 11, color: C.g }}>${b.altCost}/mo</span>
                <span style={{ fontFamily: m, fontSize: 12, fontWeight: 700, color: C.g }}>{b.savings}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Insights */}
      <div style={{ fontFamily: m, fontSize: 10, color: C.p, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>AI Optimization Recommendations</div>
      {data.aiInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
export default function ExpenditureAnalytics() {
  const [selected, setSelected] = useState(null);
  const totalPmpm = CATEGORIES.reduce((s, c) => s + c.pmpm, 0);
  const totalBenchmark = CATEGORIES.reduce((s, c) => s + c.benchmark, 0);
  const totalPrior = CATEGORIES.reduce((s, c) => s + c.prior, 0);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: s }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(9,9,11,0.95)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.g}, ${C.b})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: m, color: "#000" }}>A</div>
          <span style={{ fontFamily: m, fontWeight: 700, fontSize: 14 }}>AQSoft<span style={{ color: C.g }}>.AI</span></span>
          <span style={{ fontFamily: m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>Expenditure Intelligence</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.b} bg={C.bM}>CY 2026</Badge>
          <Badge>Sunstate Medical Group</Badge>
          <Badge color={C.dim} bg={C.surface}>2,847 lives</Badge>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Total PMPM", value: `$${totalPmpm.toLocaleString()}`, sub: `Benchmark: $${totalBenchmark}`, color: totalPmpm > totalBenchmark ? C.r : C.g },
            { label: "vs Prior Year", value: `-$${totalPrior - totalPmpm}`, sub: `Prior: $${totalPrior}`, color: C.g },
            { label: "Excess Spend", value: `$${totalPmpm - totalBenchmark}`, sub: `$${((totalPmpm - totalBenchmark) * 2847 * 12 / 1000).toFixed(0)}K annually`, color: C.r },
            { label: "AI Savings Found", value: "$1.4M", sub: "18 actionable recommendations", color: C.p },
          ].map((k, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", borderTop: `2px solid ${k.color}` }}>
              <div style={{ fontFamily: m, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ fontFamily: m, fontSize: 26, fontWeight: 700, color: C.text, marginTop: 4 }}>{k.value}</div>
              <div style={{ fontFamily: m, fontSize: 10, color: k.color, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Category cards — click to drill */}
        <div style={{ fontFamily: m, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Spend Categories — click to drill down
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 24 }}>
          {CATEGORIES.map((cat) => {
            const isSelected = selected === cat.id;
            const overBench = cat.pmpm > cat.benchmark;
            return (
              <div key={cat.id} onClick={() => setSelected(isSelected ? null : cat.id)} style={{
                background: isSelected ? C.surface : C.card,
                border: `1px solid ${isSelected ? C.borderLight : C.border}`,
                borderRadius: 10, padding: "14px 12px", cursor: "pointer",
                borderBottom: isSelected ? `3px solid ${C.g}` : `3px solid transparent`,
                transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{cat.icon}</div>
                <div style={{ fontFamily: s, fontWeight: 700, fontSize: 12, color: C.text }}>{cat.label}</div>
                <div style={{ fontFamily: m, fontSize: 18, fontWeight: 700, color: C.text, marginTop: 4 }}>${cat.pmpm}</div>
                <div style={{ fontFamily: m, fontSize: 9, color: C.dim }}>PMPM · {cat.pct}%</div>
                <div style={{ marginTop: 6 }}><Bar value={cat.pmpm} max={500} color={overBench ? C.r : C.g} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontFamily: m, fontSize: 9, color: cat.pmpm < cat.prior ? C.g : C.r }}>
                    {cat.pmpm < cat.prior ? "↓" : "↑"} vs prior
                  </span>
                  <span style={{ fontFamily: m, fontSize: 9, color: overBench ? C.r : C.g }}>
                    {overBench ? `+$${cat.pmpm - cat.benchmark}` : `✓`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drill-down panel */}
        {selected && DRILL[selected] && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.borderLight}`, padding: 20, animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ fontFamily: s, fontWeight: 800, fontSize: 18, color: C.text, margin: 0 }}>{DRILL[selected].title}</h3>
                <Chip label="AI ANALYSIS" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge color={C.r} bg={C.rM}>${DRILL[selected].totalPmpm} PMPM</Badge>
                <Badge color={C.dim} bg={C.surface}>Target: ${DRILL[selected].targetPmpm}</Badge>
              </div>
            </div>
            <DrillView data={DRILL[selected]} />
          </div>
        )}

        {!selected && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.dim }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◫</div>
            <div style={{ fontFamily: s, fontSize: 14 }}>Select a category above to drill into facility-level, provider-level, and drug-level spend analysis with AI optimization recommendations.</div>
          </div>
        )}
      </div>
    </div>
  );
}
