import { useState } from "react";

const C = {
  bg: "#0a0e17", surface: "#111827", surfaceAlt: "#1a2235",
  border: "#1e293b", borderLight: "#2d3a4f",
  text: "#e2e8f0", textMuted: "#8899b0", textDim: "#5a6b80",
  accent: "#10b981", accentDim: "#059669", accentGlow: "rgba(16,185,129,0.12)",
  warn: "#f59e0b", warnDim: "rgba(245,158,11,0.15)",
  danger: "#ef4444", dangerDim: "rgba(239,68,68,0.12)",
  blue: "#3b82f6", blueDim: "rgba(59,130,246,0.12)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.1)",
  orange: "#fb923c", orangeDim: "rgba(251,146,60,0.12)",
  cyan: "#22d3ee", cyanDim: "rgba(34,211,238,0.1)",
};
const mono = "'JetBrains Mono','SF Mono',monospace";
const sans = "'DM Sans',system-ui,sans-serif";

// ─── MODE DATA ───
const modes = [
  { key: "hcc", label: "HCC Workstation", icon: "◉" },
  { key: "snf", label: "SNF / Post-Acute", icon: "⊞" },
  { key: "overlay", label: "EMR Overlay", icon: "◫" },
  { key: "mso", label: "MSO Analytics", icon: "◈" },
];

// SNF Admit data
const snfAdmits = [
  {
    id: 1, name: "James Thornton", age: 78, admitDate: "2026-03-18",
    source: "Memorial Hospital ED", admitDx: "Left hip fracture s/p ORIF",
    occ: { a0310f: "01", b0100: "1", c0100: "2", d0300: "02", gg0130a: "03", gg0130b: "01" },
    mappedIcds: [
      { icd: "S72.002D", desc: "Fx femoral neck, left, subsequent", hcc: "HCC 170", raf: 0.441, source: "OCC/MDS A0310F" },
      { icd: "Z96.642", desc: "Presence of left artificial hip joint", hcc: null, raf: 0, source: "Surgical Hx" },
      { icd: "F03.90", desc: "Unspecified dementia w/o behavioral disturbance", hcc: "HCC 52", raf: 0.278, source: "OCC B0100 + C0100" },
      { icd: "R41.0", desc: "Disorientation, unspecified", hcc: null, raf: 0, source: "OCC C0100" },
    ],
    suspects: [
      { icd: "E11.65", desc: "DM2 w/ hyperglycemia", hcc: "HCC 18", raf: 0.302, evidence: "Glucose 247 on admit labs, insulin sliding scale ordered", confidence: 91 },
      { icd: "N18.3", desc: "CKD Stage 3", hcc: "HCC 138", raf: 0.069, evidence: "Cr 1.8, eGFR 38 on hospital labs", confidence: 87 },
    ],
    hospitalDx: ["S72.002A", "I10", "E11.9", "F03.90", "N18.3", "Z87.39"],
    preAdmitHccs: 4, projectedHccs: 7,
    meds: ["Lisinopril 10mg", "Metformin 500mg BID", "Enoxaparin 40mg SQ", "Acetaminophen 650mg Q6H"],
  },
  {
    id: 2, name: "Patricia Okafor", age: 84, admitDate: "2026-03-17",
    source: "St. Luke's Med Ctr", admitDx: "Pneumonia / Resp failure",
    occ: { a0310f: "01", b0100: "0", c0100: "1", d0300: "01", gg0130a: "06", gg0130b: "03" },
    mappedIcds: [
      { icd: "J18.9", desc: "Pneumonia, unspecified organism", hcc: "HCC 114", raf: 0.168, source: "Hospital DC Summary" },
      { icd: "J96.11", desc: "Chronic respiratory failure w/ hypoxia", hcc: "HCC 83", raf: 0.329, source: "Hospital DC Summary" },
      { icd: "I50.32", desc: "Chronic diastolic HF", hcc: "HCC 85", raf: 0.323, source: "Cardiology consult" },
    ],
    suspects: [
      { icd: "J44.1", desc: "COPD w/ acute exacerbation", hcc: "HCC 111", raf: 0.280, evidence: "PFTs on file show FEV1/FVC 0.62, on home O2 2L", confidence: 93 },
      { icd: "E44.0", desc: "Moderate protein-calorie malnutrition", hcc: "HCC 21", raf: 0.455, evidence: "Albumin 2.1, BMI 17.8, dietitian consult ordered", confidence: 96 },
    ],
    hospitalDx: ["J18.9", "J96.11", "I50.32", "J44.1", "E44.0", "I10"],
    preAdmitHccs: 3, projectedHccs: 6,
    meds: ["Furosemide 40mg", "Albuterol nebulizer Q4H", "Prednisone taper", "Ceftriaxone 1g IV"],
  },
];

