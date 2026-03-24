import { useState } from "react";

const T = {
  bg: "#fafaf9", surface: "#ffffff", alt: "#f5f5f4",
  border: "#e7e5e4", borderSoft: "#f0eeec",
  text: "#1c1917", sec: "#57534e", muted: "#a8a29e",
  accent: "#16a34a", accentSoft: "#dcfce7", accentText: "#15803d",
  blue: "#2563eb", blueSoft: "#dbeafe", blueText: "#1e40af",
  amber: "#d97706", amberSoft: "#fef3c7", amberText: "#92400e",
  red: "#dc2626", redSoft: "#fee2e2", redText: "#991b1b",
  purple: "#7c3aed", purpleSoft: "#f3e8ff",
};
const bd = "'Inter',system-ui,sans-serif";
const cd = "'SF Mono','JetBrains Mono',monospace";

function Tag({ children, v = "default" }) {
  const s = { default: { bg: T.alt, c: T.sec, b: T.border }, green: { bg: T.accentSoft, c: T.accentText, b: "#bbf7d0" }, amber: { bg: T.amberSoft, c: T.amberText, b: "#fde68a" }, red: { bg: T.redSoft, c: T.redText, b: "#fecaca" }, blue: { bg: T.blueSoft, c: T.blueText, b: "#bfdbfe" } }[v] || { bg: T.alt, c: T.sec, b: T.border };
  return <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontFamily: bd, fontWeight: 500, color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>{children}</span>;
}
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: cd, fontSize: 24, fontWeight: 700, color: color || T.text, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.accentText, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, marginTop: 20 }}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════
const MODULES = [
  { id: "schedule", label: "Schedule", icon: "◎" },
  { id: "quality", label: "Quality", icon: "★" },
  { id: "spend", label: "Expenditures", icon: "◫" },
  { id: "ops", label: "Operations", icon: "♥" },
  { id: "data", label: "Data", icon: "◈" },
];

