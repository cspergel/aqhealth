import { useState } from "react";

/*
 * DESIGN PHILOSOPHY:
 * - AI is the engine, not the paint. No badges, no chips, no "AI-POWERED" labels.
 * - The interface just works. Data appears pre-organized. Insights surface naturally.
 * - Warm neutrals, not cold dark mode. Approachable, not intimidating.
 * - Generous whitespace. Let content breathe.
 * - One accent color used sparingly. Not a rainbow.
 * - Typography does the heavy lifting. Big clear numbers. Soft supporting text.
 * - Feels like: Linear meets a medical dashboard. Professional, calm, trustworthy.
 */

const T = {
  bg: "#fafaf9",
  surface: "#ffffff",
  surfaceAlt: "#f5f5f4",
  border: "#e7e5e4",
  borderSoft: "#f0eeec",
  text: "#1c1917",
  textSecondary: "#57534e",
  textMuted: "#a8a29e",
  accent: "#16a34a",
  accentSoft: "#dcfce7",
  accentText: "#15803d",
  blue: "#2563eb",
  blueSoft: "#dbeafe",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  red: "#dc2626",
  redSoft: "#fee2e2",
  purple: "#7c3aed",
};

const heading = "'Instrument Sans', 'General Sans', 'Plus Jakarta Sans', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";
const code = "'Berkeley Mono', 'SF Mono', 'JetBrains Mono', monospace";

// Simulated patient for encounter view
const PT = {
  name: "Margaret Chen", age: 72, mrn: "MC-20394", room: "204B",
  insurance: "Humana Gold Plus", pcp: "Dr. Rivera",
  raf: { current: 1.847, projected: 2.312, delta: 0.465 },
};

const PROBLEMS = [
  { num: 1, name: "Acute on chronic systolic heart failure", icd: "I50.22", hcc: 85, raf: 0.323, status: "recaptured",
    assessment: "EF 35% on recent echo (3/12). Admitted for exacerbation, now euvolemic. BNP trending down 4200 → 890.",
    plan: ["Lasix 40mg BID — daily weights, call if >2lb gain", "Low sodium diet 2g/day", "Cardiology follow-up in 2 weeks", "Repeat echo in 3 months"] },
  { num: 2, name: "Type 2 diabetes with hyperglycemia", icd: "E11.65", hcc: 37, raf: 0.302, status: "recaptured",
    assessment: "Last HbA1c 8.2% (overdue for recheck). On Metformin 500 BID. Complicated by CKD — monitor renal function.",
    plan: ["Continue Metformin 500mg BID (hold if Cr >2.0)", "Order HbA1c — due for CY2026 recapture", "Diabetic eye exam — scheduling with ophthalmology", "Renal diet per dietitian"] },
  { num: 3, name: "CKD Stage 3b", icd: "N18.32", hcc: 138, raf: 0.069, status: "recaptured",
    assessment: "Cr 1.8, eGFR 38. Stable from prior. No proteinuria on last UA. On ACE inhibitor.",
    plan: ["Continue Lisinopril 20mg daily", "Recheck BMP and eGFR in 3 months", "Nephrology referral if eGFR drops below 30", "Avoid NSAIDs, contrast dye"] },
  { num: 4, name: "Major depressive disorder, recurrent, moderate", icd: "F33.1", hcc: 155, raf: 0.309, status: "new",
    assessment: "PHQ-9 score 14/27 on admission screening. On Sertraline 100mg, reports partial response. Sleep and appetite impaired.",
    plan: ["Continue Sertraline 100mg daily — consider dose increase", "Psychiatry consult ordered", "Repeat PHQ-9 in 2 weeks", "Fall precautions (sedation risk)"] },
  { num: 5, name: "COPD with acute exacerbation", icd: "J44.1", hcc: 111, raf: 0.280, status: "recaptured",
    assessment: "On home O2 2L. PFTs show FEV1/FVC 0.62. Acute exacerbation triggered by CHF fluid overload — improving with diuresis.",
    plan: ["Continue albuterol nebulizer Q4H PRN", "Prednisone taper: 40→30→20→10 over 8 days", "Pulmonology follow-up for PFT recheck", "Influenza + pneumococcal vaccines — verify status"] },
];