// MSO data
const msoClients = [
  { name: "Sunstate Medical Group", members: 4200, avgRAF: 1.52, recapture: 68, suspects: 1847, projRev: "$18.4M", uplift: "+$3.2M", status: "active" },
  { name: "Gulf Coast Primary Care", members: 2100, avgRAF: 1.38, recapture: 74, suspects: 823, projRev: "$8.9M", uplift: "+$1.4M", status: "active" },
  { name: "Bayside Physician Network", members: 1650, avgRAF: 1.61, recapture: 71, suspects: 612, projRev: "$7.1M", uplift: "+$1.1M", status: "onboarding" },
  { name: "Lakewood Health Partners", members: 890, avgRAF: 1.44, recapture: 62, suspects: 498, projRev: "$3.8M", uplift: "+$0.8M", status: "pipeline" },
];

const overlayEMRs = [
  { name: "Epic", status: "FHIR R4 Ready", icon: "⬡", color: C.accent },
  { name: "Cerner/Oracle", status: "FHIR R4 Ready", icon: "⬡", color: C.accent },
  { name: "athenahealth", status: "API Connected", icon: "◇", color: C.blue },
  { name: "eClinicalWorks", status: "API Connected", icon: "◇", color: C.blue },
  { name: "OpenEMR Native", status: "Full Integration", icon: "●", color: C.purple },
  { name: "AllScripts/Veradigm", status: "HL7v2 Bridge", icon: "△", color: C.warn },
];

function Badge({ children, color = C.accent, bg }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: mono, fontWeight: 600, color, background: bg || C.accentGlow, letterSpacing: "0.02em" }}>{children}</span>;
}

function ConfBar({ value }) {
  const color = value >= 90 ? C.accent : value >= 80 ? C.warn : C.blue;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.border }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: mono, color, fontWeight: 600 }}>{value}%</span>
    </div>
  );
}

