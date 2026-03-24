import { useState } from "react";

const COLORS = {
  bg: "#0a0e17",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e293b",
  borderLight: "#2d3a4f",
  text: "#e2e8f0",
  textMuted: "#8899b0",
  textDim: "#5a6b80",
  accent: "#10b981",
  accentDim: "#059669",
  accentGlow: "rgba(16, 185, 129, 0.12)",
  warning: "#f59e0b",
  warningDim: "rgba(245, 158, 11, 0.15)",
  danger: "#ef4444",
  dangerDim: "rgba(239, 68, 68, 0.12)",
  blue: "#3b82f6",
  blueDim: "rgba(59, 130, 246, 0.12)",
  purple: "#a78bfa",
  purpleDim: "rgba(167, 139, 250, 0.1)",
};

const font = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
const fontSans = "'DM Sans', 'Satoshi', system-ui, sans-serif";

const patients = [
  {
    id: 1, name: "Margaret Chen", age: 72, dob: "1953-08-14",
    currentRAF: 1.847, projectedRAF: 2.312, delta: "+0.465",
    lastVisit: "2026-01-15", nextVisit: "2026-04-02",
    hccs: [
      { code: "HCC 18", desc: "Diabetes w/ Chronic Complications", status: "confirmed", icd: "E11.65", raf: 0.302 },
      { code: "HCC 85", desc: "Congestive Heart Failure", status: "confirmed", icd: "I50.22", raf: 0.323 },
      { code: "HCC 111", desc: "Chronic Obstructive Pulmonary Disease", status: "confirmed", icd: "J44.1", raf: 0.280 },
    ],
    suspects: [
      { code: "HCC 108", desc: "Vascular Disease", evidence: "PVD noted in vascular consult 11/2025, not coded on last encounter", confidence: 92, icd: "I73.9", raf: 0.288 },
      { code: "HCC 22", desc: "Morbid Obesity", evidence: "BMI 41.2 documented in vitals, no active ICD code", confidence: 88, icd: "E66.01", raf: 0.250 },
    ],
    gaps: ["Annual diabetic eye exam overdue", "HbA1c not recaptured in CY2026"],
    meds: ["Metformin 1000mg BID", "Lisinopril 20mg daily", "Furosemide 40mg daily"],
  },
  {
    id: 2, name: "Robert Williams", age: 68, dob: "1957-11-03",
    currentRAF: 1.234, projectedRAF: 1.678, delta: "+0.444",
    lastVisit: "2026-02-20", nextVisit: "2026-03-28",
    hccs: [
      { code: "HCC 96", desc: "Specified Heart Arrhythmias", status: "confirmed", icd: "I48.91", raf: 0.280 },
      { code: "HCC 12", desc: "Breast/Prostate/Colorectal Cancer", status: "confirmed", icd: "C61", raf: 0.146 },
    ],
    suspects: [
      { code: "HCC 85", desc: "Congestive Heart Failure", evidence: "Echo shows EF 38%, cardiologist note mentions HFrEF — never coded", confidence: 95, icd: "I50.22", raf: 0.323 },
      { code: "HCC 18", desc: "Diabetes w/ Chronic Complications", evidence: "Microalbuminuria on labs + DM dx, complication not linked", confidence: 85, icd: "E11.65", raf: 0.302 },
      { code: "HCC 48", desc: "Coagulation Defects", evidence: "On warfarin, INR monitoring — underlying dx not coded", confidence: 78, icd: "D68.9", raf: 0.188 },
    ],
    gaps: ["Colonoscopy screening due", "Bone density scan overdue"],
    meds: ["Warfarin 5mg daily", "Eliquis 5mg BID", "Tamsulosin 0.4mg daily"],
  },
  {
    id: 3, name: "Dorothy Martinez", age: 81, dob: "1944-05-22",
    currentRAF: 2.456, projectedRAF: 2.789, delta: "+0.333",
    lastVisit: "2026-03-05", nextVisit: "2026-04-15",
    hccs: [
      { code: "HCC 85", desc: "Congestive Heart Failure", status: "confirmed", icd: "I50.32", raf: 0.323 },
      { code: "HCC 18", desc: "Diabetes w/ Chronic Complications", status: "confirmed", icd: "E11.65", raf: 0.302 },
      { code: "HCC 135", desc: "Acute Renal Failure", status: "confirmed", icd: "N17.9", raf: 0.423 },
      { code: "HCC 59", desc: "Major Depressive Disorder", status: "confirmed", icd: "F33.1", raf: 0.309 },
    ],
    suspects: [
      { code: "HCC 161", desc: "Chronic Ulcer of Skin", evidence: "Wound care notes from SNF, venous stasis ulcer documented", confidence: 90, icd: "L97.919", raf: 0.515 },
    ],
    gaps: ["Depression screening PHQ-9 due", "Nephrology referral follow-up"],
    meds: ["Insulin Glargine 30u", "Carvedilol 12.5mg BID", "Sertraline 100mg daily", "Amlodipine 10mg daily"],
  },
];

