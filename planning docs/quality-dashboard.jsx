import { useState } from "react";

const C = {
  bg: "#09090b", surface: "#18181b", card: "#1c1c21", cardHover: "#242429",
  border: "#27272a", borderLight: "#3f3f46",
  text: "#fafafa", textSecondary: "#a1a1aa", textDim: "#71717a",
  accent: "#22c55e", accentMuted: "rgba(34,197,94,0.12)",
  blue: "#3b82f6", blueMuted: "rgba(59,130,246,0.12)",
  amber: "#f59e0b", amberMuted: "rgba(245,158,11,0.12)",
  red: "#ef4444", redMuted: "rgba(239,68,68,0.12)",
  purple: "#a78bfa", purpleMuted: "rgba(167,139,250,0.1)",
  cyan: "#06b6d4", cyanMuted: "rgba(6,182,212,0.1)",
  pink: "#ec4899", pinkMuted: "rgba(236,72,153,0.1)",
};
const mono = "'IBM Plex Mono','JetBrains Mono',monospace";
const sans = "'Outfit','Inter',system-ui,sans-serif";

const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: mono, fontWeight: 600, color, background: bg || C.accentMuted }}>{children}</span>
);

const AiChip = ({ label = "AI" }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontFamily: mono, fontWeight: 700, color: C.purple, background: C.purpleMuted }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.purple }} />{label}
  </span>
);

// Star visualization
function StarRating({ rating, size = 16 }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {[...Array(5)].map((_, i) => (
        <span key={i} style={{ fontSize: size, color: i < full ? "#f59e0b" : i === full && half ? "#f59e0b" : "#3f3f46" }}>
          {i < full ? "★" : i === full && half ? "★" : "☆"}
        </span>
      ))}
      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.text, marginLeft: 4 }}>{rating.toFixed(1)}</span>
    </div>
  );
}

// Gauge visualization
function Gauge({ value, target, label, color = C.accent, unit = "%" }) {
  const pct = Math.min((value / target) * 100, 100);
  const isGood = value >= target;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 80, height: 40, margin: "0 auto 6px", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: `4px solid ${C.border}`, borderBottomColor: "transparent", borderRightColor: "transparent", transform: "rotate(225deg)" }} />
        <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: `4px solid ${isGood ? C.accent : C.amber}`, borderBottomColor: "transparent", borderRightColor: "transparent", transform: `rotate(${225 + (pct / 100) * 180}deg)`, transition: "transform 0.8s ease" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", fontFamily: mono, fontSize: 16, fontWeight: 700, color: isGood ? C.accent : C.amber }}>{value}{unit}</div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim }}>Target: {target}{unit}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════════════

const TABS = [
  { id: "stars", label: "Star Ratings", icon: "★" },
  { id: "hedis", label: "HEDIS", icon: "◈" },
  { id: "mips", label: "MIPS", icon: "◉" },
  { id: "spend", label: "Expenditures", icon: "◫" },
  { id: "gaps", label: "Care Gaps", icon: "⊘" },
];