function Stat({ label, value, sub, accent = C.accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent, opacity: 0.6 }} />
      <div style={{ fontSize: 10, fontFamily: mono, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: mono, fontWeight: 700, color: C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, fontFamily: mono, color: accent, marginTop: 5, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

// ─── SNF MODULE ───
function SNFModule() {
  const [sel, setSel] = useState(0);
  const pt = snfAdmits[sel];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "100%" }}>
      {/* Left: Admit List */}
      <div style={{ borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>New SNF Admits</span>
          <Badge color={C.orange} bg={C.orangeDim}>{snfAdmits.length} PENDING</Badge>
        </div>
        {snfAdmits.map((a, i) => (
          <div key={a.id} onClick={() => setSel(i)} style={{
            padding: "14px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`,
            borderLeft: sel === i ? `3px solid ${C.orange}` : "3px solid transparent",
            background: sel === i ? C.surfaceAlt : "transparent",
          }}>
            <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 14, color: C.text }}>{a.name}</div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, marginTop: 2 }}>Age {a.age} · Admitted {a.admitDate}</div>
            <div style={{ fontFamily: sans, fontSize: 12, color: C.textMuted, marginTop: 4 }}>{a.admitDx}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <Badge color={C.orange} bg={C.orangeDim}>From: {a.source}</Badge>
              <Badge color={C.accent}>+{a.projectedHccs - a.preAdmitHccs} HCCs</Badge>
            </div>
          </div>
        ))}
        <div style={{ padding: "16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>OCC → ICD Pipeline</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11, color: C.textMuted }}>
            <span style={{ color: C.orange }}>MDS/OCC</span>
            <span style={{ color: C.textDim }}>→</span>
            <span style={{ color: C.blue }}>NLP Extract</span>
            <span style={{ color: C.textDim }}>→</span>
            <span style={{ color: C.purple }}>ICD-10 Map</span>
            <span style={{ color: C.textDim }}>→</span>
            <span style={{ color: C.accent }}>HCC Capture</span>
          </div>
        </div>
      </div>

      {/* Right: Detail */}
      <div style={{ overflow: "auto" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: sans, fontWeight: 700, fontSize: 20, color: C.text }}>{pt.name}</h3>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, marginTop: 3 }}>
              Age {pt.age} · Admitted {pt.admitDate} from {pt.source} · Dx: {pt.admitDx}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>Pre-Admit HCCs</div>
              <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.textMuted }}>{pt.preAdmitHccs}</div>
            </div>
            <div style={{ fontSize: 18, color: C.textDim }}>→</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>Projected HCCs</div>
              <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.accent }}>{pt.projectedHccs}</div>
            </div>
          </div>
        </div>

        {/* OCC Auto-Mapped Section */}
        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.orange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            ⊞ Auto-Mapped from OCC / Hospital Records
            <Badge color={C.cyan} bg={C.cyanDim}>SNF ADMIT ASSISTANT</Badge>
          </div>
          {pt.mappedIcds.map((m, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "100px 1.5fr 90px 90px 130px",
              alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 4,
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
            }}>
              <Badge color={C.blue} bg={C.blueDim}>{m.icd}</Badge>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{m.desc}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: m.hcc ? C.accent : C.textDim }}>{m.hcc || "—"}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: m.raf > 0 ? C.accent : C.textDim, fontWeight: 600 }}>{m.raf > 0 ? `+${m.raf.toFixed(3)}` : "—"}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim }}>{m.source}</span>
            </div>
          ))}
        </div>

        {/* Suspect Section */}
        <div style={{ padding: "0 24px 16px" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.warn, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            ◉ Suspect HCCs from Hospital Data
            <Badge color={C.warn} bg={C.warnDim}>AUTOCODER HCC ENGINE</Badge>
          </div>
          {pt.suspects.map((s, i) => (
            <div key={i} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 16, marginBottom: 8, borderLeft: `3px solid ${C.warn}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge color={C.warn} bg={C.warnDim}>{s.icd}</Badge>
                  <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{s.desc}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>→ {s.hcc}</span>
                </div>
                <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.accent, background: C.accentGlow, padding: "3px 8px", borderRadius: 4 }}>+{s.raf.toFixed(3)}</span>
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.textMuted, padding: "8px 12px", background: C.surfaceAlt, borderRadius: 4, marginBottom: 8, borderLeft: `2px solid ${C.borderLight}` }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>EVIDENCE: </span>{s.evidence}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <ConfBar value={s.confidence} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ background: C.accentGlow, color: C.accent, border: `1px solid ${C.accentDim}`, padding: "5px 12px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>✓ Add to Chart</button>
                  <button style={{ background: C.surfaceAlt, color: C.textDim, border: `1px solid ${C.border}`, padding: "5px 12px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Review Later</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Meds */}
        <div style={{ padding: "0 24px 20px" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Transfer Medications</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {pt.meds.map((m, i) => (
              <span key={i} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: mono, background: C.surfaceAlt, color: C.textMuted, border: `1px solid ${C.border}` }}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OVERLAY MODULE ───
function OverlayModule() {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ maxWidth: 900 }}>
        <h3 style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: C.text, margin: "0 0 6px" }}>EMR Overlay Mode</h3>
        <p style={{ fontFamily: sans, fontSize: 14, color: C.textMuted, margin: "0 0 24px", lineHeight: 1.6 }}>
          Deploy as a lightweight overlay on existing EMRs via FHIR R4, REST APIs, or HL7v2 bridges.
          No rip-and-replace — the AQSoft.AI AutoCoder HCC engine runs alongside the provider's current EHR.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {overlayEMRs.map((e, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18, color: e.color }}>{e.icon}</span>
              <div>
                <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 14, color: C.text }}>{e.name}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: e.color }}>{e.status}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Integration Architecture</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
          {[
            { left: "Client EMR", right: "FHIR R4 / HL7v2", desc: "Patient demographics, encounters, problem lists, medications, labs flow in real-time" },
            { left: "AutoCoder HCC Engine", right: "AQSoft.AI · YAML Rules + FAISS", desc: "ICD-10 → HCC mapping, suspect identification, confidence scoring, RAF calculation" },
            { left: "SNF Admit Assistant", right: "OCC/MDS Parser", desc: "Auto-extracts functional status, cognitive data, diagnoses from post-acute assessments" },
            { left: "ScrubGate", right: "PHI De-ID Pipeline", desc: "All data passes through de-identification before analytics processing" },
            { left: "Overlay UI", right: "React Sidebar / iFrame", desc: "Renders inside or alongside the EMR — suspect HCCs, care gaps, RAF projections" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "12px 0", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: C.accent }}>{row.left}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim }}>{row.right}</div>
              </div>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{row.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: "14px 18px", background: C.surfaceAlt, borderRadius: 8, border: `1px dashed ${C.borderLight}`, fontFamily: sans, fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.purple, fontWeight: 700 }}>KEY DIFFERENTIATOR: </span>
          Unlike Vatica (which requires embedded clinical staff) or Episource (retrospective chart review),
          this is a <span style={{ color: C.accent, fontWeight: 600 }}>fully autonomous AI overlay</span> powered by AQSoft.AI that runs prospectively at the point of care with no additional headcount.
          The AutoCoder HCC engine does the work that Vatica's licensed nurses do — but at scale, instantly, and across every encounter type including SNF/post-acute.
        </div>
      </div>
    </div>
  );
}

// ─── MSO MODULE ───
function MSOModule() {
  return (
    <div style={{ padding: 28 }}>
      <h3 style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: C.text, margin: "0 0 6px" }}>MSO Client Dashboard</h3>
      <p style={{ fontFamily: sans, fontSize: 14, color: C.textMuted, margin: "0 0 20px" }}>
        Multi-tenant risk adjustment analytics across managed care clients.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <Stat label="Total Attributed Lives" value="8,840" sub="Across 4 clients" accent={C.blue} />
        <Stat label="Aggregate Suspects" value="3,780" sub="Awaiting capture" accent={C.warn} />
        <Stat label="Combined Projected Rev" value="$38.2M" sub="+$6.5M uplift" />
        <Stat label="Avg Recapture Rate" value="68.8%" sub="Target: 85%" accent={C.purple} />
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.5fr 0.6fr 0.6fr 0.7fr 0.7fr 0.5fr", gap: 8, padding: "10px 16px", fontSize: 10, fontFamily: mono, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}` }}>
          <span>Client</span><span>Members</span><span>Avg RAF</span><span>Recapture</span><span>Suspects</span><span>Proj. Rev</span><span>Uplift</span><span>Status</span>
        </div>
        {msoClients.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.5fr 0.6fr 0.6fr 0.7fr 0.7fr 0.5fr", gap: 8, padding: "12px 16px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{c.name}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>{c.members.toLocaleString()}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.blue }}>{c.avgRAF}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: C.border }}>
                  <div style={{ width: `${c.recapture}%`, height: "100%", borderRadius: 2, background: c.recapture >= 72 ? C.accent : C.warn }} />
                </div>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.textMuted }}>{c.recapture}%</span>
              </div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.warn }}>{c.suspects.toLocaleString()}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.text, fontWeight: 600 }}>{c.projRev}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.accent, fontWeight: 700 }}>{c.uplift}</span>
            <Badge
              color={c.status === "active" ? C.accent : c.status === "onboarding" ? C.blue : C.textDim}
              bg={c.status === "active" ? C.accentGlow : c.status === "onboarding" ? C.blueDim : C.surfaceAlt}
            >{c.status.toUpperCase()}</Badge>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Revenue Model Per Client</div>
          {[
            { label: "Platform License", value: "$2-4 PMPM", desc: "Base access to overlay + HCC engine" },
            { label: "HCC Capture Fee", value: "$15-25 per capture", desc: "Per newly documented HCC with MEAT evidence" },
            { label: "SNF Admit Processing", value: "$50-75 per admit", desc: "OCC parsing + auto-chart population + HCC sweep" },
            { label: "Revenue Share Option", value: "8-12% of RAF uplift", desc: "Aligned incentive model for larger groups" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
              <div>
                <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: C.text }}>{r.label}</div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.textDim }}>{r.desc}</div>
              </div>
              <span style={{ fontFamily: mono, fontSize: 13, color: C.accent, fontWeight: 700, whiteSpace: "nowrap" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Competitive Positioning</div>
          {[
            { them: "Vatica Health", us: "No embedded nurses — AQSoft.AI AutoCoder is AI-first, not people-first" },
            { them: "Episource/Cotiviti", us: "Prospective at point-of-care, not retrospective chart review" },
            { them: "RAAPID", us: "Full post-acute/SNF pipeline — they don't touch SNF data" },
            { them: "Optum/Solventum", us: "Open-source base, no vendor lock-in, 10x lower cost" },
          ].map((c, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.warn, marginBottom: 3 }}>vs {c.them}</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.textMuted }}>{c.us}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export default function OpenEMR_HCC_Full() {
  const [mode, setMode] = useState("snf");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: sans }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(17,24,39,0.95)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, fontSize: 13, fontWeight: 800, fontFamily: mono, color: "#000" }}>R</div>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: C.text }}>OpenEMR<span style={{ color: C.accent }}>|HCC</span></span>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6 }}>Risk Adjustment Platform</span>
        </div>

        {/* Mode Tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {modes.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              background: mode === m.key ? C.surfaceAlt : "transparent",
              border: mode === m.key ? `1px solid ${C.border}` : "1px solid transparent",
              borderRadius: 6, padding: "6px 14px", cursor: "pointer",
              fontFamily: mono, fontSize: 11, fontWeight: 600,
              color: mode === m.key ? C.accent : C.textDim,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>{m.icon}</span> {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge>V28</Badge>
          <Badge color={C.blue} bg={C.blueDim}>PY 2026</Badge>
        </div>
      </header>

      {/* CONTENT */}
      <div style={{ minHeight: "calc(100vh - 90px)" }}>
        {mode === "hcc" && (
          <div style={{ padding: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 16, color: C.textMuted, textAlign: "center", paddingTop: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>◉</div>
              <div style={{ fontFamily: mono, fontSize: 14, color: C.accent, fontWeight: 700 }}>HCC Workstation</div>
              <div style={{ marginTop: 8 }}>Primary care risk adjustment workflow — see previous concept build</div>
            </div>
          </div>
        )}
        {mode === "snf" && <SNFModule />}
        {mode === "overlay" && <OverlayModule />}
        {mode === "mso" && <MSOModule />}
      </div>

      <footer style={{ padding: "8px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, color: C.textDim }}>
        <span>OpenEMR|HCC v1.0 · AQSoft.AI · GPL-3.0 Core + Proprietary Modules</span>
        <span>AutoCoder HCC Engine · SNF Admit Assistant · ScrubGate PHI Pipeline · CMS-HCC V28</span>
      </footer>
    </div>
  );
}
