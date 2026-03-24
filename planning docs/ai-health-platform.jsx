import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════
// Design System
// ═══════════════════════════════════════════════════════════════════
const C = {
  bg: "#09090b", surface: "#18181b", surfaceHover: "#1f1f23",
  card: "#1c1c21", cardHover: "#242429",
  border: "#27272a", borderLight: "#3f3f46",
  text: "#fafafa", textSecondary: "#a1a1aa", textDim: "#71717a",
  accent: "#22c55e", accentMuted: "rgba(34,197,94,0.12)",
  blue: "#3b82f6", blueMuted: "rgba(59,130,246,0.12)",
  amber: "#f59e0b", amberMuted: "rgba(245,158,11,0.12)",
  red: "#ef4444", redMuted: "rgba(239,68,68,0.12)",
  purple: "#a78bfa", purpleMuted: "rgba(167,139,250,0.1)",
  cyan: "#06b6d4", cyanMuted: "rgba(6,182,212,0.1)",
};
const mono = "'IBM Plex Mono','JetBrains Mono',monospace";
const sans = "'Outfit','Inter',system-ui,sans-serif";

// ═══════════════════════════════════════════════════════════════════
// Workflow Steps
// ═══════════════════════════════════════════════════════════════════
const STEPS = [
  { id: "schedule", label: "Schedule", icon: "◎", desc: "AI prioritized worklist" },
  { id: "prep", label: "Chart Prep", icon: "◈", desc: "AI pre-populates from sources" },
  { id: "encounter", label: "Encounter", icon: "◉", desc: "AI-assisted documentation" },
  { id: "coding", label: "Coding", icon: "⬡", desc: "AutoCoder HCC engine" },
  { id: "billing", label: "Billing", icon: "◫", desc: "AIClaim denial prevention" },
  { id: "analytics", label: "Analytics", icon: "◇", desc: "MSO population dashboard" },
];

const PATIENT = {
  name: "Margaret Chen", age: 72, dob: "08/14/1953", mrn: "MC-20394", room: "204B",
  insurance: "Humana Gold Plus (MA)", pcp: "Dr. Rivera", admitDate: "03/18/2026",
  admitDx: "CHF Exacerbation", facility: "Sunrise SNF",
};

// ═══════════════════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════════════════
const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: mono, fontWeight: 600, color, background: bg || C.accentMuted, letterSpacing: "0.03em" }}>{children}</span>
);

const AiChip = ({ label = "AI" }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontFamily: mono, fontWeight: 700, color: C.purple, background: C.purpleMuted, letterSpacing: "0.05em" }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.purple, animation: "pulse 2s infinite" }} />{label}
  </span>
);