const HEDIS_MEASURES = [
  { domain: "Effectiveness of Care", measures: [
    { code: "CBP", name: "Controlling High Blood Pressure", rate: 72.1, target: 75, benchmark: 78, trend: "+2.3", weight: 3, star: 4 },
    { code: "CDC-HbA1c", name: "Comprehensive Diabetes Care — HbA1c Control (<8%)", rate: 64.8, target: 68, benchmark: 72, trend: "+1.1", weight: 3, star: 3 },
    { code: "CDC-Eye", name: "Comprehensive Diabetes Care — Eye Exam", rate: 58.3, target: 65, benchmark: 70, trend: "-1.2", weight: 3, star: 3, alert: true },
    { code: "CDC-KED", name: "Kidney Health Evaluation for Diabetes", rate: 41.2, target: 50, benchmark: 55, trend: "+5.4", weight: 1, star: 2, alert: true },
    { code: "COL", name: "Colorectal Cancer Screening", rate: 71.4, target: 72, benchmark: 76, trend: "+0.8", weight: 1, star: 4 },
    { code: "BCS", name: "Breast Cancer Screening", rate: 74.2, target: 75, benchmark: 79, trend: "+1.5", weight: 1, star: 4 },
    { code: "COA-MedReview", name: "Care for Older Adults — Medication Review", rate: 86.1, target: 85, benchmark: 90, trend: "+3.2", weight: 1, star: 4 },
    { code: "COA-Pain", name: "Care for Older Adults — Pain Assessment", rate: 82.4, target: 80, benchmark: 88, trend: "+1.8", weight: 1, star: 4 },
    { code: "COA-Functional", name: "Care for Older Adults — Functional Status", rate: 79.5, target: 80, benchmark: 85, trend: "-0.4", weight: 1, star: 3 },
    { code: "MRP", name: "Medication Reconciliation Post-Discharge", rate: 67.3, target: 72, benchmark: 78, trend: "+4.1", weight: 1, star: 3 },
    { code: "FMC", name: "Follow-Up After ED Visit for Multiple Chronic Conditions", rate: 52.1, target: 58, benchmark: 64, trend: "+2.8", weight: 1, star: 3, alert: true },
    { code: "SPD", name: "Statin Therapy — Received & Adherence (Diabetes)", rate: 81.2, target: 80, benchmark: 85, trend: "+0.6", weight: 3, star: 4 },
  ]},
  { domain: "Access / Availability", measures: [
    { code: "AAP", name: "Adults' Access to Preventive/Ambulatory Services", rate: 91.3, target: 90, benchmark: 93, trend: "+0.2", weight: 1, star: 5 },
  ]},
];

const MIPS_CATEGORIES = [
  { name: "Quality", weight: 30, score: 78, max: 100, measures: [
    { id: "MIPS 236", name: "Controlling Blood Pressure", rate: 72 },
    { id: "MIPS 226", name: "Tobacco Screening & Cessation", rate: 94 },
    { id: "MIPS 130", name: "Documentation of Current Medications", rate: 89 },
    { id: "MIPS 47", name: "Advance Care Plan", rate: 45 },
    { id: "MIPS 1", name: "Diabetes: HbA1c Poor Control (>9%)", rate: 18, inverse: true },
    { id: "MIPS 418", name: "Falls: Screening for Future Fall Risk", rate: 82 },
  ]},
  { name: "Promoting Interoperability", weight: 25, score: 85, max: 100, measures: [
    { id: "e-Prescribing", name: "e-Prescribing", rate: 92 },
    { id: "HIE", name: "Health Information Exchange", rate: 78 },
    { id: "CEHRT", name: "Provide Patients Electronic Access", rate: 85 },
  ]},
  { name: "Improvement Activities", weight: 15, score: 40, max: 40, measures: [
    { id: "IA_EPA_1", name: "Participation in APM", rate: 100 },
    { id: "IA_CC_8", name: "Care Coordination Agreements", rate: 100 },
  ]},
  { name: "Cost", weight: 30, score: 62, max: 100, measures: [
    { id: "TPCC", name: "Total Per Capita Cost", rate: 62 },
    { id: "MSPB", name: "Medicare Spending Per Beneficiary", rate: 58 },
  ]},
];

