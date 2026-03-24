import { useState } from "react";

const C = {
  bg: "#09090b", surface: "#18181b", card: "#1c1c21", cardHover: "#242429",
  border: "#27272a", borderLight: "#3f3f46",
  text: "#fafafa", sub: "#a1a1aa", dim: "#71717a",
  g: "#22c55e", gM: "rgba(34,197,94,0.12)",
  b: "#3b82f6", bM: "rgba(59,130,246,0.12)",
  a: "#f59e0b", aM: "rgba(245,158,11,0.12)",
  r: "#ef4444", rM: "rgba(239,68,68,0.12)",
  p: "#a78bfa", pM: "rgba(167,139,250,0.1)",
  c: "#06b6d4", cM: "rgba(6,182,212,0.1)",
  pk: "#ec4899", pkM: "rgba(236,72,153,0.1)",
};
const mn = "'IBM Plex Mono','JetBrains Mono',monospace";
const sn = "'Outfit','Inter',system-ui,sans-serif";

const Badge = ({ children, color = C.g, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: mn, fontWeight: 600, color, background: bg || C.gM }}>{children}</span>
);
const Chip = ({ label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontFamily: mn, fontWeight: 700, color: C.p, background: C.pM }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.p }} />{label}
  </span>
);

const TABS = [
  { id: "care", label: "Care Management", icon: "♥" },
  { id: "attribution", label: "Attribution", icon: "◎" },
  { id: "toc", label: "Transitions", icon: "⇄" },
  { id: "outreach", label: "Outreach", icon: "📣" },
];

// ═══════════════════════════════════════════════════════════════
// CARE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
const RISK_TIERS = [
  { tier: "Complex", count: 84, color: C.r, pct: 3, desc: "3+ chronic HCCs, recent hospitalization, or catastrophic spend" },
  { tier: "High Risk", count: 312, color: C.a, pct: 11, desc: "2+ chronic conditions, rising utilization, or RAF > 2.0" },
  { tier: "Rising Risk", count: 587, color: C.b, pct: 21, desc: "1+ chronic condition with gaps, new diagnosis, or ER trend" },
  { tier: "Stable", count: 1864, color: C.g, pct: 65, desc: "Managed conditions, engaged with PCP, no acute events" },
];

const CARE_MEMBERS = [
  {
    name: "Margaret Chen", age: 72, tier: "Complex", raf: 2.31, pcp: "Dr. Rivera", program: "CHF + DM",
    lastContact: "3/18/2026", nextTask: "Post-SNF f/u call", taskDue: "3/25/2026", taskStatus: "due_soon",
    conditions: ["CHF (I50.22)", "DM2 (E11.65)", "CKD 3b (N18.32)", "COPD (J44.1)", "MDD (F33.1)"],
    recentEvents: [
      { date: "3/18", event: "SNF admission — Sunrise SNF", type: "admit" },
      { date: "3/12", event: "Hospital discharge — Memorial", type: "discharge" },
      { date: "3/08", event: "ED visit — CHF exacerbation", type: "ed" },
    ],
    openTasks: 3, completedTasks: 12, touchpoints30d: 8,
  },
  {
    name: "Robert Williams", age: 68, tier: "High Risk", raf: 1.68, pcp: "Dr. Patel", program: "Cardiac + Cancer",
    lastContact: "3/20/2026", nextTask: "Med adherence check", taskDue: "3/27/2026", taskStatus: "upcoming",
    conditions: ["AFib (I48.91)", "Prostate CA (C61)", "CHF suspected"],
    recentEvents: [
      { date: "3/20", event: "Cardiology f/u completed", type: "visit" },
      { date: "3/05", event: "INR 3.8 — Warfarin adjusted", type: "lab_alert" },
    ],
    openTasks: 2, completedTasks: 8, touchpoints30d: 5,
  },
  {
    name: "Dorothy Martinez", age: 81, tier: "Complex", raf: 2.79, pcp: "Dr. Rivera", program: "Multi-chronic",
    lastContact: "3/15/2026", nextTask: "Nephrology referral f/u", taskDue: "3/24/2026", taskStatus: "overdue",
    conditions: ["CHF (I50.32)", "DM2 (E11.65)", "AKI (N17.9)", "MDD (F33.1)"],
    recentEvents: [
      { date: "3/15", event: "Home health visit — wound care", type: "visit" },
      { date: "3/10", event: "Cr elevated 2.4 — nephrology referral", type: "lab_alert" },
    ],
    openTasks: 4, completedTasks: 15, touchpoints30d: 11,
  },
];