// ═══════════════════════════════════════════════════════════════
// SCHEDULE — Multi-provider calendar + worklist
// ═══════════════════════════════════════════════════════════════
function ScheduleView() {
  const [view, setView] = useState("worklist");
  const [selProvider, setSelProvider] = useState("all");

  const providers = [
    { id: "all", name: "All Providers", initials: "All" },
    { id: "rivera", name: "Dr. Rivera", initials: "MR", patients: 12, color: "#3b82f6" },
    { id: "patel", name: "Dr. Patel", initials: "SP", patients: 9, color: "#8b5cf6" },
    { id: "kim", name: "Dr. Kim", initials: "JK", patients: 8, color: "#ec4899" },
    { id: "spergel", name: "Dr. Spergel", initials: "CS", patients: 6, color: "#16a34a" },
  ];

  const calendarSlots = [
    { time: "8:00", provider: "spergel", patient: "M. Chen", type: "Admission H&P", room: "204B", suspects: 3, gaps: 4 },
    { time: "8:00", provider: "rivera", patient: "L. Vasquez", type: "Follow-up", room: "115", suspects: 0, gaps: 1 },
    { time: "8:00", provider: "patel", patient: "T. Johnson", type: "Weekly", room: "302", suspects: 1, gaps: 0 },
    { time: "9:00", provider: "spergel", patient: "R. Williams", type: "Follow-up", room: "118A", suspects: 2, gaps: 2 },
    { time: "9:00", provider: "rivera", patient: "A. Thompson", type: "Recapture", room: "220", suspects: 0, gaps: 3 },
    { time: "9:00", provider: "kim", patient: "H. Park", type: "New Admission", room: "401", suspects: 0, gaps: 0 },
    { time: "10:00", provider: "spergel", patient: "D. Martinez", type: "Recapture", room: "305", suspects: 1, gaps: 1 },
    { time: "10:00", provider: "patel", patient: "S. Brown", type: "Follow-up", room: "210", suspects: 0, gaps: 2 },
    { time: "10:00", provider: "rivera", patient: "K. Davis", type: "Weekly", room: "108", suspects: 0, gaps: 0 },
    { time: "10:00", provider: "kim", patient: "M. Wilson", type: "Follow-up", room: "315", suspects: 1, gaps: 1 },
    { time: "11:00", provider: "spergel", patient: "J. Thornton", type: "New Admission", room: "210", suspects: 0, gaps: 0 },
    { time: "11:00", provider: "rivera", patient: "C. Lee", type: "Recapture", room: "225", suspects: 2, gaps: 1 },
    { time: "1:00", provider: "spergel", patient: "P. Okafor", type: "Weekly", room: "112B", suspects: 0, gaps: 0 },
    { time: "1:00", provider: "patel", patient: "R. Garcia", type: "Follow-up", room: "318", suspects: 1, gaps: 2 },
    { time: "2:00", provider: "spergel", patient: "G. Foster", type: "Follow-up", room: "220", suspects: 1, gaps: 1 },
  ];

  const filtered = selProvider === "all" ? calendarSlots : calendarSlots.filter(s => s.provider === selProvider);
  const times = [...new Set(calendarSlots.map(s => s.time))];
  const activeProviders = selProvider === "all" ? providers.filter(p => p.id !== "all") : providers.filter(p => p.id === selProvider);

  const worklist = [
    { name: "Margaret Chen", age: 72, room: "204B", provider: "Dr. Spergel", type: "Admission H&P", raf: 1.847, suspects: 3, gaps: 4, reason: "3 suspected HCCs, 4 care gaps open", prep: "ready" },
    { name: "Robert Williams", age: 68, room: "118A", provider: "Dr. Spergel", type: "Follow-up", raf: 1.234, suspects: 2, gaps: 2, reason: "PHQ-9 elevated, depression undocumented", prep: "ready" },
    { name: "Cynthia Lee", age: 75, room: "225", provider: "Dr. Rivera", type: "Recapture", raf: 2.1, suspects: 2, gaps: 1, reason: "CHF + CKD recapture due, eye exam gap", prep: "ready" },
    { name: "Dorothy Martinez", age: 81, room: "305", provider: "Dr. Spergel", type: "Recapture", raf: 2.456, suspects: 1, gaps: 1, reason: "4 HCCs expiring CY2026", prep: "ready" },
    { name: "Rosa Garcia", age: 69, room: "318", provider: "Dr. Patel", type: "Follow-up", raf: 1.45, suspects: 1, gaps: 2, reason: "DM control, KED measure gap", prep: "ready" },
    { name: "Helen Park", age: 77, room: "401", provider: "Dr. Kim", type: "New Admission", raf: 0.9, suspects: 0, gaps: 0, reason: "New admit — chart prep building", prep: "building" },
    { name: "James Thornton", age: 78, room: "210", provider: "Dr. Spergel", type: "New Admission", raf: 0.8, suspects: 0, gaps: 0, reason: "Hip fracture — chart prep building", prep: "building" },
    { name: "Patricia Okafor", age: 84, room: "112B", provider: "Dr. Spergel", type: "Weekly", raf: 1.1, suspects: 0, gaps: 0, reason: "Stable, routine rounding", prep: "ready" },
  ];

  return (
    <div style={{ padding: "20px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Monday, March 23</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: "2px 0 0" }}>Sunrise SNF · {calendarSlots.length} patients across {providers.length - 1} providers</p>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.alt, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
          {["worklist", "calendar"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? T.surface : "transparent", border: view === v ? `1px solid ${T.border}` : "1px solid transparent",
              borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500,
              color: view === v ? T.text : T.muted, cursor: "pointer",
            }}>{v === "worklist" ? "Priority List" : "Calendar"}</button>
          ))}
        </div>
      </div>

      {/* Provider selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {providers.map(p => (
          <button key={p.id} onClick={() => setSelProvider(p.id)} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: selProvider === p.id ? T.surface : "transparent",
            border: `1px solid ${selProvider === p.id ? T.border : "transparent"}`,
            borderRadius: 8, padding: "6px 12px", cursor: "pointer",
            boxShadow: selProvider === p.id ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
          }}>
            {p.id !== "all" && <div style={{ width: 22, height: 22, borderRadius: "50%", background: p.color + "18", border: `1.5px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: p.color }}>{p.initials}</div>}
            <span style={{ fontSize: 12, fontWeight: selProvider === p.id ? 600 : 400, color: selProvider === p.id ? T.text : T.sec }}>{p.name}</span>
            {p.patients && <span style={{ fontFamily: cd, fontSize: 10, color: T.muted }}>{p.patients}</span>}
          </button>
        ))}
      </div>

      {view === "worklist" ? (
        <div style={{ display: "grid", gap: 4 }}>
          {worklist.filter(w => selProvider === "all" || w.provider.toLowerCase().includes(selProvider)).map((p, i) => (
            <div key={i} style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: "12px 16px", display: "grid", cursor: "pointer",
              gridTemplateColumns: "1.5fr 0.7fr 0.4fr 0.4fr 0.4fr 80px",
              gap: 10, alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{p.age}yo · Rm {p.room} · {p.type} · {p.provider}</div>
              </div>
              <div style={{ fontSize: 12, color: T.sec, lineHeight: 1.4 }}>{p.reason}</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: cd, fontSize: 14, fontWeight: 600 }}>{p.raf.toFixed(3)}</div>
                <div style={{ fontSize: 9, color: T.muted }}>RAF</div>
              </div>
              <div style={{ textAlign: "center" }}>{p.suspects > 0 ? <Tag v="amber">{p.suspects}</Tag> : <span style={{ color: T.muted, fontSize: 11 }}>—</span>}</div>
              <div style={{ textAlign: "center" }}>{p.gaps > 0 ? <Tag v="red">{p.gaps}</Tag> : <Tag v="green">0</Tag>}</div>
              <Tag v={p.prep === "ready" ? "green" : "amber"}>{p.prep === "ready" ? "Ready" : "Building"}</Tag>
            </div>
          ))}
        </div>
      ) : (
        /* Calendar view */
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${activeProviders.length}, 1fr)`, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ padding: "10px 8px", fontSize: 10, color: T.muted }} />
            {activeProviders.map(p => (
              <div key={p.id} style={{ padding: "10px 12px", borderLeft: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: p.color + "18", border: `1.5px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: p.color }}>{p.initials}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{p.name}</span>
              </div>
            ))}
          </div>

          {/* Time rows */}
          {times.map(time => (
            <div key={time} style={{ display: "grid", gridTemplateColumns: `60px repeat(${activeProviders.length}, 1fr)`, borderBottom: `1px solid ${T.borderSoft}`, minHeight: 60 }}>
              <div style={{ padding: "8px 8px", fontFamily: cd, fontSize: 11, color: T.muted, textAlign: "right" }}>{time}</div>
              {activeProviders.map(prov => {
                const slot = calendarSlots.find(s => s.time === time && s.provider === prov.id);
                return (
                  <div key={prov.id} style={{ padding: "6px 8px", borderLeft: `1px solid ${T.borderSoft}` }}>
                    {slot ? (
                      <div style={{ background: prov.color + "08", border: `1px solid ${prov.color}22`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", borderLeft: `3px solid ${prov.color}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{slot.patient}</div>
                        <div style={{ fontSize: 10, color: T.muted }}>Rm {slot.room} · {slot.type}</div>
                        {(slot.suspects > 0 || slot.gaps > 0) && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            {slot.suspects > 0 && <Tag v="amber">{slot.suspects}s</Tag>}
                            {slot.gaps > 0 && <Tag v="red">{slot.gaps}g</Tag>}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUALITY
// ═══════════════════════════════════════════════════════════════
function QualityView() {
  const [tab, setTab] = useState("stars");
  const hedis = [
    { code: "CBP", name: "Controlling Blood Pressure", rate: 72.1, target: 75, star: 4, weight: "3×", trend: "+2.3" },
    { code: "CDC-HbA1c", name: "Diabetes — HbA1c Control", rate: 64.8, target: 68, star: 3, weight: "3×", trend: "+1.1", alert: true },
    { code: "CDC-Eye", name: "Diabetes — Eye Exam", rate: 58.3, target: 65, star: 3, weight: "3×", trend: "-1.2", alert: true },
    { code: "CDC-KED", name: "Kidney Health Eval (DM)", rate: 41.2, target: 50, star: 2, weight: "1×", trend: "+5.4", alert: true },
    { code: "COL", name: "Colorectal Screening", rate: 71.4, target: 72, star: 4, weight: "1×", trend: "+0.8" },
    { code: "BCS", name: "Breast Cancer Screening", rate: 74.2, target: 75, star: 4, weight: "1×", trend: "+1.5" },
    { code: "MRP", name: "Med Reconciliation Post-DC", rate: 67.3, target: 72, star: 3, weight: "1×", trend: "+4.1" },
    { code: "SPD", name: "Statin Therapy (DM)", rate: 81.2, target: 80, star: 4, weight: "3×", trend: "+0.6" },
  ];
  const gaps = [
    { measure: "CDC-Eye", name: "Diabetic Eye Exam", gap: 353, eligible: 847, impact: "Critical Star measure" },
    { measure: "CDC-KED", name: "Kidney Health Eval", gap: 498, eligible: 847, impact: "New Star measure" },
    { measure: "CBP", name: "BP Control", gap: 587, eligible: 2104, impact: "Triple-weighted" },
    { measure: "COL", name: "Colorectal Screening", gap: 532, eligible: 1862, impact: "Star measure" },
    { measure: "AWV", name: "Annual Wellness Visit", gap: 954, eligible: 2847, impact: "RAF recapture" },
  ];
  return (
    <div style={{ padding: "20px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Quality performance</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: "2px 0 0" }}>Sunstate Medical Group · CY 2026 · 2,847 attributed lives</p>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.alt, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
          {[["stars","Star Ratings"],["hedis","HEDIS"],["gaps","Care Gaps"]].map(([id,l]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: tab===id?T.surface:"transparent", border: tab===id?`1px solid ${T.border}`:"1px solid transparent", borderRadius:6, padding:"6px 14px", fontSize:12, fontWeight: tab===id?600:400, color: tab===id?T.text:T.muted, cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "stars" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
            <Stat label="Overall Rating" value="3.5 ★" sub="0.5 from QBP threshold" color={T.amber} />
            <Stat label="Part C" value="3.5 ★" />
            <Stat label="Part D" value="4.0 ★" />
            <Stat label="QBP Value at 4★" value="$1.8M" color={T.accentText} />
            <Stat label="Measures ≥ 4★" value="5 / 8" />
          </div>
          <div style={{ padding: "14px 18px", background: T.accentSoft, borderRadius: 10, border: `1px solid #bbf7d0`, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.accentText }}>
              Closing 353 diabetic eye exams and 498 kidney evaluations would push overall to 4.0★ — unlocking ~$1.8M in quality bonus payments.
            </span>
          </div>
        </>
      )}

      {(tab === "stars" || tab === "hedis") && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1.5fr 0.5fr 0.5fr 0.4fr 0.4fr 0.4fr", gap: 8, padding: "10px 18px", fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>
            <span>Code</span><span>Measure</span><span>Rate</span><span>Target</span><span>Weight</span><span>Trend</span><span>Star</span>
          </div>
          {hedis.map((h, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "70px 1.5fr 0.5fr 0.5fr 0.4fr 0.4fr 0.4fr",
              gap: 8, padding: "10px 18px", alignItems: "center", borderBottom: `1px solid ${T.borderSoft}`,
              borderLeft: h.alert ? `3px solid ${T.red}` : "3px solid transparent",
              background: h.alert ? "#fef2f2" : "transparent",
            }}>
              <span style={{ fontFamily: cd, fontSize: 11, fontWeight: 600, color: h.alert ? T.red : T.blue }}>{h.code}</span>
              <span style={{ fontSize: 13, color: T.text }}>{h.name}</span>
              <span style={{ fontFamily: cd, fontSize: 13, fontWeight: 600, color: h.rate >= h.target ? T.accentText : T.red }}>{h.rate}%</span>
              <span style={{ fontFamily: cd, fontSize: 12, color: T.muted }}>{h.target}%</span>
              <span style={{ fontSize: 11, color: h.weight === "3×" ? T.amberText : T.muted, fontWeight: h.weight === "3×" ? 600 : 400 }}>{h.weight}</span>
              <span style={{ fontFamily: cd, fontSize: 11, color: h.trend.startsWith("+") ? T.accentText : T.red }}>{h.trend}</span>
              <span style={{ fontSize: 12, color: T.amber }}>{"★".repeat(h.star)}{"☆".repeat(5 - h.star)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "gaps" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <Stat label="Total open gaps" value="2,924" color={T.red} />
            <Stat label="Critical (Star impact)" value="851" color={T.red} />
            <Stat label="Gaps closed MTD" value="347" color={T.accentText} />
            <Stat label="Members with 3+ gaps" value="842" color={T.amber} />
          </div>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            {gaps.map((g, i) => {
              const rate = Math.round(((g.eligible - g.gap) / g.eligible) * 100);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1.2fr 0.5fr 0.5fr 0.6fr 1fr", gap: 8, padding: "12px 18px", alignItems: "center", borderBottom: `1px solid ${T.borderSoft}` }}>
                  <span style={{ fontFamily: cd, fontSize: 11, fontWeight: 600, color: T.red }}>{g.measure}</span>
                  <span style={{ fontSize: 13, color: T.text }}>{g.name}</span>
                  <span style={{ fontFamily: cd, fontSize: 12, color: T.sec }}>{g.eligible.toLocaleString()} eligible</span>
                  <span style={{ fontFamily: cd, fontSize: 13, fontWeight: 700, color: T.red }}>{g.gap.toLocaleString()} open</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 50, height: 4, borderRadius: 2, background: T.border }}>
                      <div style={{ width: `${rate}%`, height: "100%", borderRadius: 2, background: rate >= 70 ? T.accent : T.amber }} />
                    </div>
                    <span style={{ fontFamily: cd, fontSize: 10, color: T.muted }}>{rate}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: T.sec }}>{g.impact}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPENDITURES
// ═══════════════════════════════════════════════════════════════
function SpendView() {
  const [sel, setSel] = useState(null);
  const cats = [
    { id: "inp", label: "Inpatient", pmpm: 412, bench: 380, icon: "🏥" },
    { id: "ed", label: "ED / Obs", pmpm: 187, bench: 155, icon: "🚑" },
    { id: "prof", label: "Professional", pmpm: 224, bench: 200, icon: "👨‍⚕️" },
    { id: "snf", label: "SNF / Post-Acute", pmpm: 156, bench: 130, icon: "🏠" },
    { id: "rx", label: "Pharmacy", pmpm: 198, bench: 175, icon: "💊" },
    { id: "other", label: "Ancillary", pmpm: 70, bench: 60, icon: "📋" },
  ];
  const total = cats.reduce((s, c) => s + c.pmpm, 0);
  const totalBench = cats.reduce((s, c) => s + c.bench, 0);

  const details = {
    inp: { title: "Inpatient deep dive", insights: [
      { severity: "high", text: "Memorial Hospital readmission rate 16.2% — 47% above 11% benchmark. 23 avoidable readmissions = $423K waste.", action: "SNF transition protocol + 48hr post-DC calls" },
      { severity: "high", text: "DRG 291 (CHF) cost/case $1,400 above benchmark. Driven by ALOS 6.1 vs 5.2.", action: "CHF clinical pathway with daily weights + early diuresis" },
    ]},
    snf: { title: "SNF / Post-Acute deep dive", insights: [
      { severity: "high", text: "Palm Gardens: 22% rehospitalization, 28.4-day ALOS, 2-star CMS rating. $312K/yr excess.", action: "Redirect volume to Gulf Breeze Rehab (5-star, 8% rehosp). Savings: $180-240K" },
      { severity: "medium", text: "Home health underutilized — members going to SNF who could be managed at home.", action: "Home health first protocol for post-surgical patients" },
    ]},
    rx: { title: "Pharmacy deep dive", insights: [
      { severity: "high", text: "GLP-1 spend up 35% YoY. 87 members on Ozempic for non-DM weight management.", action: "Prior auth for GLP-1 non-DM use. Ensure DM patients have dx coded (HCC 37/38)" },
      { severity: "medium", text: "Generic rate 82% vs 88% benchmark. Eliquis→generic DOAC = $178K/yr savings.", action: "PBM therapeutic interchange program for top 3 brand drugs" },
    ]},
  };

  return (
    <div style={{ padding: "20px 28px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Expenditure intelligence</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 20px" }}>Total cost of care analysis · Sunstate Medical Group · 2,847 lives</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <Stat label="Total PMPM" value={`$${total}`} sub={`Benchmark: $${totalBench}`} color={total > totalBench ? T.red : T.accentText} />
        <Stat label="Excess / member / mo" value={`$${total - totalBench}`} sub={`$${((total - totalBench) * 2847 * 12 / 1000).toFixed(0)}K annually`} color={T.red} />
        <Stat label="MLR" value="86.2%" sub="Target: ≤85%" color={T.amber} />
        <Stat label="Savings identified" value="$1.4M" sub="18 recommendations" color={T.accentText} />
      </div>

      <SectionLabel>Spend by category — click to explore</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>
        {cats.map(c => {
          const over = c.pmpm > c.bench;
          return (
            <div key={c.id} onClick={() => setSel(sel === c.id ? null : c.id)} style={{
              background: sel === c.id ? T.surface : T.alt, border: `1px solid ${sel === c.id ? T.border : T.borderSoft}`,
              borderRadius: 10, padding: "14px 12px", cursor: "pointer",
              borderBottom: sel === c.id ? `2px solid ${T.accent}` : "2px solid transparent",
              boxShadow: sel === c.id ? "0 2px 8px rgba(0,0,0,0.05)" : "none",
            }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{c.label}</div>
              <div style={{ fontFamily: cd, fontSize: 20, fontWeight: 700, color: T.text, marginTop: 4 }}>${c.pmpm}</div>
              <div style={{ fontSize: 10, color: over ? T.red : T.accentText, marginTop: 2 }}>
                {over ? `+$${c.pmpm - c.bench} over` : "At benchmark"}
              </div>
            </div>
          );
        })}
      </div>

      {sel && details[sel] && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>{details[sel].title}</div>
          {details[sel].insights.map((ins, i) => (
            <div key={i} style={{ padding: "14px 16px", marginBottom: 8, background: ins.severity === "high" ? T.amberSoft : T.alt, borderRadius: 8, borderLeft: `3px solid ${ins.severity === "high" ? T.amber : T.blue}` }}>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginBottom: 6 }}>{ins.text}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: ins.severity === "high" ? T.amberText : T.blueText }}>→ {ins.action}</div>
            </div>
          ))}
        </div>
      )}

      {!sel && (
        <div style={{ textAlign: "center", padding: "30px 0", color: T.muted, fontSize: 13 }}>
          Select a category above for facility-level, provider-level, and drug-level analysis with optimization recommendations.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OPERATIONS — Care Mgmt, Attribution, Transitions, Outreach
// ═══════════════════════════════════════════════════════════════
function OpsView() {
  const [tab, setTab] = useState("care");
  const members = [
    { name: "Margaret Chen", age: 72, tier: "Complex", raf: 2.31, task: "Post-SNF follow-up call", due: "3/25", status: "due_soon", events: 3, pcp: "Dr. Rivera" },
    { name: "Dorothy Martinez", age: 81, tier: "Complex", raf: 2.79, task: "Nephrology referral f/u", due: "3/24", status: "overdue", events: 2, pcp: "Dr. Rivera" },
    { name: "Robert Williams", age: 68, tier: "High", raf: 1.68, task: "Med adherence check", due: "3/27", status: "upcoming", events: 1, pcp: "Dr. Patel" },
  ];
  const adtEvents = [
    { time: "2h ago", type: "ADMIT", member: "J. Thornton (78)", facility: "Memorial Hospital", reason: "Hip fracture", action: "SNF placement needed" },
    { time: "6h ago", type: "DISCHARGE", member: "P. Okafor (84)", facility: "St. Luke's", reason: "Pneumonia resolved", action: "Home health + 7d f/u" },
    { time: "12h ago", type: "ED", member: "G. Foster (71)", facility: "Bayfront ED", reason: "Chest pain — obs", action: "Monitoring" },
  ];
  const campaigns = [
    { name: "Diabetic Eye Exam", target: 353, completed: 42, rate: 12, status: "active" },
    { name: "Kidney Health Eval (KED)", target: 498, completed: 18, rate: 4, status: "active" },
    { name: "AWV Recapture Sprint", target: 954, completed: 156, rate: 16, status: "active" },
    { name: "Medication Adherence", target: 687, completed: 0, rate: 0, status: "planned" },
  ];
  const tierColor = { Complex: T.red, High: T.amber, Rising: T.blue };
  const statusColor = { overdue: T.red, due_soon: T.amber, upcoming: T.blue };
  const typeColor = { ADMIT: T.red, DISCHARGE: T.amber, ED: T.purple };

  return (
    <div style={{ padding: "20px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Operations</h2>
        <div style={{ display: "flex", gap: 4, background: T.alt, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
          {[["care","Care Mgmt"],["toc","Transitions"],["outreach","Outreach"]].map(([id,l]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: tab===id?T.surface:"transparent", border: tab===id?`1px solid ${T.border}`:"1px solid transparent", borderRadius:6, padding:"6px 14px", fontSize:12, fontWeight: tab===id?600:400, color: tab===id?T.text:T.muted, cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "care" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <Stat label="Complex" value="84" color={T.red} />
            <Stat label="High Risk" value="312" color={T.amber} />
            <Stat label="Rising Risk" value="587" color={T.blue} />
            <Stat label="Overdue Tasks" value="12" color={T.red} />
          </div>
          <SectionLabel>Active caseload</SectionLabel>
          {members.map((m, i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 6, display: "grid", gridTemplateColumns: "1.5fr 0.5fr 1.2fr 0.5fr 80px", gap: 10, alignItems: "center", borderLeft: `3px solid ${tierColor[m.tier]}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{m.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{m.age}yo · RAF {m.raf} · {m.pcp}</div>
              </div>
              <Tag v={m.tier === "Complex" ? "red" : "amber"}>{m.tier}</Tag>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: statusColor[m.status] }}>{m.status === "overdue" ? "⚠ " : ""}{m.task}</div>
                <div style={{ fontSize: 10, color: T.muted }}>Due: {m.due}</div>
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>{m.events} events</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={{ background: T.accentSoft, color: T.accentText, border: `1px solid #bbf7d0`, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>✓</button>
                <button style={{ background: T.alt, color: T.sec, border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>→</button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "toc" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <Stat label="Active Inpatients" value="8" color={T.red} />
            <Stat label="Pending Discharges" value="3" color={T.amber} />
            <Stat label="SNF Census" value="14" color={T.blue} />
            <Stat label="7-Day F/U Rate" value="73%" />
          </div>
          <SectionLabel>ADT event feed</SectionLabel>
          {adtEvents.map((e, i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 6, borderLeft: `3px solid ${typeColor[e.type]}`, display: "grid", gridTemplateColumns: "70px 80px 1.2fr 1fr 1fr", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: cd, fontSize: 11, color: T.muted }}>{e.time}</span>
              <Tag v={e.type === "ADMIT" ? "red" : e.type === "DISCHARGE" ? "amber" : "default"}>{e.type}</Tag>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{e.member}</span>
              <span style={{ fontSize: 12, color: T.sec }}>{e.facility} — {e.reason}</span>
              <span style={{ fontSize: 12, color: T.accentText }}>{e.action}</span>
            </div>
          ))}
        </>
      )}

      {tab === "outreach" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <Stat label="Active Campaigns" value="3" />
            <Stat label="Members Targeted" value="1,805" color={T.blue} />
            <Stat label="Gaps Closed MTD" value="216" color={T.accentText} />
            <Stat label="Avg. Conversion" value="11%" color={T.amber} />
          </div>
          <SectionLabel>Campaigns</SectionLabel>
          {campaigns.map((c, i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 6, opacity: c.status === "planned" ? 0.6 : 1, display: "grid", gridTemplateColumns: "1.5fr 0.5fr 0.5fr 0.8fr 80px", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{c.name}</div>
              </div>
              <span style={{ fontFamily: cd, fontSize: 12, color: T.sec }}>{c.target} target</span>
              <span style={{ fontFamily: cd, fontSize: 12, color: T.accentText }}>{c.completed} closed</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.border }}>
                  <div style={{ width: `${c.rate}%`, height: "100%", borderRadius: 2, background: c.rate > 10 ? T.accent : T.amber }} />
                </div>
                <span style={{ fontFamily: cd, fontSize: 10, color: T.muted }}>{c.rate}%</span>
              </div>
              <Tag v={c.status === "active" ? "green" : "default"}>{c.status}</Tag>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DATA INGESTION
// ═══════════════════════════════════════════════════════════════
function DataView() {
  const clients = [
    { name: "Sunstate Medical Group", lives: 4200, feeds: 6, completeness: 89, status: "active" },
    { name: "Gulf Coast Primary Care", lives: 2100, feeds: 3, completeness: 64, status: "active" },
    { name: "Bayside Physician Network", lives: 1650, feeds: 2, completeness: 28, status: "onboarding" },
  ];
  const formats = ["X12 834/837/835", "CSV / Excel", "FHIR / JSON", "HL7v2", "CCDA/CCD", "PDF (OCR)"];
  return (
    <div style={{ padding: "20px 28px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Data ingestion</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 20px" }}>Universal format intake · Auto-mapping · Feed management</p>

      {/* Upload zone */}
      <div style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", marginBottom: 24, background: T.alt }}>
        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📂</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>Drop files here or click to browse</div>
        <div style={{ fontSize: 12, color: T.muted }}>Accepts {formats.join(", ")}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Format auto-detected · Columns mapped automatically · Validation included</div>
      </div>

      <SectionLabel>Client data status</SectionLabel>
      {clients.map((c, i) => (
        <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 6, display: "grid", gridTemplateColumns: "1.5fr 0.5fr 0.5fr 0.8fr 80px", gap: 10, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{c.name}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{c.lives.toLocaleString()} lives · {c.feeds} active feeds</div>
          </div>
          <span style={{ fontFamily: cd, fontSize: 12, color: T.sec }}>{c.lives.toLocaleString()}</span>
          <span style={{ fontFamily: cd, fontSize: 12, color: T.sec }}>{c.feeds} feeds</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.border }}>
              <div style={{ width: `${c.completeness}%`, height: "100%", borderRadius: 3, background: c.completeness >= 80 ? T.accent : c.completeness >= 50 ? T.amber : T.red }} />
            </div>
            <span style={{ fontFamily: cd, fontSize: 10, color: T.muted }}>{c.completeness}%</span>
          </div>
          <Tag v={c.status === "active" ? "green" : "amber"}>{c.status}</Tag>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════
export default function Platform() {
  const [mod, setMod] = useState("schedule");
  const views = { schedule: ScheduleView, quality: QualityView, spend: SpendView, ops: OpsView, data: DataView };
  const V = views[mod];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: bd, color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr" }}>
        {/* Sidebar nav */}
        <nav style={{ background: T.surface, borderRight: `1px solid ${T.border}`, padding: "16px 0", height: "100vh", position: "sticky", top: 0 }}>
          <div style={{ padding: "0 16px 20px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>AQSoft Health</span>
          </div>

          <div style={{ padding: "0 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 8px 6px" }}>Platform</div>
            {MODULES.map(m => (
              <button key={m.id} onClick={() => setMod(m.id)} style={{
                width: "100%", textAlign: "left", background: mod === m.id ? T.alt : "transparent",
                border: "none", borderRadius: 6, padding: "8px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8, marginBottom: 2,
                color: mod === m.id ? T.text : T.sec, fontWeight: mod === m.id ? 600 : 400, fontSize: 13,
              }}>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}

            <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", padding: "16px 8px 6px" }}>Clinical</div>
            {["Encounter", "Coding", "Billing"].map(l => (
              <button key={l} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 6, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 13, marginBottom: 2 }}>
                <span style={{ fontSize: 12, opacity: 0.4 }}>→</span>{l}
              </button>
            ))}
          </div>

          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, padding: "0 16px" }}>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.alt, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: T.sec }}>CS</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Dr. Spergel</div>
                  <div style={{ fontSize: 10, color: T.muted }}>Sunrise SNF</div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main style={{ overflow: "auto", minHeight: "100vh" }}>
          <V />
        </main>
      </div>
    </div>
  );
}