const EXPENDITURE_DATA = {
  pmpm: { current: 1247, target: 1180, prior: 1312, benchmark: 1150 },
  mlr: { current: 86.2, target: 85, prior: 88.1 },
  categories: [
    { name: "Inpatient", current: 412, prior: 458, pct: 33, trend: "↓" },
    { name: "Outpatient/ER", current: 187, prior: 201, pct: 15, trend: "↓" },
    { name: "Professional", current: 224, prior: 218, pct: 18, trend: "↑" },
    { name: "SNF/Post-Acute", current: 156, prior: 171, pct: 13, trend: "↓" },
    { name: "Pharmacy", current: 198, prior: 192, pct: 16, trend: "↑" },
    { name: "Other", current: 70, prior: 72, pct: 5, trend: "↓" },
  ],
  highCostMembers: [
    { name: "Member A", spend: 142000, conditions: "ESRD + CHF + DM", status: "Care mgmt active" },
    { name: "Member B", spend: 98000, conditions: "Lung transplant + COPD", status: "Transition plan" },
    { name: "Member C", spend: 87000, conditions: "Hemophilia A", status: "Specialty pharmacy" },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════════

function StarsView() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Overall Star Rating — CY 2026</div>
          <StarRating rating={3.5} size={28} />
          <div style={{ fontFamily: sans, fontSize: 12, color: C.amber, marginTop: 4 }}>0.5 stars from Quality Bonus Payment threshold (4.0)</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Part C", rating: 3.5 },
            { label: "Part D", rating: 4.0 },
            { label: "Overall", rating: 3.5 },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{s.label}</div>
              <StarRating rating={s.rating} size={14} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Measures at 4+ Stars", value: "8/13", color: C.accent },
          { label: "Measures Below Target", value: "4", color: C.red },
          { label: "Improvement YoY", value: "+0.3★", color: C.accent },
          { label: "QBP Value if 4★", value: "$1.8M", color: C.amber },
          { label: "Key Gap", value: "CDC-Eye", color: C.red },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 16px", background: C.amberMuted, borderRadius: 8, border: `1px solid rgba(245,158,11,0.2)`, marginBottom: 16 }}>
        <AiChip label="INSIGHT" />
        <span style={{ fontFamily: sans, fontSize: 12, color: C.amber, fontWeight: 600, marginLeft: 8 }}>
          Improving CDC-Eye Exam from 58.3% to 65% and CDC-KED from 41.2% to 50% would push overall to 4.0★, unlocking ~$1.8M in QBP.
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.textSecondary, marginLeft: 4 }}>
          That's 312 eye exams and 418 kidney health evaluations to close.
        </span>
      </div>
    </div>
  );
}