const panelStats = {
  totalMembers: 2847,
  avgRAF: 1.432,
  suspectHCCs: 1243,
  recaptureRate: 72.4,
  projectedRevenue: "$14.2M",
  revenueUplift: "+$2.1M",
  visitsCompleted: 1893,
  visitTarget: 2847,
};

function Badge({ children, color = COLORS.accent, bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontFamily: font, fontWeight: 600,
      color: color, background: bg || "rgba(16,185,129,0.12)",
      letterSpacing: "0.02em",
    }}>{children}</span>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 90 ? COLORS.accent : value >= 80 ? COLORS.warning : COLORS.blue;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: COLORS.border }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: font, color, fontWeight: 600 }}>{value}%</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon, accent = COLORS.accent }) {
  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
      borderRadius: 8, padding: "16px 20px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent, opacity: 0.6 }} />
      <div style={{ fontSize: 11, fontFamily: font, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: font, fontWeight: 700, color: COLORS.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontFamily: font, color: accent, marginTop: 6, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

function PatientRow({ p, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "1.8fr 0.6fr 0.8fr 0.8fr 0.6fr",
      gap: 12, alignItems: "center", padding: "12px 16px",
      background: selected ? COLORS.surfaceAlt : "transparent",
      borderLeft: selected ? `3px solid ${COLORS.accent}` : "3px solid transparent",
      cursor: "pointer", transition: "all 0.15s ease",
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <div>
        <div style={{ fontFamily: fontSans, fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{p.name}</div>
        <div style={{ fontFamily: font, color: COLORS.textDim, fontSize: 11 }}>Age {p.age} · DOB {p.dob}</div>
      </div>
      <div style={{ fontFamily: font, fontSize: 13, color: COLORS.text }}>{p.currentRAF.toFixed(3)}</div>
      <div style={{ fontFamily: font, fontSize: 13, color: COLORS.accent, fontWeight: 600 }}>{p.projectedRAF.toFixed(3)}</div>
      <div>
        <Badge color={COLORS.warning} bg={COLORS.warningDim}>
          {p.suspects.length} SUSPECT{p.suspects.length > 1 ? "S" : ""}
        </Badge>
      </div>
      <div style={{ fontFamily: font, fontSize: 11, color: COLORS.textDim }}>{p.nextVisit}</div>
    </div>
  );
}

export default function OpenEMR_HCC() {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("suspects");
  const p = patients[selected];
  const visitPct = Math.round((panelStats.visitsCompleted / panelStats.visitTarget) * 100);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: fontSans }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(17,24,39,0.95)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.blue})`, fontSize: 14, fontWeight: 800, fontFamily: font, color: "#000",
          }}>R</div>
          <div>
            <span style={{ fontFamily: font, fontWeight: 700, fontSize: 15, color: COLORS.text, letterSpacing: "-0.02em" }}>
              OpenEMR<span style={{ color: COLORS.accent }}>|HCC</span>
            </span>
            <span style={{ fontFamily: font, fontSize: 10, color: COLORS.textDim, marginLeft: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Risk Adjustment Platform
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Badge color={COLORS.accent}>CMS-HCC V28</Badge>
          <Badge color={COLORS.blue} bg={COLORS.blueDim}>PY 2026</Badge>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: COLORS.surfaceAlt,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: font, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
          }}>CS</div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
        {/* STATS BAR */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            <StatCard label="Panel Size" value={panelStats.totalMembers.toLocaleString()} sub="Attributed lives" />
            <StatCard label="Avg RAF Score" value={panelStats.avgRAF.toFixed(3)} sub="V28 Model" accent={COLORS.blue} />
            <StatCard label="Suspect HCCs" value={panelStats.suspectHCCs.toLocaleString()} sub="Awaiting capture" accent={COLORS.warning} />
            <StatCard label="Recapture Rate" value={`${panelStats.recaptureRate}%`} sub="↑ 4.2% vs CY2025" />
            <StatCard label="Projected Rev" value={panelStats.projectedRevenue} sub={panelStats.revenueUplift} />
            <StatCard label="AWV Progress" value={`${visitPct}%`} sub={`${panelStats.visitsCompleted}/${panelStats.visitTarget}`} accent={COLORS.purple} />
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", minHeight: "calc(100vh - 170px)" }}>

          {/* LEFT: PATIENT LIST */}
          <div style={{ borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: font, fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Priority Worklist
              </span>
              <Badge color={COLORS.warning} bg={COLORS.warningDim}>BY RAF UPLIFT ▾</Badge>
            </div>
            <div style={{ padding: "8px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1.8fr 0.6fr 0.8fr 0.8fr 0.6fr",
                gap: 12, padding: "0 0", fontSize: 10, fontFamily: font,
                color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                <span>Patient</span><span>RAF</span><span>Projected</span><span>Suspects</span><span>Next Visit</span>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {patients.map((pt, i) => (
                <PatientRow key={pt.id} p={pt} selected={i === selected} onClick={() => { setSelected(i); setTab("suspects"); }} />
              ))}
            </div>
          </div>

          {/* RIGHT: PATIENT DETAIL */}
          <div style={{ overflow: "auto" }}>
            {/* Patient Header */}
            <div style={{
              padding: "20px 28px", borderBottom: `1px solid ${COLORS.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            }}>
              <div>
                <h2 style={{ fontFamily: fontSans, fontWeight: 700, fontSize: 22, margin: 0, color: COLORS.text }}>{p.name}</h2>
                <div style={{ fontFamily: font, fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>
                  Age {p.age} · DOB {p.dob} · Last seen {p.lastVisit} · Next visit {p.nextVisit}
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: font, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Current RAF</div>
                  <div style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: COLORS.textMuted }}>{p.currentRAF.toFixed(3)}</div>
                </div>
                <div style={{ fontSize: 20, color: COLORS.textDim }}>→</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: font, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Projected RAF</div>
                  <div style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: COLORS.accent }}>{p.projectedRAF.toFixed(3)}</div>
                </div>
                <div style={{
                  padding: "8px 14px", borderRadius: 6,
                  background: COLORS.accentGlow, border: `1px solid ${COLORS.accentDim}`,
                  fontFamily: font, fontSize: 16, fontWeight: 700, color: COLORS.accent,
                }}>{p.delta}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}` }}>
              {[
                { key: "suspects", label: "Suspect HCCs", count: p.suspects.length },
                { key: "confirmed", label: "Confirmed HCCs", count: p.hccs.length },
                { key: "gaps", label: "Care Gaps", count: p.gaps.length },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "12px 20px", fontFamily: font, fontSize: 12, fontWeight: 600,
                  color: tab === t.key ? COLORS.accent : COLORS.textDim,
                  borderBottom: tab === t.key ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                  transition: "all 0.15s ease", letterSpacing: "0.02em",
                }}>
                  {t.label} <span style={{
                    marginLeft: 6, padding: "1px 6px", borderRadius: 3, fontSize: 10,
                    background: tab === t.key ? COLORS.accentGlow : COLORS.surfaceAlt,
                    color: tab === t.key ? COLORS.accent : COLORS.textDim,
                  }}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ padding: "20px 28px" }}>
              {tab === "suspects" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {p.suspects.map((s, i) => (
                    <div key={i} style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, padding: 20, position: "relative", overflow: "hidden",
                    }}>
                      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: COLORS.warning }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: font, fontWeight: 700, fontSize: 14, color: COLORS.warning }}>{s.code}</span>
                          <span style={{ fontFamily: fontSans, fontWeight: 600, fontSize: 14, color: COLORS.text }}>{s.desc}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Badge>{s.icd}</Badge>
                          <div style={{
                            fontFamily: font, fontSize: 13, fontWeight: 700, color: COLORS.accent,
                            background: COLORS.accentGlow, padding: "4px 10px", borderRadius: 4,
                          }}>+{s.raf.toFixed(3)} RAF</div>
                        </div>
                      </div>
                      <div style={{
                        fontFamily: fontSans, fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5,
                        padding: "10px 14px", background: COLORS.surfaceAlt, borderRadius: 6, marginBottom: 14,
                        borderLeft: `2px solid ${COLORS.borderLight}`,
                      }}>
                        <span style={{ fontFamily: font, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>EVIDENCE: </span>
                        {s.evidence}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: font, fontSize: 11, color: COLORS.textDim }}>Confidence:</span>
                          <ConfidenceBar value={s.confidence} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={{
                            background: COLORS.accentGlow, color: COLORS.accent, border: `1px solid ${COLORS.accentDim}`,
                            padding: "6px 14px", borderRadius: 5, fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}>✓ Capture on Encounter</button>
                          <button style={{
                            background: COLORS.surfaceAlt, color: COLORS.textDim, border: `1px solid ${COLORS.border}`,
                            padding: "6px 14px", borderRadius: 5, fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}>✕ Dismiss</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, padding: "14px 18px", background: COLORS.surfaceAlt,
                    borderRadius: 8, border: `1px dashed ${COLORS.borderLight}`,
                    fontFamily: font, fontSize: 12, color: COLORS.textDim, textAlign: "center",
                  }}>
                    Total potential uplift from suspects: <span style={{ color: COLORS.accent, fontWeight: 700 }}>
                    +{p.suspects.reduce((a, s) => a + s.raf, 0).toFixed(3)} RAF
                    </span>
                    {" · "}
                    Est. <span style={{ color: COLORS.accent, fontWeight: 700 }}>
                    ${Math.round(p.suspects.reduce((a, s) => a + s.raf, 0) * 11000).toLocaleString()}
                    </span> annualized PMPM impact
                  </div>
                </div>
              )}

              {tab === "confirmed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {p.hccs.map((h, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "120px 1.5fr 80px 100px",
                      alignItems: "center", gap: 12, padding: "14px 18px",
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                    }}>
                      <span style={{ fontFamily: font, fontWeight: 700, fontSize: 13, color: COLORS.blue }}>{h.code}</span>
                      <span style={{ fontFamily: fontSans, fontSize: 13, color: COLORS.text }}>{h.desc}</span>
                      <Badge color={COLORS.blue} bg={COLORS.blueDim}>{h.icd}</Badge>
                      <span style={{ fontFamily: font, fontSize: 12, color: COLORS.accent, fontWeight: 600, textAlign: "right" }}>{h.raf.toFixed(3)} RAF</span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, padding: "14px 18px", background: COLORS.surfaceAlt,
                    borderRadius: 8, border: `1px solid ${COLORS.border}`,
                    fontFamily: font, fontSize: 12, color: COLORS.textDim, textAlign: "center",
                  }}>
                    Confirmed RAF contribution: <span style={{ color: COLORS.blue, fontWeight: 700 }}>
                    {p.hccs.reduce((a, h) => a + h.raf, 0).toFixed(3)}
                    </span>
                    {" · "}
                    <span style={{ color: COLORS.textMuted }}>All conditions require annual recapture</span>
                  </div>
                </div>
              )}

              {tab === "gaps" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {p.gaps.map((g, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`, borderRadius: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: COLORS.danger, boxShadow: `0 0 8px ${COLORS.danger}40`,
                        }} />
                        <span style={{ fontFamily: fontSans, fontSize: 13, color: COLORS.text }}>{g}</span>
                      </div>
                      <button style={{
                        background: COLORS.dangerDim, color: COLORS.danger, border: `1px solid rgba(239,68,68,0.3)`,
                        padding: "5px 12px", borderRadius: 5, fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Order / Schedule</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontFamily: font, fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Active Medications ({p.meds.length})
                    </div>
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 6,
                    }}>
                      {p.meds.map((m, i) => (
                        <span key={i} style={{
                          padding: "4px 10px", borderRadius: 4, fontSize: 12, fontFamily: font,
                          background: COLORS.surfaceAlt, color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
                        }}>{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{
        padding: "10px 24px", borderTop: `1px solid ${COLORS.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: font, fontSize: 10, color: COLORS.textDim,
      }}>
        <span>OpenEMR|HCC v1.0 · Fork of OpenEMR 8.0.0 · GPL-3.0</span>
        <span>Powered by ChartCoPilot Engine · {patients.length} patients in view · RAF Model CMS-HCC V28</span>
      </footer>
    </div>
  );
}
