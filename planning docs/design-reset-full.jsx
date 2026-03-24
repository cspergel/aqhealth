import { useState } from "react";

/*
 * DESIGN RESET v2 — Full Encounter Workflow
 * Intelligence invisible. Warm, clean, premium.
 * No AI badges. No purple chips. No "powered by" labels.
 * Just a tool that obviously works beautifully.
 */

const T = {
  bg: "#fafaf9", surface: "#ffffff", alt: "#f5f5f4",
  border: "#e7e5e4", borderSoft: "#f0eeec",
  text: "#1c1917", sec: "#57534e", muted: "#a8a29e",
  accent: "#16a34a", accentSoft: "#dcfce7", accentText: "#15803d",
  blue: "#2563eb", blueSoft: "#dbeafe", blueText: "#1e40af",
  amber: "#d97706", amberSoft: "#fef3c7", amberText: "#92400e",
  red: "#dc2626", redSoft: "#fee2e2", redText: "#991b1b",
};
const hd = "system-ui,-apple-system,sans-serif";
const bd = "'Inter',system-ui,sans-serif";
const cd = "'SF Mono','JetBrains Mono','Fira Code',monospace";

function Tag({ children, v = "default" }) {
  const s = {
    default: { bg: T.alt, c: T.sec, b: T.border },
    green: { bg: T.accentSoft, c: T.accentText, b: "#bbf7d0" },
    amber: { bg: T.amberSoft, c: T.amberText, b: "#fde68a" },
    red: { bg: T.redSoft, c: T.redText, b: "#fecaca" },
    blue: { bg: T.blueSoft, c: T.blueText, b: "#bfdbfe" },
    new: { bg: "#f0fdf4", c: T.accentText, b: "#86efac" },
  }[v] || { bg: T.alt, c: T.sec, b: T.border };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontFamily: bd, fontWeight: 500, color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════
const SCHEDULE = [
  { name: "Margaret Chen", age: 72, room: "204B", type: "SNF Admission H&P", reason: "3 suspected conditions, annual recapture due", raf: 1.847, suspects: 3, gaps: 4, urgency: "high", time: "8:00 AM", prepStatus: "ready" },
  { name: "Robert Williams", age: 68, room: "118A", type: "Follow-up", reason: "PHQ-9 elevated, depression not documented", raf: 1.234, suspects: 2, gaps: 2, urgency: "high", time: "9:30 AM", prepStatus: "ready" },
  { name: "Dorothy Martinez", age: 81, room: "305", type: "Recapture Visit", reason: "4 HCCs expiring this payment year", raf: 2.456, suspects: 1, gaps: 1, urgency: "medium", time: "10:30 AM", prepStatus: "ready" },
  { name: "James Thornton", age: 78, room: "210", type: "New Admission", reason: "Recent hip fracture — chart prep in progress", raf: 0.8, suspects: 0, gaps: 0, urgency: "medium", time: "11:30 AM", prepStatus: "building" },
  { name: "Patricia Okafor", age: 84, room: "112B", type: "Weekly Round", reason: "Stable, no open gaps", raf: 1.1, suspects: 0, gaps: 0, urgency: "low", time: "1:00 PM", prepStatus: "ready" },
  { name: "Gerald Foster", age: 71, room: "220", type: "Follow-up", reason: "Post-observation, chest pain workup complete", raf: 0.95, suspects: 1, gaps: 1, urgency: "low", time: "2:00 PM", prepStatus: "ready" },
];

const SOURCES = [
  { name: "Memorial Hospital Discharge Summary", format: "PDF", items: 14, status: "Extracted" },
  { name: "PCC Clinical Dashboard", format: "Scrape", items: 22, status: "Current" },
  { name: "Prior Year Claims (Humana)", format: "837", items: 8, status: "Imported" },
  { name: "Quest Diagnostics", format: "HL7", items: 6, status: "Received" },
];

const PREP_SECTIONS = [
  { name: "History of Present Illness", confidence: 94, status: "complete" },
  { name: "Active Problem List", confidence: 92, status: "complete", note: "12 diagnoses mapped, 3 suspects identified" },
  { name: "Medication Reconciliation", confidence: 96, status: "complete", note: "Hospital → SNF reconciled, 2 interactions flagged" },
  { name: "Screening Scores", confidence: 90, status: "complete", note: "BIMS 8, PHQ-9 14, Braden 16" },
  { name: "Assessment & Plan", confidence: 88, status: "draft", note: "10 problems with individualized plans" },
  { name: "Physical Exam", confidence: 85, status: "template", note: "Pre-filled from last documented findings" },
];

const PROBLEMS = [
  { num: 1, dx: "Acute on chronic systolic heart failure", icd: "I50.22", hcc: 85, raf: 0.323, status: "recapture",
    assessment: "EF 35% on recent echo. Admitted for exacerbation, now euvolemic on oral diuretics. BNP 4200 → 890.",
    plan: ["Lasix 40mg BID — daily weights, call if gain >2 lb/day", "Sodium restriction 2g/day", "Cardiology follow-up in 2 weeks", "Repeat echo in 3 months"] },
  { num: 2, dx: "Type 2 diabetes with hyperglycemia", icd: "E11.65", hcc: 37, raf: 0.302, status: "recapture",
    assessment: "Last HbA1c 8.2%, overdue for recheck. Metformin 500 BID. Complicated by CKD — renal dose appropriate.",
    plan: ["Continue Metformin 500mg BID (hold if Cr >2.0)", "Order HbA1c — due for CY2026", "Diabetic eye exam referral", "Renal diet per dietitian"] },
  { num: 3, dx: "CKD Stage 3b", icd: "N18.32", hcc: 138, raf: 0.069, status: "recapture",
    assessment: "Cr 1.8, eGFR 38. Stable. No proteinuria. On ACE inhibitor.",
    plan: ["Continue Lisinopril 20mg", "Recheck BMP in 3 months", "Nephrology referral if eGFR <30", "Avoid NSAIDs and contrast"] },
  { num: 4, dx: "Major depressive disorder, recurrent, moderate", icd: "F33.1", hcc: 155, raf: 0.309, status: "new",
    assessment: "PHQ-9: 14/27 on admission screening. On Sertraline 100mg with partial response. Sleep and appetite impaired.",
    plan: ["Continue Sertraline 100mg — consider uptitration", "Psychiatry consult", "Repeat PHQ-9 in 2 weeks", "Fall precautions (sedation risk)"] },
  { num: 5, dx: "COPD with acute exacerbation", icd: "J44.1", hcc: 111, raf: 0.280, status: "recapture",
    assessment: "Home O2 2L. FEV1/FVC 0.62. Exacerbation from fluid overload — improving with diuresis.",
    plan: ["Albuterol neb Q4H PRN", "Prednisone taper 40→30→20→10 over 8 days", "Pulmonology follow-up", "Verify influenza + pneumococcal vaccine status"] },
];

const SUSPECTS = [
  { dx: "Mild protein-calorie malnutrition", icd: "E44.1", hcc: 21, raf: 0.455, evidence: "Albumin 3.2 g/dL, BMI 20.1, 5% weight loss in 30 days per nursing note (3/19)" },
  { dx: "Chronic respiratory failure with hypoxia", icd: "J96.11", hcc: 83, raf: 0.282, evidence: "Home O2 at 2L/min documented in discharge summary (3/12), SpO2 88% on room air" },
];

const CARE_GAPS = [
  { gap: "HbA1c not drawn in CY2026", measure: "CDC-HbA1c", weight: "3×", action: "Order lab" },
  { gap: "Diabetic retinal exam overdue", measure: "CDC-Eye", weight: "3×", action: "Refer ophthalmology" },
  { gap: "Kidney health evaluation incomplete", measure: "KED", weight: "1×", action: "Order eGFR + uACR" },
  { gap: "Depression follow-up within 30 days", measure: "FMC", weight: "3×", action: "Schedule f/u" },
];

const INTERACTIONS = [
  { name: "DM + CHF", bonus: 0.121 },
  { name: "CHF + COPD", bonus: 0.145 },
];

const BILLING_CHECKS = [
  { check: "ICD-10 / CPT pairing", result: "pass", detail: "All 8 codes properly linked" },
  { check: "Medical necessity", result: "pass", detail: "Meets LCD/NCD criteria" },
  { check: "Modifier validation", result: "pass", detail: "No issues" },
  { check: "Payer-specific edits (Humana)", result: "pass", detail: "142 rules passed" },
  { check: "Prior authorization", result: "pass", detail: "Not required for MA SNF" },
  { check: "Duplicate claim check", result: "pass", detail: "No duplicates" },
  { check: "Credential / NPI", result: "warning", detail: "Verify group NPI is current" },
  { check: "Timely filing", result: "pass", detail: "Within 365-day window" },
];

// ═══════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════

function ScheduleView({ onSelect }) {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Today's patients</h2>
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>Sorted by clinical priority and documentation opportunity</p>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {SCHEDULE.map((p, i) => (
          <div key={i} onClick={() => onSelect("prep")} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
            padding: "14px 18px", cursor: "pointer", display: "grid",
            gridTemplateColumns: "72px 1.4fr 0.7fr 0.4fr 0.4fr 0.4fr 80px",
            gap: 12, alignItems: "center", transition: "box-shadow 0.15s",
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"}
          onMouseOut={e => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ fontFamily: cd, fontSize: 12, color: T.muted }}>{p.time}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{p.age}yo · Rm {p.room} · {p.type}</div>
            </div>
            <div style={{ fontSize: 12, color: T.sec, lineHeight: 1.4 }}>{p.reason}</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: cd, fontSize: 15, fontWeight: 600, color: T.text }}>{p.raf.toFixed(3)}</div>
              <div style={{ fontSize: 10, color: T.muted }}>RAF</div>
            </div>
            <div style={{ textAlign: "center" }}>
              {p.suspects > 0 ? <Tag v="amber">{p.suspects} suspect{p.suspects > 1 ? "s" : ""}</Tag> : <span style={{ fontSize: 11, color: T.muted }}>—</span>}
            </div>
            <div style={{ textAlign: "center" }}>
              {p.gaps > 0 ? <Tag v="red">{p.gaps} gap{p.gaps > 1 ? "s" : ""}</Tag> : <Tag v="green">None</Tag>}
            </div>
            <div style={{ textAlign: "right" }}>
              <Tag v={p.prepStatus === "ready" ? "green" : "amber"}>{p.prepStatus === "ready" ? "Chart ready" : "Building..."}</Tag>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrepView({ onSelect }) {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Chart prep — Margaret Chen</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>72yo · Rm 204B · Humana Gold Plus · Admitted 3/18 for CHF exacerbation</p>
        </div>
        <button onClick={() => onSelect("encounter")} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Open encounter →</button>
      </div>

      {/* Sources */}
      <div style={{ fontSize: 12, fontWeight: 600, color: T.sec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Data sources</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 24 }}>
        {SOURCES.map((s, i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{s.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.muted }}>{s.format} · {s.items} items</span>
              <Tag v="green">{s.status}</Tag>
            </div>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={{ fontSize: 12, fontWeight: 600, color: T.sec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Pre-built note sections</div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        {PREP_SECTIONS.map((s, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 80px 80px", gap: 12, padding: "12px 18px", alignItems: "center", borderBottom: i < PREP_SECTIONS.length - 1 ? `1px solid ${T.borderSoft}` : "none" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{s.name}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{s.note || ""}</span>
            <span style={{ fontFamily: cd, fontSize: 12, color: s.confidence >= 90 ? T.accentText : T.amber }}>{s.confidence}%</span>
            <Tag v={s.status === "complete" ? "green" : s.status === "draft" ? "amber" : "default"}>{s.status}</Tag>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "14px 18px", background: T.accentSoft, borderRadius: 10, border: `1px solid #bbf7d0`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.accentText }}>Chart prep complete — note is ~85% pre-built. Review and edit as needed.</span>
        <span style={{ fontFamily: cd, fontSize: 12, color: T.muted }}>Compiled in 4.2 seconds</span>
      </div>
    </div>
  );
}

function EncounterView() {
  const [showSuspects, setShowSuspects] = useState([false, false]);
  const totalBase = PROBLEMS.reduce((s, p) => s + (p.raf || 0), 0);
  const totalInteraction = INTERACTIONS.reduce((s, i) => s + i.bonus, 0);
  const suspectTotal = SUSPECTS.reduce((s, su) => s + su.raf, 0);
  const capturedSuspects = showSuspects.filter(Boolean).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "calc(100vh - 108px)" }}>
      {/* Main note */}
      <div style={{ padding: "20px 28px", overflow: "auto", borderRight: `1px solid ${T.border}` }}>
        {/* Problems */}
        {PROBLEMS.map((p, i) => (
          <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${T.borderSoft}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: cd, fontSize: 13, fontWeight: 600, color: T.muted, minWidth: 22 }}>{p.num}.</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>{p.dx}</span>
              <span style={{ fontFamily: cd, fontSize: 12, color: T.muted }}>{p.icd}</span>
              {p.hcc && <Tag v="green">HCC {p.hcc}</Tag>}
              {p.status === "new" && <Tag v="new">New capture</Tag>}
            </div>
            <div style={{ paddingLeft: 30 }}>
              <p style={{ fontSize: 13, color: T.sec, lineHeight: 1.7, margin: "0 0 8px" }}>{p.assessment}</p>
              {p.plan.map((item, j) => (
                <div key={j} style={{ display: "flex", gap: 8, fontSize: 13, color: T.sec, lineHeight: 1.6 }}>
                  <span style={{ color: T.muted }}>–</span><span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Suspects — gentle green card */}
        <div style={{ padding: 18, background: "#f0fdf4", borderRadius: 10, border: `1px solid #bbf7d0`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.accentText, marginBottom: 12 }}>Conditions supported by clinical evidence</div>
          {SUSPECTS.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid #bbf7d0` : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{s.dx} <span style={{ fontFamily: cd, fontSize: 12, color: T.muted }}>{s.icd}</span></div>
                <div style={{ fontSize: 12, color: T.sec, marginTop: 2, lineHeight: 1.5 }}>{s.evidence}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 16 }}>
                <span style={{ fontFamily: cd, fontSize: 13, fontWeight: 600, color: T.accentText }}>+{s.raf.toFixed(3)}</span>
                {showSuspects[i] ? (
                  <Tag v="green">✓ Added</Tag>
                ) : (
                  <button onClick={() => { const n = [...showSuspects]; n[i] = true; setShowSuspects(n); }} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add to note</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Care gaps */}
        <div style={{ padding: 18, background: T.amberSoft, borderRadius: 10, border: `1px solid #fde68a` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.amberText, marginBottom: 10 }}>Open care gaps — addressable today</div>
          {CARE_GAPS.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: i > 0 ? `1px solid #fde68a` : "none" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{g.gap}</span>
                <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{g.measure} ({g.weight})</span>
              </div>
              <button style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 500, color: T.sec, cursor: "pointer" }}>{g.action}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ padding: "20px 16px", overflow: "auto", background: T.alt }}>
        {/* RAF */}
        <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 10 }}>Risk score</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontFamily: cd, fontSize: 32, fontWeight: 700, color: T.text, lineHeight: 1 }}>
                {(totalBase + totalInteraction + SUSPECTS.filter((_, i) => showSuspects[i]).reduce((s, su) => s + su.raf, 0)).toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Projected RAF</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: cd, fontSize: 18, fontWeight: 600, color: T.accent }}>
                +{(totalBase + totalInteraction + SUSPECTS.filter((_, i) => showSuspects[i]).reduce((s, su) => s + su.raf, 0) - 1.847).toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: T.accentText }}>uplift from visit</div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.sec, marginBottom: 4 }}>
              <span>Base conditions ({PROBLEMS.filter(p => p.hcc).length})</span>
              <span style={{ fontFamily: cd }}>{totalBase.toFixed(3)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.sec, marginBottom: 4 }}>
              <span>Interactions ({INTERACTIONS.length})</span>
              <span style={{ fontFamily: cd, color: T.accent }}>+{totalInteraction.toFixed(3)}</span>
            </div>
            {capturedSuspects > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.accentText, fontWeight: 500 }}>
                <span>New captures ({capturedSuspects})</span>
                <span style={{ fontFamily: cd }}>+{SUSPECTS.filter((_, i) => showSuspects[i]).reduce((s, su) => s + su.raf, 0).toFixed(3)}</span>
              </div>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, marginTop: 10, paddingTop: 10 }}>
            {INTERACTIONS.map((ix, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, padding: "2px 0" }}>
                <span>{ix.name}</span>
                <span style={{ fontFamily: cd, color: T.accentText }}>+{ix.bonus}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Documented HCCs */}
        <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 10 }}>Documented conditions</div>
          {PROBLEMS.filter(p => p.hcc).map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{p.dx.length > 30 ? p.dx.substring(0, 30) + "…" : p.dx}</div>
                <div style={{ fontFamily: cd, fontSize: 10, color: T.muted }}>{p.icd} → HCC {p.hcc}</div>
              </div>
              <span style={{ fontFamily: cd, fontSize: 11, color: T.sec }}>{p.raf.toFixed(3)}</span>
            </div>
          ))}
        </div>

        {/* Screening scores */}
        <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 8 }}>Screening scores</div>
          {[
            { name: "BIMS", score: "8/15", meaning: "Moderate cognitive impairment", color: T.amber },
            { name: "PHQ-9", score: "14/27", meaning: "Moderate depression", color: T.amber },
            { name: "Braden", score: "16/23", meaning: "Mild pressure ulcer risk", color: T.muted },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}>
              <span style={{ fontSize: 12, color: T.sec }}>{s.name}</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: cd, fontSize: 13, fontWeight: 600, color: s.color }}>{s.score}</span>
                <div style={{ fontSize: 10, color: T.muted }}>{s.meaning}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Near-miss */}
        <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.muted, marginBottom: 6 }}>Nearby interaction</div>
          <div style={{ fontSize: 12, color: T.sec, lineHeight: 1.6 }}>
            Documenting <span style={{ fontWeight: 500, color: T.text }}>CKD Stage 5</span> would trigger a triple interaction worth <span style={{ fontFamily: cd, fontWeight: 600, color: T.accent }}>+0.177</span>. Current eGFR 38 — does not qualify. Monitor.
          </div>
        </div>
      </div>
    </div>
  );
}