function HedisView() {
  return (
    <div>
      {HEDIS_MEASURES.map((domain, di) => (
        <div key={di} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>{domain.domain}</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "70px 1.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.4fr 0.4fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mono, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
              <span>Code</span><span>Measure</span><span>Rate</span><span>Target</span><span>4★ Cut</span><span>Trend</span><span>Wt</span><span>Star</span>
            </div>
            {domain.measures.map((m, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "70px 1.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.4fr 0.4fr",
                gap: 8, padding: "8px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`,
                background: m.alert ? "rgba(239,68,68,0.04)" : "transparent",
                borderLeft: m.alert ? `3px solid ${C.red}` : "3px solid transparent",
              }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: m.alert ? C.red : C.blue }}>{m.code}</span>
                <span style={{ fontFamily: sans, fontSize: 11, color: C.text }}>{m.name}</span>
                <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: m.rate >= m.target ? C.accent : C.red }}>{m.rate}%</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>{m.target}%</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>{m.benchmark}%</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: m.trend.startsWith("+") ? C.accent : C.red }}>{m.trend}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: m.weight >= 3 ? C.amber : C.textDim }}>{m.weight}×</span>
                <StarRating rating={m.star} size={10} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MipsView() {
  const totalScore = Math.round(MIPS_CATEGORIES.reduce((sum, cat) => sum + (cat.score / cat.max) * cat.weight, 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>MIPS Composite Score — PY 2026</div>
          <div style={{ fontFamily: mono, fontSize: 36, fontWeight: 700, color: totalScore >= 75 ? C.accent : C.amber }}>{totalScore}<span style={{ fontSize: 16, color: C.textDim }}>/100</span></div>
          <div style={{ fontFamily: sans, fontSize: 12, color: totalScore >= 75 ? C.accent : C.amber }}>
            {totalScore >= 75 ? "Above threshold — positive payment adjustment" : "Below exceptional — room for bonus improvement"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {MIPS_CATEGORIES.map((cat, i) => (
            <Gauge key={i} value={Math.round((cat.score / cat.max) * 100)} target={75} label={cat.name} />
          ))}
        </div>
      </div>

      {MIPS_CATEGORIES.map((cat, ci) => (
        <div key={ci} style={{ marginBottom: 14, background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.text }}>{cat.name}</span>
              <Badge color={C.blue} bg={C.blueMuted}>{cat.weight}% weight</Badge>
            </div>
            <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: (cat.score / cat.max) >= 0.75 ? C.accent : C.amber }}>
              {cat.score}/{cat.max}
            </span>
          </div>
          <div style={{ padding: "8px 14px" }}>
            {cat.measures.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < cat.measures.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim, minWidth: 70 }}>{m.id}</span>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{m.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: C.border }}>
                    <div style={{ width: `${m.rate}%`, height: "100%", borderRadius: 2, background: (m.inverse ? m.rate <= 20 : m.rate >= 75) ? C.accent : m.rate >= 50 ? C.amber : C.red }} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.textSecondary, minWidth: 35, textAlign: "right" }}>{m.rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpenditureView() {
  const d = EXPENDITURE_DATA;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "PMPM (Current)", value: `$${d.pmpm.current}`, sub: `Target: $${d.pmpm.target}`, color: d.pmpm.current <= d.pmpm.target ? C.accent : C.red },
          { label: "PMPM (Prior Year)", value: `$${d.pmpm.prior}`, sub: `Δ: -$${d.pmpm.prior - d.pmpm.current}`, color: C.accent },
          { label: "Medical Loss Ratio", value: `${d.mlr.current}%`, sub: `Target: ≤${d.mlr.target}%`, color: d.mlr.current <= d.mlr.target ? C.accent : C.amber },
          { label: "Benchmark PMPM", value: `$${d.pmpm.benchmark}`, sub: `Gap: $${d.pmpm.current - d.pmpm.benchmark}`, color: C.blue },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: s.color, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Spend by Category (PMPM)</div>
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 20 }}>
        {d.categories.map((cat, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 50px 40px 1fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.text }}>{cat.name}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>${cat.current}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>${cat.prior} prior</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: cat.trend === "↓" ? C.accent : C.red }}>{cat.trend}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim }}>{cat.pct}%</span>
            <div style={{ height: 6, borderRadius: 3, background: C.border }}>
              <div style={{ width: `${cat.pct * 2.5}%`, height: "100%", borderRadius: 3, background: cat.trend === "↓" ? C.accent : C.amber, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: mono, fontSize: 10, color: C.red, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>High-Cost Members (Top 3)</div>
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {d.highCostMembers.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 1.5fr 1fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.text }}>{m.name}</span>
            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.red }}>${(m.spend / 1000).toFixed(0)}K</span>
            <span style={{ fontFamily: sans, fontSize: 11, color: C.textSecondary }}>{m.conditions}</span>
            <Badge color={C.blue} bg={C.blueMuted}>{m.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function CareGapsView() {
  const gaps = [
    { measure: "CDC-Eye", name: "Diabetic Eye Exam", eligible: 847, compliant: 494, gap: 353, impact: "★ Star measure", priority: "critical" },
    { measure: "CDC-KED", name: "Kidney Health Eval (DM)", eligible: 847, compliant: 349, gap: 498, impact: "★ Star measure (new)", priority: "critical" },
    { measure: "CBP", name: "Blood Pressure Control", eligible: 2104, compliant: 1517, gap: 587, impact: "★ Star measure (3×)", priority: "high" },
    { measure: "COL", name: "Colorectal Cancer Screen", eligible: 1862, compliant: 1330, gap: 532, impact: "★ Star measure", priority: "high" },
    { measure: "MRP", name: "Med Reconciliation Post-DC", eligible: 312, compliant: 210, gap: 102, impact: "★ Star measure", priority: "high" },
    { measure: "FMC", name: "Follow-Up After ED (Chronic)", eligible: 189, compliant: 98, gap: 91, impact: "★ Star measure", priority: "high" },
    { measure: "ACP", name: "Advance Care Planning", eligible: 2847, compliant: 1282, gap: 1565, impact: "MIPS Quality", priority: "medium" },
    { measure: "AWV", name: "Annual Wellness Visit", eligible: 2847, compliant: 1893, gap: 954, impact: "RAF Recapture", priority: "medium" },
    { measure: "FALL", name: "Falls Risk Screening", eligible: 2847, compliant: 2335, gap: 512, impact: "MIPS Quality", priority: "low" },
  ];

  const totalGaps = gaps.reduce((s, g) => s + g.gap, 0);
  const criticalGaps = gaps.filter(g => g.priority === "critical").reduce((s, g) => s + g.gap, 0);

  const priColor = { critical: C.red, high: C.amber, medium: C.blue, low: C.textDim };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Open Gaps", value: totalGaps.toLocaleString(), color: C.red },
          { label: "Critical (Star Impact)", value: criticalGaps.toLocaleString(), color: C.red },
          { label: "Members with 3+ Gaps", value: "842", color: C.amber },
          { label: "Gaps Closed MTD", value: "347", color: C.accent },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 16px", background: C.purpleMuted, borderRadius: 8, border: `1px solid rgba(167,139,250,0.2)`, marginBottom: 16 }}>
        <AiChip label="PRIORITIZER" />
        <span style={{ fontFamily: sans, fontSize: 12, color: C.purple, fontWeight: 600, marginLeft: 8 }}>
          Focus: 353 diabetic eye exams + 498 kidney health evals = highest Star Rating ROI.
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.textSecondary, marginLeft: 4 }}>
          Auto-generating outreach lists for scheduling.
        </span>
      </div>

      <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1.5fr 0.5fr 0.5fr 0.5fr 0.6fr 1fr 0.5fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mono, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Measure</span><span>Name</span><span>Eligible</span><span>Compliant</span><span>Gap</span><span>Rate</span><span>Impact</span><span>Priority</span>
        </div>
        {gaps.map((g, i) => {
          const rate = Math.round((g.compliant / g.eligible) * 100);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "80px 1.5fr 0.5fr 0.5fr 0.5fr 0.6fr 1fr 0.5fr",
              gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`,
              borderLeft: `3px solid ${priColor[g.priority]}`,
              background: g.priority === "critical" ? "rgba(239,68,68,0.04)" : "transparent",
            }}>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: priColor[g.priority] }}>{g.measure}</span>
              <span style={{ fontFamily: sans, fontSize: 11, color: C.text }}>{g.name}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.textSecondary }}>{g.eligible.toLocaleString()}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.accent }}>{g.compliant.toLocaleString()}</span>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.red }}>{g.gap.toLocaleString()}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border }}>
                  <div style={{ width: `${rate}%`, height: "100%", borderRadius: 2, background: rate >= 75 ? C.accent : rate >= 60 ? C.amber : C.red }} />
                </div>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.textSecondary }}>{rate}%</span>
              </div>
              <span style={{ fontFamily: sans, fontSize: 10, color: C.textSecondary }}>{g.impact}</span>
              <Badge color={priColor[g.priority]} bg={g.priority === "critical" ? C.redMuted : g.priority === "high" ? C.amberMuted : C.blueMuted}>
                {g.priority.toUpperCase()}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Quality Dashboard
// ═══════════════════════════════════════════════════════════════════
export default function QualityDashboard() {
  const [tab, setTab] = useState("stars");

  const views = { stars: StarsView, hedis: HedisView, mips: MipsView, spend: ExpenditureView, gaps: CareGapsView };
  const View = views[tab];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(9,9,11,0.95)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: mono, color: "#000" }}>A</div>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: C.text }}>AQSoft<span style={{ color: C.accent }}>.AI</span></span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>Quality & Performance</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? C.surface : "transparent",
              border: tab === t.id ? `1px solid ${C.borderLight}` : "1px solid transparent",
              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
              fontFamily: mono, fontSize: 11, fontWeight: 600,
              color: tab === t.id ? C.accent : C.textSecondary,
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.blue} bg={C.blueMuted}>MY 2026</Badge>
          <Badge>Sunstate Medical Group</Badge>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        <View />
      </div>

      <footer style={{ padding: "8px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, color: C.textDim }}>
        <span>AQSoft.AI Quality Module · HEDIS MY 2026 · CMS Star Ratings CY 2026 · MIPS PY 2026</span>
        <span>Data refreshed: March 23, 2026 · 2,847 attributed lives</span>
      </footer>
    </div>
  );
}