const SUSPECTS = [
  { name: "Protein-calorie malnutrition, mild", icd: "E44.1", hcc: 21, raf: 0.455, evidence: "Albumin 3.2, BMI 20.1, weight loss 5% in 30 days per nursing assessment", confidence: 82 },
  { name: "Morbid obesity", icd: "E66.01", hcc: 22, raf: 0.250, evidence: "BMI 41.2 documented in vitals on 3/18 admission", confidence: 88 },
];

const CARE_GAPS = [
  { gap: "HbA1c not drawn in CY2026", measure: "CDC-HbA1c", impact: "Star ★★★ (3× weight)", action: "Order today" },
  { gap: "Diabetic eye exam overdue", measure: "CDC-Eye", impact: "Star ★★★ (critical gap)", action: "Refer to ophthalmology" },
  { gap: "Kidney health evaluation incomplete", measure: "KED", impact: "Star ★ (new measure)", action: "Order eGFR + uACR" },
  { gap: "Depression follow-up needed", measure: "FMC", impact: "Star ★★★", action: "Schedule 7-day f/u" },
];

const INTERACTIONS = [
  { name: "DM + CHF", bonus: 0.121, codes: "HCC 37 + HCC 85" },
  { name: "CHF + COPD", bonus: 0.145, codes: "HCC 85 + HCC 111" },
];

const MEDS_WITH_GAPS = [
  { med: "Insulin Glargine 30u nightly", hasDx: true },
  { med: "Metformin 500mg BID", hasDx: true },
  { med: "Lisinopril 20mg daily", hasDx: true },
  { med: "Furosemide 40mg BID", hasDx: true },
  { med: "Carvedilol 12.5mg BID", hasDx: true },
  { med: "Sertraline 100mg daily", hasDx: true },
  { med: "Albuterol nebulizer Q4H PRN", hasDx: true },
  { med: "Prednisone 40mg taper", hasDx: true },
];

// ═══════════════════════════════════════════════════════════════
// Components — clean, no badges, no AI chips
// ═══════════════════════════════════════════════════════════════