const SectionTitle = ({ children, ai }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
    <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.text, letterSpacing: "-0.01em" }}>{children}</span>
    {ai && <AiChip label={ai} />}
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// Step 1: Schedule — AI Prioritized Worklist
// ═══════════════════════════════════════════════════════════════════
function ScheduleView() {
  const patients = [
    { name: "Margaret Chen", room: "204B", priority: "critical", reason: "3 suspect HCCs, RAF uplift +0.465", nextVisit: "Today", raf: 1.847, suspects: 3, visitType: "SNF Admission" },
    { name: "Robert Williams", room: "118A", priority: "high", reason: "PHQ-9: 16, depression not coded", nextVisit: "Today", raf: 1.234, suspects: 2, visitType: "Follow-up" },
    { name: "Dorothy Martinez", room: "305", priority: "high", reason: "Annual recapture due, 4 HCCs expiring", nextVisit: "Today", raf: 2.456, suspects: 1, visitType: "Recapture" },
    { name: "James Thornton", room: "210", priority: "medium", reason: "New admit, chart prep pending", nextVisit: "Tomorrow", raf: 0.8, suspects: 0, visitType: "SNF Admission" },
    { name: "Patricia Okafor", room: "112B", priority: "low", reason: "Stable, no gaps", nextVisit: "Fri", raf: 1.1, suspects: 0, visitType: "Weekly" },
  ];
  const priColor = { critical: C.red, high: C.amber, medium: C.blue, low: C.textDim };
  const priBg = { critical: C.redMuted, high: C.amberMuted, medium: C.blueMuted, low: C.surface };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 22, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>Today's Worklist</h2>
          <p style={{ fontFamily: sans, fontSize: 13, color: C.textSecondary, margin: "4px 0 0" }}>AI-prioritized by RAF uplift potential and care gaps</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.red} bg={C.redMuted}>2 CRITICAL</Badge>
          <Badge color={C.amber} bg={C.amberMuted}>1 HIGH</Badge>
          <Badge color={C.accent}>5 PATIENTS</Badge>
        </div>
      </div>

      <SectionTitle ai="SMART SORT">Prioritized by HCC Impact</SectionTitle>

      {patients.map((p, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "36px 1.5fr 0.6fr 0.5fr 2fr 0.5fr",
          gap: 12, alignItems: "center", padding: "12px 14px", marginBottom: 4,
          background: i === 0 ? C.cardHover : C.card, borderRadius: 8,
          border: `1px solid ${i === 0 ? C.borderLight : C.border}`,
          cursor: "pointer", transition: "all 0.15s",
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: priBg[p.priority], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: mono, color: priColor[p.priority] }}>
            {p.priority === "critical" ? "!!" : p.priority === "high" ? "!" : p.priority[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 14, color: C.text }}>{p.name}</div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>Rm {p.room} · {p.visitType}</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 12, color: C.textSecondary }}>RAF {p.raf.toFixed(3)}</div>
          <div>{p.suspects > 0 && <Badge color={C.amber} bg={C.amberMuted}>{p.suspects} suspect{p.suspects > 1 ? "s" : ""}</Badge>}</div>
          <div style={{ fontFamily: sans, fontSize: 12, color: priColor[p.priority], lineHeight: 1.4 }}>
            <AiChip label="WHY" /> <span style={{ marginLeft: 4, color: C.textSecondary }}>{p.reason}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, textAlign: "right" }}>{p.nextVisit}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 2: Chart Prep — AI Pre-populates from all sources