function CodingView({ onSelect }) {
  const codes = PROBLEMS.map(p => ({ ...p }));
  const totalRAF = codes.reduce((s, c) => s + (c.raf || 0), 0) + INTERACTIONS.reduce((s, i) => s + i.bonus, 0);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Coding review</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>AutoCoder validated · CMS-HCC V28 · Evidence linked</p>
        </div>
        <button onClick={() => onSelect("billing")} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Submit to billing →</button>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1.5fr 70px 70px 80px", gap: 8, padding: "10px 18px", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>
          <span>ICD-10</span><span>Description</span><span>HCC</span><span>RAF</span><span>Evidence</span>
        </div>
        {codes.map((c, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "80px 1.5fr 70px 70px 80px",
            gap: 8, padding: "12px 18px", alignItems: "center",
            borderBottom: `1px solid ${T.borderSoft}`,
            borderLeft: c.status === "new" ? `3px solid ${T.accent}` : "3px solid transparent",
            background: c.status === "new" ? "#fafdf7" : "transparent",
          }}>
            <span style={{ fontFamily: cd, fontSize: 12, fontWeight: 600, color: c.hcc ? T.accentText : T.sec }}>{c.icd}</span>
            <span style={{ fontSize: 13, color: T.text }}>{c.dx}</span>
            <span style={{ fontFamily: cd, fontSize: 12, color: c.hcc ? T.accentText : T.muted }}>{c.hcc ? `${c.hcc}` : "—"}</span>
            <span style={{ fontFamily: cd, fontSize: 12, fontWeight: 600, color: c.raf > 0 ? T.text : T.muted }}>{c.raf > 0 ? c.raf.toFixed(3) : "—"}</span>
            <Tag v={c.hcc ? "green" : "default"}>{c.hcc ? "MEAT ✓" : "N/A"}</Tag>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Total RAF", value: totalRAF.toFixed(3) },
          { label: "Interaction bonus", value: `+${INTERACTIONS.reduce((s, i) => s + i.bonus, 0).toFixed(3)}` },
          { label: "Annualized value", value: `$${Math.round(totalRAF * 11000).toLocaleString()}` },
        ].map((m, i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontFamily: cd, fontSize: 26, fontWeight: 700, color: T.text }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingView() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Claim submission</h2>
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>Pre-submission checks complete — AIClaim scrub results</p>
      </div>

      {/* Result banner */}
      <div style={{ padding: "16px 20px", background: T.accentSoft, borderRadius: 10, border: `1px solid #bbf7d0`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.accentText }}>Ready to submit — 7/8 checks passed, 1 warning</div>
          <div style={{ fontSize: 12, color: T.sec, marginTop: 2 }}>837P · 8 line items · Humana Gold Plus (MA) · Expected payment: $342.18</div>
        </div>
        <button style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Submit claim</button>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {BILLING_CHECKS.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1.2fr 2fr", gap: 10, padding: "10px 18px", alignItems: "center", borderBottom: `1px solid ${T.borderSoft}` }}>
            <span style={{ fontSize: 15 }}>{c.result === "pass" ? "✓" : "⚠"}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{c.check}</span>
            <span style={{ fontSize: 12, color: c.result === "pass" ? T.sec : T.amber }}>{c.detail}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Denial probability", value: "2.1%", color: T.accentText },
          { label: "Expected payment", value: "$342.18", color: T.text },
          { label: "Est. days to payment", value: "~14", color: T.blueText },
        ].map((m, i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontFamily: cd, fontSize: 26, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN SHELL
// ═══════════════════════════════════════════════════════════════
export default function Platform() {
  const [step, setStep] = useState("schedule");
  const steps = ["schedule", "prep", "encounter", "coding", "billing"];
  const labels = { schedule: "Schedule", prep: "Chart Prep", encounter: "Encounter", coding: "Coding", billing: "Billing" };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: bd, color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>AQSoft Health</span>
          </div>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <span style={{ fontSize: 13, color: T.sec }}>{labels[step]}</span>
        </div>

        <div style={{ display: "flex", gap: 0 }}>
          {steps.map((s, i) => (
            <button key={s} onClick={() => setStep(s)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
              fontSize: 13, fontWeight: step === s ? 600 : 400,
              color: step === s ? T.text : T.muted,
              borderBottom: step === s ? `2px solid ${T.accent}` : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontFamily: cd, fontSize: 11, color: T.muted, fontWeight: 400 }}>{i + 1}</span>
              {labels[s]}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: T.muted }}>V28</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.alt, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: T.sec }}>CS</div>
        </div>
      </header>

      {/* Patient bar — show on all steps except schedule */}
      {step !== "schedule" && (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Margaret Chen</span>
            <span style={{ fontSize: 13, color: T.muted }}>72F · MRN MC-20394 · Rm 204B · Humana Gold Plus · PCP: Dr. Rivera</span>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontFamily: cd, fontSize: 20, fontWeight: 700 }}>2.312</span>
              <span style={{ fontSize: 11, color: T.accentText, marginLeft: 6 }}>+0.465</span>
              <div style={{ fontSize: 10, color: T.muted }}>Projected RAF</div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {step === "schedule" && <ScheduleView onSelect={setStep} />}
      {step === "prep" && <PrepView onSelect={setStep} />}
      {step === "encounter" && <EncounterView />}
      {step === "coding" && <CodingView onSelect={setStep} />}
      {step === "billing" && <BillingView />}

      <footer style={{ borderTop: `1px solid ${T.border}`, padding: "8px 28px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: T.muted }}>AQSoft Health · OpenEMR · AutoCoder · AIClaim · ScrubGate</span>
        <div style={{ display: "flex", gap: 8 }}>
          {step !== "schedule" && step !== steps[steps.length - 1] && (
            <button onClick={() => setStep(steps[steps.indexOf(step) + 1])} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Next step →</button>
          )}
        </div>
      </footer>
    </div>
  );
}