function Tag({ children, variant = "default" }) {
  const styles = {
    default: { bg: T.surfaceAlt, color: T.textSecondary, border: T.border },
    green: { bg: T.accentSoft, color: T.accentText, border: "#bbf7d0" },
    amber: { bg: T.amberSoft, color: "#92400e", border: "#fde68a" },
    red: { bg: T.redSoft, color: "#991b1b", border: "#fecaca" },
    blue: { bg: T.blueSoft, color: "#1e40af", border: "#bfdbfe" },
    new: { bg: "#f0fdf4", color: T.accentText, border: "#86efac" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 5, fontSize: 11, fontFamily: body, fontWeight: 500,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{children}</span>
  );
}

function Metric({ label, value, sub, large }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontFamily: body, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: large ? 32 : 24, fontFamily: code, fontWeight: 600, color: T.text, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontFamily: body, color: T.accentText, fontWeight: 500, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main encounter view — redesigned
// ═══════════════════════════════════════════════════════════════

export default function EncounterRedesign() {
  const [activeTab, setActiveTab] = useState("note");
  const totalRAF = PT.raf.projected;
  const interactionTotal = INTERACTIONS.reduce((s, i) => s + i.bonus, 0);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: body, color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── Top bar ── */}
      <header style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />
            <span style={{ fontFamily: heading, fontWeight: 700, fontSize: 15, color: T.text, letterSpacing: "-0.02em" }}>AQSoft Health</span>
          </div>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <span style={{ fontSize: 13, color: T.textSecondary }}>Encounter</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {["Schedule", "Chart Prep", "Encounter", "Coding", "Billing", "Quality", "Analytics"].map((item, i) => (
            <span key={i} style={{
              fontSize: 13, fontWeight: item === "Encounter" ? 600 : 400,
              color: item === "Encounter" ? T.text : T.textMuted,
              cursor: "pointer", borderBottom: item === "Encounter" ? `2px solid ${T.accent}` : "2px solid transparent",
              paddingBottom: 2,
            }}>{item}</span>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: T.textMuted }}>CMS-HCC V28</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: T.textSecondary, border: `1px solid ${T.border}` }}>CS</div>
        </div>
      </header>

      {/* ── Patient header ── */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: heading, fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.03em", color: T.text }}>{PT.name}</h1>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 4, display: "flex", gap: 16 }}>
              <span>{PT.age}F</span>
              <span>MRN {PT.mrn}</span>
              <span>Rm {PT.room}</span>
              <span>{PT.insurance}</span>
              <span>PCP: {PT.pcp}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end" }}>
            <Metric label="Current RAF" value={PT.raf.current.toFixed(3)} />
            <div style={{ fontSize: 18, color: T.textMuted, marginBottom: 4 }}>→</div>
            <Metric label="Projected" value={PT.raf.projected.toFixed(3)} sub={`+${PT.raf.delta.toFixed(3)} uplift`} />
            <div style={{ borderLeft: `1px solid ${T.border}`, paddingLeft: 24, marginLeft: 8 }}>
              <Metric label="Annualized value" value={`$${Math.round(totalRAF * 11000).toLocaleString()}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", maxWidth: 1440, margin: "0 auto" }}>

        {/* ── Left: Clinical note ── */}
        <div style={{ padding: "24px 28px", borderRight: `1px solid ${T.border}` }}>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 24, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
            {[
              { id: "note", label: "Assessment & Plan" },
              { id: "hpi", label: "HPI" },
              { id: "meds", label: "Medications" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "8px 0 12px", fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? T.text : T.textMuted,
                borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : "2px solid transparent",
                marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          {activeTab === "note" && (
            <div>
              {/* Problems */}
              {PROBLEMS.map((p, i) => (
                <div key={i} style={{
                  marginBottom: 16, paddingBottom: 16,
                  borderBottom: i < PROBLEMS.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: code, fontSize: 13, fontWeight: 600, color: T.textMuted, minWidth: 20 }}>{p.num}.</span>
                    <span style={{ fontFamily: heading, fontSize: 15, fontWeight: 600, color: T.text }}>{p.name}</span>
                    <span style={{ fontFamily: code, fontSize: 12, color: T.textMuted }}>{p.icd}</span>
                    {p.hcc && <Tag variant="green">HCC {p.hcc}</Tag>}
                    {p.status === "new" && <Tag variant="new">New capture</Tag>}
                  </div>

                  <div style={{ paddingLeft: 28 }}>
                    <p style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.7, margin: "0 0 8px" }}>{p.assessment}</p>
                    <div style={{ fontSize: 13, color: T.textSecondary }}>
                      {p.plan.map((item, j) => (
                        <div key={j} style={{ display: "flex", gap: 8, padding: "2px 0", lineHeight: 1.6 }}>
                          <span style={{ color: T.textMuted }}>–</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* Suspects — presented as gentle suggestions, not AI alerts */}
              {SUSPECTS.length > 0 && (
                <div style={{ marginTop: 20, padding: 16, background: T.accentSoft, borderRadius: 10, border: `1px solid #bbf7d0` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.accentText, marginBottom: 10 }}>Conditions supported by clinical evidence — review for documentation</div>
                  {SUSPECTS.map((s, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderTop: i > 0 ? `1px solid #bbf7d0` : "none",
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{s.name} <span style={{ fontFamily: code, fontSize: 12, color: T.textMuted }}>{s.icd}</span></div>
                        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>{s.evidence}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontFamily: code, fontSize: 13, fontWeight: 600, color: T.accentText }}>+{s.raf.toFixed(3)}</span>
                        <button style={{
                          background: T.accent, color: "white", border: "none", borderRadius: 6,
                          padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>Add to note</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "hpi" && (
            <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.8, maxWidth: 680 }}>
              <p>72-year-old female with past medical history of chronic systolic heart failure (EF 35%), type 2 diabetes mellitus with hyperglycemia, CKD Stage 3b, and COPD, admitted to Sunrise SNF from Memorial Hospital following a 5-day hospitalization for acute CHF exacerbation.</p>
              <p style={{ marginTop: 12 }}>Hospital course notable for IV diuresis with 4L net negative fluid balance, uptitration of carvedilol to 12.5mg BID, and transition to oral Lasix 40mg BID. Discharge weight 168 lbs (down from 176 lbs on admission). BNP improved from 4,200 to 890 pg/mL. COPD exacerbation concurrent with fluid overload — treated with bronchodilators and prednisone taper.</p>
              <p style={{ marginTop: 12 }}>On admission screening: BIMS 8/15 (moderate cognitive impairment — baseline per family), PHQ-9 14/27 (moderate depression, on sertraline), Braden 16 (mild risk). Albumin 3.2 g/dL, BMI 20.1. Code status: Full Code. Allergies: Penicillin (rash), Sulfa (GI upset).</p>
              <p style={{ marginTop: 12, fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>Generated from Memorial Hospital discharge summary + Sunrise SNF nursing admission assessment. Review for accuracy before signing.</p>
            </div>
          )}

          {activeTab === "meds" && (
            <div>
              {MEDS_WITH_GAPS.map((med, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
                  <span style={{ fontSize: 14, color: T.text }}>{med.med}</span>
                  <Tag variant="green">Dx linked</Tag>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted }}>
                All medications have corresponding diagnoses documented. No medication-diagnosis gaps detected.
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ padding: "24px 20px", background: T.surfaceAlt, overflow: "auto" }}>

          {/* RAF summary — clean numbers, no badges */}
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginBottom: 12 }}>Risk Score Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted }}>Base conditions</div>
                <div style={{ fontFamily: code, fontSize: 20, fontWeight: 600, color: T.text }}>{(totalRAF - interactionTotal).toFixed(3)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted }}>Interaction bonuses</div>
                <div style={{ fontFamily: code, fontSize: 20, fontWeight: 600, color: T.accent }}>+{interactionTotal.toFixed(3)}</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
              {INTERACTIONS.map((ix, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: T.textSecondary }}>
                  <span>{ix.name}</span>
                  <span style={{ fontFamily: code, color: T.accent }}>+{ix.bonus}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirmed HCCs — simple list */}
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>Documented HCCs</span>
              <span style={{ fontFamily: code, fontSize: 12, color: T.accentText }}>{PROBLEMS.filter(p => p.hcc).length} conditions</span>
            </div>
            {PROBLEMS.filter(p => p.hcc).map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{p.name.length > 35 ? p.name.substring(0, 35) + "…" : p.name}</div>
                  <div style={{ fontFamily: code, fontSize: 11, color: T.textMuted }}>{p.icd} → HCC {p.hcc}</div>
                </div>
                <span style={{ fontFamily: code, fontSize: 12, fontWeight: 600, color: T.textSecondary }}>{p.raf.toFixed(3)}</span>
              </div>
            ))}
          </div>

          {/* Care gaps — quiet but clear */}
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>Open care gaps</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.amber }}>{CARE_GAPS.length}</span>
            </div>
            {CARE_GAPS.map((g, i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${T.borderSoft}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{g.gap}</span>
                  <Tag variant="amber">{g.measure}</Tag>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{g.impact}</span>
                  <button style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: 5,
                    padding: "3px 10px", fontSize: 11, color: T.textSecondary, cursor: "pointer",
                    fontWeight: 500,
                  }}>{g.action}</button>
                </div>
              </div>
            ))}
          </div>

          {/* Near-miss — subtle */}
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginBottom: 8 }}>Nearby interaction opportunity</div>
            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
              Documenting <span style={{ fontWeight: 500, color: T.text }}>CKD Stage 5</span> would trigger a DM + CHF + CKD5 triple interaction worth <span style={{ fontFamily: code, fontWeight: 600, color: T.accent }}>+0.177 RAF</span>. Current eGFR 38 does not qualify — monitor for progression.
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${T.border}`, padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.textMuted }}>AQSoft Health Platform · OpenEMR · CMS-HCC V28</span>
        <div style={{ display: "flex", gap: 16 }}>
          <button style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 16px", fontSize: 12, fontWeight: 500, color: T.textSecondary, cursor: "pointer" }}>Save draft</button>
          <button style={{ background: T.accent, color: "white", border: "none", borderRadius: 6, padding: "6px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Sign note</button>
        </div>
      </footer>
    </div>
  );
}