// ═══════════════════════════════════════════════════════════════════
function ChartPrepView() {
  const sources = [
    { name: "Hospital Discharge Summary", type: "PDF", status: "extracted", items: 14, icon: "📄" },
    { name: "PCC Dashboard Scrape", type: "Live", status: "scraped", items: 22, icon: "🔗" },
    { name: "Prior Claims (MA Plan)", type: "837", status: "imported", items: 8, icon: "💳" },
    { name: "Lab Results (Quest)", type: "HL7", status: "received", items: 6, icon: "🧪" },
  ];
  const prepItems = [
    { section: "HPI Narrative", status: "ready", confidence: 94, desc: "Synthesized from discharge summary + nursing notes" },
    { section: "Problem List", status: "ready", confidence: 92, desc: "12 active dx mapped, 3 suspects flagged" },
    { section: "Medications", status: "ready", confidence: 96, desc: "Reconciled hospital → SNF, 2 gaps detected" },
    { section: "Screening Scores", status: "ready", confidence: 90, desc: "BIMS 8, PHQ-9 14, Braden 16 extracted from notes" },
    { section: "Assessment & Plan", status: "draft", confidence: 88, desc: "10 problems with individualized A&P pre-drafted" },
    { section: "Physical Exam Template", status: "ready", confidence: 85, desc: "Pre-filled from last documented exam findings" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 22, color: C.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Chart Prep: {PATIENT.name}</h2>
      <p style={{ fontFamily: mono, fontSize: 12, color: C.textDim, margin: "0 0 20px" }}>Rm {PATIENT.room} · {PATIENT.insurance} · Admitted {PATIENT.admitDate} for {PATIENT.admitDx}</p>

      <SectionTitle ai="AUTO-INGEST">Data Sources</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {sources.map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 12, color: C.text }}>{s.name}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.accent, marginTop: 4 }}>✓ {s.items} items {s.status}</div>
          </div>
        ))}
      </div>

      <SectionTitle ai="SNF ADMIT ASSIST + AUTOCODER">Pre-Built Note Sections</SectionTitle>
      {prepItems.map((item, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1.2fr 0.4fr 2fr 80px",
          gap: 12, alignItems: "center", padding: "10px 14px", marginBottom: 4,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{item.section}</div>
          <Badge color={item.status === "ready" ? C.accent : C.amber} bg={item.status === "ready" ? C.accentMuted : C.amberMuted}>
            {item.status.toUpperCase()}
          </Badge>
          <div style={{ fontFamily: sans, fontSize: 12, color: C.textSecondary }}>{item.desc}</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: item.confidence >= 90 ? C.accent : C.amber }}>{item.confidence}% conf</div>
        </div>
      ))}
      <div style={{ marginTop: 16, padding: "14px 18px", background: C.accentMuted, borderRadius: 8, border: `1px solid rgba(34,197,94,0.2)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: sans, fontSize: 13, color: C.accent, fontWeight: 600 }}>✓ Chart prep complete — note is 85% pre-built. Review and sign.</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.textSecondary }}>Prep time: 4.2s (vs ~25min manual)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 3: Encounter — AI-Assisted Documentation
// ═══════════════════════════════════════════════════════════════════
function EncounterView() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100%" }}>
      {/* Main note area */}
      <div style={{ padding: 24, borderRight: `1px solid ${C.border}`, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 20, color: C.text, margin: 0 }}>SNF Admission H&P</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <Badge color={C.cyan} bg={C.cyanMuted}>DRAFT</Badge>
            <AiChip label="AI-ASSISTED" />
          </div>
        </div>

        {/* Note sections */}
        {[
          { title: "HPI", content: "72-year-old female with PMH of CHF (EF 35%), DM2, CKD Stage 3b, and COPD admitted to Sunrise SNF from Memorial Hospital following a 5-day hospitalization for acute CHF exacerbation. Hospital course notable for IV diuresis with 4L net negative fluid balance, transition to oral Lasix 40mg BID, and uptitration of carvedilol to 12.5mg BID. Discharge weight 168 lbs (down from 176). BNP improved from 4,200 to 890...", ai: true },
          { title: "Assessment & Plan", content: null, ai: true, problems: [
            { num: 1, name: "Acute on chronic systolic CHF (I50.22)", hcc: "HCC 85", plan: ["Continue Lasix 40mg BID, daily weights", "Low sodium diet 2g/day", "Cardiology f/u 2 weeks"] },
            { num: 2, name: "DM2 with CKD Stage 3b (E11.65, N18.32)", hcc: "HCC 37, 138", plan: ["Continue Metformin 500mg BID (hold if Cr >2.0)", "HbA1c due — order", "Renal diet per dietitian"] },
            { num: 3, name: "Moderate depression, PHQ-9: 14 (F33.1)", hcc: "HCC 155", plan: ["Continue Sertraline 100mg", "Psych consult ordered", "Repeat PHQ-9 in 2 weeks"], suspect: true },
          ] },
        ].map((section, i) => (
          <div key={i} style={{ marginBottom: 20, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: C.text }}>{section.title}</span>
              {section.ai && <AiChip label="PRE-BUILT" />}
            </div>
            <div style={{ padding: 16 }}>
              {section.content && (
                <div style={{ fontFamily: sans, fontSize: 13, color: C.textSecondary, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {section.content}
                </div>
              )}
              {section.problems && section.problems.map((p, j) => (
                <div key={j} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: j < section.problems.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.accent, minWidth: 20 }}>{p.num}.</span>
                    <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{p.name}</span>
                    <Badge color={C.accent}>{p.hcc}</Badge>
                    {p.suspect && <Badge color={C.amber} bg={C.amberMuted}>SUSPECT → CAPTURED</Badge>}
                  </div>
                  <div style={{ paddingLeft: 28 }}>
                    {p.plan.map((item, k) => (
                      <div key={k} style={{ fontFamily: sans, fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>– {item}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Right sidebar — AI assistant */}
      <div style={{ padding: 16, overflow: "auto", background: C.surface }}>
        <SectionTitle ai="LIVE">Coding Sidebar</SectionTitle>

        <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, marginBottom: 12 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>RAF Summary</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 700, color: C.accent }}>2.312</span>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.accent }}>+0.465 ↑</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, marginTop: 4 }}>~$5,115 annualized uplift</div>
        </div>

        <div style={{ fontFamily: mono, fontSize: 10, color: C.amber, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Suspects Captured This Visit</div>
        {[
          { code: "F33.1", desc: "MDD Moderate", hcc: "155", evidence: "PHQ-9: 14" },
          { code: "E44.1", desc: "Mild Malnutrition", hcc: "21", evidence: "Albumin 3.2, BMI 20.1" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "8px 10px", marginBottom: 4, background: C.accentMuted, borderRadius: 6, border: `1px solid rgba(34,197,94,0.2)` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.accent }}>{s.code}</span>
              <Badge>HCC {s.hcc}</Badge>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textSecondary, marginTop: 2 }}>{s.desc}</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, marginTop: 2 }}>Evidence: {s.evidence}</div>
          </div>
        ))}

        <div style={{ fontFamily: mono, fontSize: 10, color: C.blue, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 8 }}>Disease Interactions</div>
        <div style={{ padding: "8px 10px", background: C.blueMuted, borderRadius: 6, border: `1px solid rgba(59,130,246,0.2)`, marginBottom: 12 }}>
          <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: C.blue }}>DM + CHF Bonus</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textSecondary }}>+0.121 RAF interaction</div>
        </div>

        <div style={{ fontFamily: mono, fontSize: 10, color: C.red, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 8 }}>Care Gaps</div>
        {["HbA1c not recaptured CY2026", "Diabetic eye exam overdue", "CKD nephrology f/u due"].map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginBottom: 3, background: C.redMuted, borderRadius: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.red }} />
            <span style={{ fontFamily: sans, fontSize: 11, color: C.red }}>{g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 4: Coding — AutoCoder HCC Engine
// ═══════════════════════════════════════════════════════════════════
function CodingView() {
  const codes = [
    { code: "I50.22", desc: "Chronic systolic CHF", hcc: 85, raf: 0.323, status: "confirmed", meat: "complete" },
    { code: "E11.65", desc: "DM2 w/ hyperglycemia", hcc: 37, raf: 0.302, status: "confirmed", meat: "complete" },
    { code: "N18.32", desc: "CKD Stage 3b", hcc: 138, raf: 0.069, status: "confirmed", meat: "complete" },
    { code: "J44.1", desc: "COPD w/ acute exacerbation", hcc: 111, raf: 0.280, status: "confirmed", meat: "complete" },
    { code: "F33.1", desc: "MDD recurrent, moderate", hcc: 155, raf: 0.309, status: "new_capture", meat: "complete" },
    { code: "E44.1", desc: "Mild protein-calorie malnutrition", hcc: 21, raf: 0.455, status: "new_capture", meat: "partial" },
    { code: "I10", desc: "Essential hypertension", hcc: null, raf: 0, status: "confirmed", meat: "n/a" },
    { code: "Z87.891", desc: "Hx of nicotine dependence", hcc: null, raf: 0, status: "confirmed", meat: "n/a" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>Coding Review</h2>
          <p style={{ fontFamily: sans, fontSize: 13, color: C.textSecondary, margin: "4px 0 0" }}>AutoCoder validated · CMS-HCC V28 · MEAT evidence linked</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <AiChip label="AUTOCODER" />
          <Badge color={C.accent}>{codes.filter(c => c.hcc).length} HCCs</Badge>
          <Badge color={C.amber} bg={C.amberMuted}>{codes.filter(c => c.status === "new_capture").length} NEW CAPTURES</Badge>
        </div>
      </div>

      <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1.5fr 70px 70px 100px 80px", gap: 8, padding: "10px 16px", fontSize: 10, fontFamily: mono, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>ICD-10</span><span>Description</span><span>HCC</span><span>RAF</span><span>MEAT</span><span>Status</span>
        </div>
        {codes.map((c, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "90px 1.5fr 70px 70px 100px 80px",
            gap: 8, padding: "10px 16px", alignItems: "center",
            borderBottom: `1px solid ${C.border}`, borderLeft: c.status === "new_capture" ? `3px solid ${C.accent}` : "3px solid transparent",
            background: c.status === "new_capture" ? "rgba(34,197,94,0.04)" : "transparent",
          }}>
            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: c.hcc ? C.accent : C.textSecondary }}>{c.code}</span>
            <span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{c.desc}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: c.hcc ? C.accent : C.textDim }}>{c.hcc ? `HCC ${c.hcc}` : "—"}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: c.raf > 0 ? C.accent : C.textDim, fontWeight: 600 }}>{c.raf > 0 ? c.raf.toFixed(3) : "—"}</span>
            <Badge color={c.meat === "complete" ? C.accent : c.meat === "partial" ? C.amber : C.textDim} bg={c.meat === "complete" ? C.accentMuted : c.meat === "partial" ? C.amberMuted : C.surface}>
              {c.meat === "complete" ? "✓ MEAT" : c.meat === "partial" ? "⚠ PARTIAL" : "N/A"}
            </Badge>
            <Badge color={c.status === "new_capture" ? C.accent : C.textDim} bg={c.status === "new_capture" ? C.accentMuted : C.surface}>
              {c.status === "new_capture" ? "★ NEW" : "RECAPTURED"}
            </Badge>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Total RAF</div>
          <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.accent }}>2.312</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Interaction Bonus</div>
          <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.blue }}>+0.121</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Annualized Value</div>
          <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.text }}>$26.8K</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 5: Billing — AIClaim Denial Prevention
// ═══════════════════════════════════════════════════════════════════
function BillingView() {
  const claims = [
    { id: "CLM-20394-01", type: "837P", codes: 8, total: "$342.18", risk: 2, status: "scrubbed", passRate: 98 },
  ];
  const checks = [
    { check: "CPT/ICD-10 pairing validation", status: "pass", detail: "All 8 codes properly linked" },
    { check: "Modifier appropriateness", status: "pass", detail: "No modifier issues detected" },
    { check: "Medical necessity (LCD/NCD)", status: "pass", detail: "All procedures meet medical necessity" },
    { check: "Prior authorization verification", status: "pass", detail: "No prior auth required for MA SNF" },
    { check: "Timely filing check", status: "pass", detail: "Within 365-day window" },
    { check: "Duplicate claim detection", status: "pass", detail: "No duplicates found" },
    { check: "Credential/NPI validation", status: "warning", detail: "Provider NPI active, verify group NPI" },
    { check: "Payer-specific edits (Humana)", status: "pass", detail: "Passed 142 Humana-specific rules" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>Claim Submission</h2>
          <p style={{ fontFamily: sans, fontSize: 13, color: C.textSecondary, margin: "4px 0 0" }}>Pre-submission scrub powered by AIClaim</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <AiChip label="AICLAIM" />
          <Badge color={C.accent}>98% PASS RATE</Badge>
        </div>
      </div>

      <div style={{ background: C.accentMuted, border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 10, padding: 18, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 15, color: C.accent }}>✓ Claim ready to submit — 7/8 checks passed, 1 warning</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textSecondary, marginTop: 4 }}>837P generated · {claims[0].codes} line items · Humana Gold Plus (MA)</div>
        </div>
        <button style={{ background: C.accent, color: "#000", border: "none", borderRadius: 8, padding: "10px 24px", fontFamily: sans, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Submit Claim →</button>
      </div>

      <SectionTitle ai="AICLAIM SCRUB">Pre-Submission Checks</SectionTitle>
      {checks.map((c, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "24px 1.2fr 2fr",
          gap: 10, alignItems: "center", padding: "8px 14px", marginBottom: 3,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
        }}>
          <span style={{ fontSize: 14 }}>{c.status === "pass" ? "✅" : c.status === "warning" ? "⚠️" : "❌"}</span>
          <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.text }}>{c.check}</span>
          <span style={{ fontFamily: sans, fontSize: 11, color: c.status === "pass" ? C.textSecondary : C.amber }}>{c.detail}</span>
        </div>
      ))}

      <div style={{ marginTop: 20, padding: "14px 18px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
        <SectionTitle ai="PREDICTIVE">Denial Risk Analysis</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Denial Probability</div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.accent }}>2.1%</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Expected Payment</div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.text }}>$342.18</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Days to Payment</div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.blue }}>~14</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 6: Analytics — MSO Population Dashboard
// ═══════════════════════════════════════════════════════════════════
function AnalyticsView() {
  const clients = [
    { name: "Sunstate Medical Group", members: 4200, raf: 1.52, recapture: 68, uplift: "+$3.2M", suspects: 1847 },
    { name: "Gulf Coast Primary Care", members: 2100, raf: 1.38, recapture: 74, uplift: "+$1.4M", suspects: 823 },
    { name: "Bayside Physician Network", members: 1650, raf: 1.61, recapture: 71, uplift: "+$1.1M", suspects: 612 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sans, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>MSO Analytics</h2>
          <p style={{ fontFamily: sans, fontSize: 13, color: C.textSecondary, margin: "4px 0 0" }}>Population risk adjustment performance across clients</p>
        </div>
        <AiChip label="REAL-TIME" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Total Lives", value: "7,950", accent: C.blue },
          { label: "Avg RAF", value: "1.48", accent: C.accent },
          { label: "Open Suspects", value: "3,282", accent: C.amber },
          { label: "Projected Uplift", value: "$5.7M", accent: C.accent },
          { label: "Recapture Rate", value: "71%", accent: C.purple },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", borderTop: `2px solid ${s.accent}` }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <SectionTitle>Client Performance</SectionTitle>
      <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.5fr 0.6fr 0.6fr 0.5fr", gap: 8, padding: "10px 16px", fontSize: 10, fontFamily: mono, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Client</span><span>Members</span><span>Avg RAF</span><span>Recapture</span><span>Uplift</span><span>Suspects</span>
        </div>
        {clients.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.5fr 0.6fr 0.6fr 0.5fr", gap: 8, padding: "12px 16px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{c.name}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.textSecondary }}>{c.members.toLocaleString()}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.blue }}>{c.raf}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 50, height: 4, borderRadius: 2, background: C.border }}>
                <div style={{ width: `${c.recapture}%`, height: "100%", borderRadius: 2, background: c.recapture >= 72 ? C.accent : C.amber }} />
              </div>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.textSecondary }}>{c.recapture}%</span>
            </div>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.accent, fontWeight: 700 }}>{c.uplift}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.amber }}>{c.suspects.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "14px 18px", background: C.purpleMuted, borderRadius: 8, border: `1px solid rgba(167,139,250,0.2)` }}>
        <div style={{ fontFamily: sans, fontSize: 13, color: C.purple, fontWeight: 600 }}>Gap Analysis: 1,847 suspect HCCs across Sunstate alone worth ~$3.2M if captured before CY2026 sweep deadline.</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.textSecondary, marginTop: 4 }}>Top opportunities: Malnutrition (412 suspects), Depression (298), CKD staging (187), DM complications (156)</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main App Shell
// ═══════════════════════════════════════════════════════════════════
export default function AIHealthPlatform() {
  const [step, setStep] = useState("schedule");

  const views = { schedule: ScheduleView, prep: ChartPrepView, encounter: EncounterView, coding: CodingView, billing: BillingView, analytics: AnalyticsView };
  const View = views[step];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(9,9,11,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: mono, color: "#000" }}>A</div>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: C.text }}>AQSoft<span style={{ color: C.accent }}>.AI</span></span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>Health Platform</span>
        </div>

        {/* Workflow steps */}
        <div style={{ display: "flex", gap: 2 }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(s.id)} style={{
              background: step === s.id ? C.surface : "transparent",
              border: step === s.id ? `1px solid ${C.borderLight}` : "1px solid transparent",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 12, color: step === s.id ? C.accent : C.textDim }}>{s.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: step === s.id ? C.accent : C.textSecondary, lineHeight: 1.2 }}>{s.label}</div>
                <div style={{ fontFamily: sans, fontSize: 9, color: C.textDim, lineHeight: 1.2 }}>{s.desc}</div>
              </div>
              {i < STEPS.length - 1 && <span style={{ color: C.textDim, fontSize: 10, marginLeft: 4 }}>→</span>}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Badge>V28</Badge>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 10, color: C.textSecondary }}>CS</div>
        </div>
      </header>

      {/* Content */}
      <div style={{ minHeight: "calc(100vh - 90px)" }}>
        <View />
      </div>

      {/* Footer */}
      <footer style={{ padding: "8px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, color: C.textDim }}>
        <span>AQSoft.AI Health Platform · OpenEMR Fork · GPL-3.0 Core + Proprietary Modules</span>
        <span>AutoCoder HCC Engine · SNF Admit Assist · AIClaim RCM · ScrubGate PHI · CMS-HCC V28</span>
      </footer>
    </div>
  );
}