function CareManagementView() {
  const [selMember, setSelMember] = useState(0);
  const m = CARE_MEMBERS[selMember];
  const statusColor = { overdue: C.r, due_soon: C.a, upcoming: C.b, complete: C.g };
  const eventIcon = { admit: "🏥", discharge: "🏠", ed: "🚑", visit: "👨‍⚕️", lab_alert: "🧪", call: "📞" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", height: "calc(100vh - 100px)" }}>
      {/* Left: Member list */}
      <div style={{ borderRight: `1px solid ${C.border}`, overflow: "auto" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: mn, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Risk Stratification</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
            {RISK_TIERS.map((t, i) => (
              <div key={i} style={{ background: `${t.color}11`, borderRadius: 6, padding: "6px 8px", textAlign: "center", border: `1px solid ${t.color}22` }}>
                <div style={{ fontFamily: mn, fontSize: 16, fontWeight: 700, color: t.color }}>{t.count}</div>
                <div style={{ fontFamily: mn, fontSize: 8, color: C.dim, textTransform: "uppercase" }}>{t.tier}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: mn, fontSize: 10, color: C.dim, textTransform: "uppercase" }}>My Caseload</span>
          <Badge color={C.r} bg={C.rM}>1 OVERDUE</Badge>
        </div>

        {CARE_MEMBERS.map((cm, i) => (
          <div key={i} onClick={() => setSelMember(i)} style={{
            padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`,
            borderLeft: selMember === i ? `3px solid ${C.g}` : "3px solid transparent",
            background: selMember === i ? C.surface : "transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: sn, fontWeight: 600, fontSize: 13, color: C.text }}>{cm.name}</span>
              <Badge color={cm.tier === "Complex" ? C.r : C.a} bg={cm.tier === "Complex" ? C.rM : C.aM}>{cm.tier.toUpperCase()}</Badge>
            </div>
            <div style={{ fontFamily: mn, fontSize: 10, color: C.dim, marginTop: 3 }}>
              Age {cm.age} · RAF {cm.raf} · {cm.program}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontFamily: sn, fontSize: 11, color: statusColor[cm.taskStatus] }}>
                {cm.taskStatus === "overdue" ? "⚠ " : ""}{cm.nextTask}
              </span>
              <span style={{ fontFamily: mn, fontSize: 9, color: C.dim }}>{cm.taskDue}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right: Member detail */}
      <div style={{ overflow: "auto", padding: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ fontFamily: sn, fontWeight: 800, fontSize: 20, color: C.text, margin: 0 }}>{m.name}</h3>
              <Badge color={m.tier === "Complex" ? C.r : C.a} bg={m.tier === "Complex" ? C.rM : C.aM}>{m.tier}</Badge>
              <Badge color={C.b} bg={C.bM}>{m.program}</Badge>
            </div>
            <div style={{ fontFamily: mn, fontSize: 11, color: C.dim, marginTop: 4 }}>
              Age {m.age} · PCP: {m.pcp} · RAF: {m.raf} · Last contact: {m.lastContact}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: C.gM, color: C.g, border: `1px solid ${C.g}33`, borderRadius: 6, padding: "6px 14px", fontFamily: mn, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📞 Log Call</button>
            <button style={{ background: C.bM, color: C.b, border: `1px solid ${C.b}33`, borderRadius: 6, padding: "6px 14px", fontFamily: mn, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Add Task</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left column */}
          <div>
            {/* Conditions */}
            <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Active Conditions</div>
            <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, marginBottom: 14 }}>
              {m.conditions.map((c, i) => (
                <div key={i} style={{ fontFamily: mn, fontSize: 11, color: C.sub, padding: "3px 0", borderBottom: i < m.conditions.length - 1 ? `1px solid ${C.border}` : "none" }}>{c}</div>
              ))}
            </div>

            {/* AI Summary */}
            <div style={{ fontFamily: mn, fontSize: 10, color: C.p, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              AI Member Brief <Chip label="AUTO-GENERATED" />
            </div>
            <div style={{ background: C.pM, borderRadius: 8, border: `1px solid ${C.p}22`, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: sn, fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                {m.name} is a {m.age}yo {m.tier.toLowerCase()}-risk member with {m.conditions.length} active HCC conditions (RAF {m.raf}).
                {m.recentEvents.some(e => e.type === "admit") ? " Currently in SNF following recent hospitalization." : ""}
                {m.recentEvents.some(e => e.type === "lab_alert") ? " Recent lab alert requires follow-up." : ""}
                {" "}Care team has logged {m.touchpoints30d} touchpoints in the last 30 days. {m.openTasks} open tasks pending.
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {[
                { label: "Open Tasks", value: m.openTasks, color: m.openTasks > 3 ? C.r : C.a },
                { label: "Completed", value: m.completedTasks, color: C.g },
                { label: "Touchpoints/30d", value: m.touchpoints30d, color: C.b },
              ].map((k, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: mn, fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                  <div style={{ fontFamily: mn, fontSize: 8, color: C.dim, textTransform: "uppercase" }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div>
            {/* Timeline */}
            <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Recent Events & Activity</div>
            <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, marginBottom: 14 }}>
              {m.recentEvents.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < m.recentEvents.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 16 }}>{eventIcon[e.type]}</span>
                  <div>
                    <div style={{ fontFamily: sn, fontSize: 12, color: C.text }}>{e.event}</div>
                    <div style={{ fontFamily: mn, fontSize: 10, color: C.dim }}>{e.date}/2026</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Next task card */}
            <div style={{ fontFamily: mn, fontSize: 10, color: statusColor[m.taskStatus], textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {m.taskStatus === "overdue" ? "⚠ OVERDUE TASK" : "Next Task"}
            </div>
            <div style={{
              background: `${statusColor[m.taskStatus]}11`, borderRadius: 8,
              border: `1px solid ${statusColor[m.taskStatus]}33`, padding: 14,
              borderLeft: `3px solid ${statusColor[m.taskStatus]}`,
            }}>
              <div style={{ fontFamily: sn, fontWeight: 600, fontSize: 13, color: C.text }}>{m.nextTask}</div>
              <div style={{ fontFamily: mn, fontSize: 11, color: C.dim, marginTop: 4 }}>Due: {m.taskDue}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button style={{ background: C.gM, color: C.g, border: `1px solid ${C.g}33`, borderRadius: 5, padding: "5px 12px", fontFamily: mn, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>✓ Complete</button>
                <button style={{ background: C.surface, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 12px", fontFamily: mn, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Reschedule</button>
                <button style={{ background: C.surface, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 12px", fontFamily: mn, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Escalate</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MEMBER ATTRIBUTION
// ═══════════════════════════════════════════════════════════════
function AttributionView() {
  const plans = [
    { plan: "Humana Gold Plus", attributed: 1847, total: 1920, pct: 96.2, disputed: 12, unattributed: 61, churn: 23 },
    { plan: "Aetna MA", attributed: 1204, total: 1280, pct: 94.1, disputed: 8, unattributed: 68, churn: 31 },
    { plan: "UHC AARP", attributed: 892, total: 940, pct: 94.9, disputed: 5, unattributed: 43, churn: 18 },
    { plan: "Cigna Healthspring", attributed: 257, total: 280, pct: 91.8, disputed: 3, unattributed: 20, churn: 8 },
  ];

  const providers = [
    { name: "Dr. Rivera", panel: 612, capacity: 700, pct: 87, awvRate: 74, rafAvg: 1.48 },
    { name: "Dr. Patel", panel: 548, capacity: 600, pct: 91, awvRate: 68, rafAvg: 1.52 },
    { name: "Dr. Kim", panel: 489, capacity: 600, pct: 82, awvRate: 81, rafAvg: 1.41 },
    { name: "Dr. Brooks", panel: 423, capacity: 500, pct: 85, awvRate: 72, rafAvg: 1.55 },
    { name: "Dr. Okafor", panel: 387, capacity: 500, pct: 77, awvRate: 62, rafAvg: 1.38 },
  ];

  const alerts = [
    { type: "churn", text: "23 Humana members dis-enrolled in March — 8 moved to competitor PCP", color: C.r },
    { type: "unattr", text: "172 total unattributed members across all plans — potential panel growth opportunity", color: C.a },
    { type: "orphan", text: "89 members haven't seen any provider in 12+ months — outreach recommended", color: C.a },
    { type: "dispute", text: "28 attribution disputes pending resolution across 4 plans", color: C.b },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: sn, fontWeight: 800, fontSize: 22, color: C.text, margin: "0 0 4px" }}>Member Attribution</h2>
      <p style={{ fontFamily: sn, fontSize: 13, color: C.sub, margin: "0 0 20px" }}>Panel assignment tracking across all health plan contracts</p>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Attributed", value: "4,200", color: C.g },
          { label: "Attribution Rate", value: "94.7%", color: C.g },
          { label: "Unattributed", value: "172", color: C.a },
          { label: "Monthly Churn", value: "80", color: C.r },
          { label: "Pending Disputes", value: "28", color: C.b },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: mn, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontFamily: mn, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", marginBottom: 4, background: `${a.color}08`, borderRadius: 6, borderLeft: `3px solid ${a.color}` }}>
          <Chip label="AI" />
          <span style={{ fontFamily: sn, fontSize: 12, color: C.sub }}>{a.text}</span>
        </div>
      ))}

      {/* By plan */}
      <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", margin: "20px 0 8px" }}>By Health Plan</div>
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.5fr 0.5fr 0.5fr 0.5fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mn, color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Plan</span><span>Attributed</span><span>Total</span><span>Rate</span><span>Disputed</span><span>Unattr.</span><span>Churn/Mo</span>
        </div>
        {plans.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.5fr 0.5fr 0.5fr 0.5fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sn, fontWeight: 600, fontSize: 13, color: C.text }}>{p.plan}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: C.g }}>{p.attributed.toLocaleString()}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: C.sub }}>{p.total.toLocaleString()}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: p.pct >= 95 ? C.g : C.a }}>{p.pct}%</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: p.disputed > 0 ? C.b : C.dim }}>{p.disputed}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: p.unattributed > 50 ? C.a : C.dim }}>{p.unattributed}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: p.churn > 20 ? C.r : C.dim }}>{p.churn}</span>
          </div>
        ))}
      </div>

      {/* By provider */}
      <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Provider Panels</div>
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 0.5fr 0.8fr 0.5fr 0.5fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mn, color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Provider</span><span>Panel</span><span>Capacity</span><span>Utilization</span><span>AWV Rate</span><span>Avg RAF</span>
        </div>
        {providers.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 0.5fr 0.8fr 0.5fr 0.5fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sn, fontWeight: 600, fontSize: 13, color: C.text }}>{p.name}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: C.text }}>{p.panel}</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: C.dim }}>{p.capacity}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 60, height: 5, borderRadius: 3, background: C.border }}>
                <div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 3, background: p.pct > 90 ? C.r : p.pct > 80 ? C.a : C.g }} />
              </div>
              <span style={{ fontFamily: mn, fontSize: 10, color: C.sub }}>{p.pct}%</span>
            </div>
            <span style={{ fontFamily: mn, fontSize: 12, color: p.awvRate >= 75 ? C.g : C.a }}>{p.awvRate}%</span>
            <span style={{ fontFamily: mn, fontSize: 12, color: C.b }}>{p.rafAvg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRANSITIONS OF CARE
// ═══════════════════════════════════════════════════════════════
function TransitionsView() {
  const adtEvents = [
    { time: "2h ago", type: "ADMIT", member: "James Thornton", age: 78, facility: "Memorial Hospital", reason: "Hip fracture s/p fall", raf: 1.12, risk: "high", action: "SNF placement needed" },
    { time: "6h ago", type: "DISCHARGE", member: "Patricia Okafor", age: 84, facility: "St. Luke's Medical", reason: "Pneumonia resolved", raf: 1.89, risk: "high", action: "Home health ordered, 7-day f/u" },
    { time: "12h ago", type: "ED VISIT", member: "Gerald Foster", age: 71, facility: "Bayfront Health ED", reason: "Chest pain — r/o ACS", raf: 0.95, risk: "medium", action: "Monitoring — admitted to obs" },
    { time: "1d ago", type: "DISCHARGE", member: "Margaret Chen", age: 72, facility: "Memorial Hospital", reason: "CHF exacerbation", raf: 2.31, risk: "critical", action: "SNF admit — Sunrise SNF" },
    { time: "2d ago", type: "SNF ADMIT", member: "Margaret Chen", age: 72, facility: "Sunrise SNF", reason: "Post-acute rehab for CHF", raf: 2.31, risk: "critical", action: "SNF Admit Assist completed ✓" },
    { time: "3d ago", type: "ED VISIT", member: "Linda Vasquez", age: 66, facility: "Tampa General ED", reason: "Medication reaction — resolved", raf: 1.04, risk: "low", action: "PCP notification sent" },
  ];

  const typeColor = { "ADMIT": C.r, "DISCHARGE": C.a, "ED VISIT": C.pk, "SNF ADMIT": C.b };
  const typeIcon = { "ADMIT": "🏥", "DISCHARGE": "🏠", "ED VISIT": "🚑", "SNF ADMIT": "🏥" };

  const metrics = [
    { label: "Active Inpatients", value: "8", color: C.r },
    { label: "Pending Discharges", value: "3", color: C.a },
    { label: "SNF Census", value: "14", color: C.b },
    { label: "7-Day F/U Rate", value: "73%", color: C.g },
    { label: "30-Day Readmit", value: "12.4%", color: C.a },
  ];

  const checklist = [
    { item: "Med reconciliation completed", status: true },
    { item: "Follow-up appt within 7 days", status: true },
    { item: "PCP notification sent", status: true },
    { item: "Care manager assigned", status: true },
    { item: "SNF Admit Assist note generated", status: true },
    { item: "HCC sweep completed at transition", status: false },
    { item: "Home health / DME ordered", status: false },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sn, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>Transitions of Care</h2>
          <p style={{ fontFamily: sn, fontSize: 13, color: C.sub, margin: "4px 0 0" }}>Real-time ADT monitoring + discharge coordination</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.r} bg={C.rM}>2 NEW ADMITS</Badge>
          <Badge color={C.a} bg={C.aM}>3 PENDING DC</Badge>
          <Chip label="ADT LIVE FEED" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", borderTop: `2px solid ${m.color}` }}>
            <div style={{ fontFamily: mn, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{m.label}</div>
            <div style={{ fontFamily: mn, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* ADT feed */}
        <div>
          <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>ADT Event Feed</div>
          {adtEvents.map((e, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 14, marginBottom: 6, borderLeft: `3px solid ${typeColor[e.type]}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{typeIcon[e.type]}</span>
                  <Badge color={typeColor[e.type]} bg={`${typeColor[e.type]}22`}>{e.type}</Badge>
                  <span style={{ fontFamily: sn, fontWeight: 600, fontSize: 13, color: C.text }}>{e.member}</span>
                  <span style={{ fontFamily: mn, fontSize: 10, color: C.dim }}>Age {e.age}</span>
                </div>
                <span style={{ fontFamily: mn, fontSize: 10, color: C.dim }}>{e.time}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                <div><span style={{ fontFamily: mn, color: C.dim }}>Facility: </span><span style={{ fontFamily: sn, color: C.sub }}>{e.facility}</span></div>
                <div><span style={{ fontFamily: mn, color: C.dim }}>Reason: </span><span style={{ fontFamily: sn, color: C.sub }}>{e.reason}</span></div>
                <div><span style={{ fontFamily: mn, color: C.dim }}>Action: </span><span style={{ fontFamily: sn, color: C.g }}>{e.action}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Discharge checklist */}
        <div>
          <div style={{ fontFamily: mn, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Discharge Checklist Template</div>
          <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
            {checklist.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < checklist.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: 14, color: c.status ? C.g : C.dim }}>{c.status ? "☑" : "☐"}</span>
                <span style={{ fontFamily: sn, fontSize: 12, color: c.status ? C.sub : C.dim, textDecoration: c.status ? "none" : "none" }}>{c.item}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, padding: "8px 10px", background: C.aM, borderRadius: 6, border: `1px solid ${C.a}22` }}>
              <span style={{ fontFamily: mn, fontSize: 10, color: C.a, fontWeight: 600 }}>5/7 complete — 2 items pending</span>
            </div>
          </div>

          <div style={{ marginTop: 14, fontFamily: mn, fontSize: 10, color: C.p, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            SNF Admit Assist <Chip label="INTEGRATED" />
          </div>
          <div style={{ background: C.pM, borderRadius: 8, border: `1px solid ${C.p}22`, padding: 14 }}>
            <div style={{ fontFamily: sn, fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
              When a member transitions to SNF, the platform automatically triggers SNF Admit Assist to generate the admission H&P from hospital records, run AutoCoder for HCC capture, and pre-populate the chart.
            </div>
            <button style={{ marginTop: 8, background: C.p, color: "#000", border: "none", borderRadius: 6, padding: "6px 14px", fontFamily: mn, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Launch SNF Admit Assist →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OUTREACH CAMPAIGNS
// ═══════════════════════════════════════════════════════════════
function OutreachView() {
  const campaigns = [
    { name: "Diabetic Eye Exam Gap Closure", measure: "CDC-Eye", target: 353, contacted: 198, scheduled: 87, completed: 42, status: "active", channel: "Phone + SMS", startDate: "03/01/2026", priority: "critical" },
    { name: "Kidney Health Eval (KED)", measure: "CDC-KED", target: 498, contacted: 124, scheduled: 45, completed: 18, status: "active", channel: "Phone", startDate: "03/10/2026", priority: "critical" },
    { name: "AWV / RAF Recapture Sprint", measure: "AWV", target: 954, contacted: 412, scheduled: 203, completed: 156, status: "active", channel: "Phone + Mail + SMS", startDate: "01/15/2026", priority: "high" },
    { name: "Blood Pressure Control", measure: "CBP", target: 587, contacted: 342, scheduled: 178, completed: 112, status: "active", channel: "Phone + Portal", startDate: "02/01/2026", priority: "high" },
    { name: "Medication Adherence (PDC)", measure: "Part D", target: 687, contacted: 0, scheduled: 0, completed: 0, status: "planned", channel: "Pharmacist calls", startDate: "04/01/2026", priority: "high" },
    { name: "Depression Screening (PHQ-9)", measure: "HEDIS", target: 512, contacted: 0, scheduled: 0, completed: 0, status: "planned", channel: "Phone", startDate: "04/15/2026", priority: "medium" },
  ];

  const priColor = { critical: C.r, high: C.a, medium: C.b };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: sn, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>Outreach Campaigns</h2>
          <p style={{ fontFamily: sn, fontSize: 13, color: C.sub, margin: "4px 0 0" }}>Gap closure campaigns — from analytics to action</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ background: C.g, color: "#000", border: "none", borderRadius: 8, padding: "8px 18px", fontFamily: sn, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ New Campaign</button>
          <Chip label="AI LISTS" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Active Campaigns", value: "4", color: C.g },
          { label: "Members Targeted", value: "2,392", color: C.b },
          { label: "Gaps Closed MTD", value: "328", color: C.g },
          { label: "Scheduling Rate", value: "38%", color: C.a },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: mn, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontFamily: mn, fontSize: 22, fontWeight: 700, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {campaigns.map((c, i) => {
        const funnel = [
          { label: "Target", value: c.target, color: C.sub },
          { label: "Contacted", value: c.contacted, color: C.b },
          { label: "Scheduled", value: c.scheduled, color: C.a },
          { label: "Completed", value: c.completed, color: C.g },
        ];
        const completionRate = c.target > 0 ? Math.round((c.completed / c.target) * 100) : 0;

        return (
          <div key={i} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 16, marginBottom: 10,
            borderLeft: `3px solid ${priColor[c.priority]}`,
            opacity: c.status === "planned" ? 0.65 : 1,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: sn, fontWeight: 700, fontSize: 14, color: C.text }}>{c.name}</span>
                <Badge color={priColor[c.priority]} bg={`${priColor[c.priority]}22`}>{c.priority.toUpperCase()}</Badge>
                <Badge color={C.b} bg={C.bM}>{c.measure}</Badge>
                <Badge color={c.status === "active" ? C.g : C.dim} bg={c.status === "active" ? C.gM : C.surface}>{c.status.toUpperCase()}</Badge>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: mn, fontSize: 10, color: C.dim }}>{c.channel}</span>
                <span style={{ fontFamily: mn, fontSize: 10, color: C.dim }}>Started: {c.startDate}</span>
              </div>
            </div>

            {/* Funnel visualization */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {funnel.map((f, j) => (
                <div key={j} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: mn, fontSize: 20, fontWeight: 700, color: f.color }}>{f.value.toLocaleString()}</div>
                  <div style={{ fontFamily: mn, fontSize: 9, color: C.dim, textTransform: "uppercase" }}>{f.label}</div>
                  {j < 3 && (
                    <div style={{ fontFamily: mn, fontSize: 9, color: C.dim, marginTop: 2 }}>
                      {funnel[j + 1].value > 0 ? `${Math.round((funnel[j + 1].value / f.value) * 100)}% →` : "—"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border }}>
                <div style={{ width: `${completionRate}%`, height: "100%", borderRadius: 3, background: completionRate >= 50 ? C.g : completionRate >= 25 ? C.a : C.b, transition: "width 0.6s ease" }} />
              </div>
              <span style={{ fontFamily: mn, fontSize: 11, fontWeight: 600, color: C.sub, minWidth: 40 }}>{completionRate}%</span>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 16, padding: "14px 18px", background: C.pM, borderRadius: 8, border: `1px solid ${C.p}22` }}>
        <Chip label="AI OPTIMIZER" />
        <span style={{ fontFamily: sn, fontSize: 12, color: C.p, fontWeight: 600, marginLeft: 8 }}>
          Based on response patterns, SMS outreach has 2.3× higher scheduling rate than phone for members under 70.
        </span>
        <span style={{ fontFamily: sn, fontSize: 12, color: C.sub, marginLeft: 4 }}>
          Recommendation: shift KED campaign to SMS-first for younger cohort. Projected +18% scheduling rate.
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
export default function OperationsModules() {
  const [tab, setTab] = useState("care");
  const views = { care: CareManagementView, attribution: AttributionView, toc: TransitionsView, outreach: OutreachView };
  const View = views[tab];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: sn }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(9,9,11,0.95)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.g}, ${C.b})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: mn, color: "#000" }}>A</div>
          <span style={{ fontFamily: mn, fontWeight: 700, fontSize: 14 }}>AQSoft<span style={{ color: C.g }}>.AI</span></span>
          <span style={{ fontFamily: mn, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>Operations</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? C.surface : "transparent",
              border: tab === t.id ? `1px solid ${C.borderLight}` : "1px solid transparent",
              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
              fontFamily: mn, fontSize: 11, fontWeight: 600,
              color: tab === t.id ? C.g : C.sub, display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <Badge>Sunstate Medical Group</Badge>
      </header>

      <View />

      <footer style={{ padding: "8px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontFamily: mn, fontSize: 9, color: C.dim }}>
        <span>AQSoft.AI Operations Suite · Integrated with Clinical Workflow + Analytics</span>
        <span>4,200 attributed lives · 84 complex cases · 6 active campaigns</span>
      </footer>
    </div>
  );
}
