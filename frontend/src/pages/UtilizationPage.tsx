import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FacilityCensus {
  facility: string;
  count: number;
  inpatient: number;
  observation: number;
  snf: number;
  er: number;
}

interface ALOSByFacility {
  facility: string;
  alos: number;
  benchmark: number;
  variance: number;
  admits: number;
}

interface ALOSByDiagnosis {
  drg: string;
  diagnosis: string;
  alos: number;
  benchmark: number;
  cases: number;
}

interface FollowUpItem {
  member_id: string;
  name: string;
  discharged: string;
  facility: string;
  diagnosis: string;
  pcp: string;
  days_since_discharge: number;
  urgency: string;
  follow_up_due: string;
}

interface CalendarDay {
  date: string;
  total: number;
  inpatient: number;
  observation: number;
  er: number;
  snf: number;
}

interface PatternData {
  time_of_day: { period: string; count: number; pct: number }[];
  day_of_week: { day: string; count: number; pct: number }[];
  weekend_vs_weekday: { weekday_avg: number; weekend_avg: number; weekend_pct: number };
  after_hours_er_rate: number;
  seasonal_trends: { month: string; admits: number }[];
  heatmap: number[][];
}

interface FacilityComparison {
  facility: string;
  type: string;
  admits_90d: number;
  alos: number;
  cost_per_admit: number;
  readmit_rate: number;
  hcc_capture_rate: number;
  er_conversion_rate: number;
}

interface DashboardData {
  current_census: {
    total_admitted: number;
    by_class: Record<string, number>;
    by_facility: FacilityCensus[];
  };
  recent_activity: Record<string, number>;
  alos_by_facility: ALOSByFacility[];
  alos_by_diagnosis: ALOSByDiagnosis[];
  follow_up_needed: FollowUpItem[];
  obs_vs_inpatient: any[];
  er_snapshot: {
    current_er_visits: number;
    after_hours_pct: number;
    weekend_pct: number;
  };
  facility_comparison: FacilityComparison[];
}

type ActiveTab = "overview" | "facilities" | "calendar" | "patterns";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const URGENCY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

function shortFacility(name: string): string {
  if (name.length > 20) return name.slice(0, 18) + "...";
  return name;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UtilizationPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [patterns, setPatterns] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(2); // 0=Jan, 1=Feb, 2=Mar

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/utilization/dashboard"),
      api.get("/api/utilization/calendar?months=3"),
      api.get("/api/utilization/patterns"),
    ])
      .then(([dashRes, calRes, patRes]) => {
        setDashboard(dashRes.data);
        setCalendar(calRes.data);
        setPatterns(patRes.data);
      })
      .catch((err) => console.error("Failed to load utilization data:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !dashboard) {
    return (
      <div className="px-7 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-slate-200" />
          <div className="grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { current_census, recent_activity, alos_by_facility, alos_by_diagnosis, follow_up_needed, facility_comparison, er_snapshot } = dashboard;

  // Calendar helpers
  const MONTH_NAMES = ["January", "February", "March"];
  const calendarDays = calendar.filter((d) => {
    const m = new Date(d.date).getMonth();
    return m === calendarMonth;
  });
  const maxAdmits = Math.max(...calendar.map((d) => d.total), 1);

  const selectedDayData = selectedDay ? calendar.find((d) => d.date === selectedDay) : null;

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "overview", label: "Command Center" },
    { key: "facilities", label: "Facility Intelligence" },
    { key: "calendar", label: "Admission Calendar" },
    { key: "patterns", label: "Patterns & Trends" },
  ];

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Utilization Command Center
          </h1>
          <p className="text-sm mt-0.5" style={{ color: tokens.textMuted }}>
            Real-time operational dashboard across all facilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#22c55e" }} />
          <span className="text-xs" style={{ color: tokens.textMuted }}>Live</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: tokens.surfaceAlt }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2 text-sm font-medium rounded-md transition-all"
            style={{
              background: activeTab === t.key ? "#fff" : "transparent",
              color: activeTab === t.key ? tokens.accent : tokens.textMuted,
              boxShadow: activeTab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* OVERVIEW TAB */}
      {/* ============================================================ */}
      {activeTab === "overview" && (
        <>
          {/* Top metric cards */}
          <div className="grid grid-cols-6 gap-4 mb-6">
            <MetricCard label="Currently Admitted" value={String(current_census.total_admitted)} trend={`${recent_activity.admits_24h} new today`} trendDirection="up" />
            <MetricCard label="In ER Now" value={String(er_snapshot.current_er_visits)} trend={`${er_snapshot.after_hours_pct}% after-hours`} trendDirection="flat" />
            <MetricCard label="In SNF" value={String(current_census.by_class.snf || 0)} />
            <MetricCard label="New Today" value={String(recent_activity.admits_24h)} trend={`${recent_activity.admits_7d} this week`} trendDirection="up" />
            <MetricCard label="Discharged Today" value={String(recent_activity.discharges_1d)} trend={`${recent_activity.discharges_7d} this week`} trendDirection="flat" />
            <MetricCard label="Need Follow-up" value={String(follow_up_needed.length)} trend="within 7 days" trendDirection={follow_up_needed.length > 0 ? "down" : "flat"} />
          </div>

          {/* Facility census cards */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Census by Facility</h2>
            <div className="grid grid-cols-5 gap-3">
              {current_census.by_facility.map((f) => (
                <div key={f.facility} className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
                  <div className="text-xs font-medium mb-2 truncate" style={{ color: tokens.textMuted }} title={f.facility}>
                    {shortFacility(f.facility)}
                  </div>
                  <div className="text-2xl font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>{f.count}</div>
                  <div className="flex gap-2 mt-2 text-xs" style={{ color: tokens.textMuted }}>
                    {f.inpatient > 0 && <span>IP: {f.inpatient}</span>}
                    {f.observation > 0 && <span>Obs: {f.observation}</span>}
                    {f.snf > 0 && <span>SNF: {f.snf}</span>}
                    {f.er > 0 && <span>ER: {f.er}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ALOS tables */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* ALOS by Facility */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>ALOS by Facility</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: tokens.textMuted }}>
                    <th className="text-left font-medium pb-2">Facility</th>
                    <th className="text-right font-medium pb-2">ALOS</th>
                    <th className="text-right font-medium pb-2">Benchmark</th>
                    <th className="text-right font-medium pb-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {alos_by_facility.map((f) => (
                    <tr key={f.facility} className="border-t" style={{ borderColor: tokens.border }}>
                      <td className="py-2 truncate max-w-[180px]" title={f.facility} style={{ color: tokens.text }}>{shortFacility(f.facility)}</td>
                      <td className="py-2 text-right font-mono" style={{ color: tokens.text }}>{f.alos.toFixed(1)}d</td>
                      <td className="py-2 text-right font-mono" style={{ color: tokens.textMuted }}>{f.benchmark.toFixed(1)}d</td>
                      <td className="py-2 text-right font-mono font-medium" style={{ color: f.variance > 0 ? "#ef4444" : "#22c55e" }}>
                        {f.variance > 0 ? "+" : ""}{f.variance.toFixed(1)}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ALOS by Diagnosis */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>ALOS by Diagnosis</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: tokens.textMuted }}>
                    <th className="text-left font-medium pb-2">Diagnosis</th>
                    <th className="text-right font-medium pb-2">ALOS</th>
                    <th className="text-right font-medium pb-2">Benchmark</th>
                    <th className="text-right font-medium pb-2">Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {alos_by_diagnosis.map((d) => (
                    <tr key={d.drg} className="border-t" style={{ borderColor: tokens.border }}>
                      <td className="py-2" style={{ color: tokens.text }}>
                        <div className="text-xs" style={{ color: tokens.textMuted }}>{d.drg}</div>
                        {d.diagnosis}
                      </td>
                      <td className="py-2 text-right font-mono" style={{ color: tokens.text }}>{d.alos.toFixed(1)}d</td>
                      <td className="py-2 text-right font-mono" style={{ color: tokens.textMuted }}>{d.benchmark.toFixed(1)}d</td>
                      <td className="py-2 text-right font-mono" style={{ color: tokens.text }}>{d.cases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Follow-up needed */}
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>
              Discharged Members Needing Follow-up
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "#fef2f2", color: "#ef4444" }}>
                {follow_up_needed.length}
              </span>
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: tokens.textMuted }}>
                  <th className="text-left font-medium pb-2">Member</th>
                  <th className="text-left font-medium pb-2">Discharged</th>
                  <th className="text-left font-medium pb-2">Facility</th>
                  <th className="text-left font-medium pb-2">Diagnosis</th>
                  <th className="text-left font-medium pb-2">PCP</th>
                  <th className="text-left font-medium pb-2">Follow-up Due</th>
                  <th className="text-left font-medium pb-2">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {follow_up_needed.map((m) => (
                  <tr key={m.member_id} className="border-t" style={{ borderColor: tokens.border }}>
                    <td className="py-2 font-medium" style={{ color: tokens.accent }}>{m.name}</td>
                    <td className="py-2" style={{ color: tokens.text }}>{m.discharged} ({m.days_since_discharge}d ago)</td>
                    <td className="py-2 truncate max-w-[160px]" title={m.facility} style={{ color: tokens.text }}>{shortFacility(m.facility)}</td>
                    <td className="py-2" style={{ color: tokens.text }}>{m.diagnosis}</td>
                    <td className="py-2" style={{ color: tokens.text }}>{m.pcp}</td>
                    <td className="py-2 font-mono text-xs" style={{ color: tokens.text }}>{m.follow_up_due}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: URGENCY_COLORS[m.urgency] + "18", color: URGENCY_COLORS[m.urgency] }}>
                        {m.urgency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* FACILITIES TAB */}
      {/* ============================================================ */}
      {activeTab === "facilities" && (
        <>
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Facility Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: tokens.textMuted }}>
                    <th className="text-left font-medium pb-2">Facility</th>
                    <th className="text-left font-medium pb-2">Type</th>
                    <th className="text-right font-medium pb-2">Admits (90d)</th>
                    <th className="text-right font-medium pb-2">ALOS</th>
                    <th className="text-right font-medium pb-2">Cost/Admit</th>
                    <th className="text-right font-medium pb-2">Readmit %</th>
                    <th className="text-right font-medium pb-2">HCC Capture</th>
                    <th className="text-right font-medium pb-2">ER Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {facility_comparison.map((f) => (
                    <tr key={f.facility} className="border-t" style={{ borderColor: tokens.border }}>
                      <td className="py-2.5 font-medium" style={{ color: tokens.text }}>{f.facility}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{
                          background: f.type === "acute" ? "#dbeafe" : f.type === "snf" ? "#fef3c7" : "#dcfce7",
                          color: f.type === "acute" ? "#1d4ed8" : f.type === "snf" ? "#92400e" : "#166534",
                        }}>
                          {f.type === "acute" ? "Acute" : f.type === "snf" ? "SNF" : "Standalone ER"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{f.admits_90d}</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{f.alos.toFixed(1)}d</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{fmt(f.cost_per_admit)}</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: f.readmit_rate > 10 ? "#ef4444" : tokens.text }}>{f.readmit_rate.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: f.hcc_capture_rate < 50 ? "#f59e0b" : tokens.text }}>{f.hcc_capture_rate.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: tokens.text }}>{f.er_conversion_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Obs vs Inpatient */}
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Observation vs Inpatient Conversion</h3>
            <div className="grid grid-cols-3 gap-4">
              {dashboard.obs_vs_inpatient.map((f: any) => (
                <div key={f.facility} className="rounded-lg border p-3" style={{ borderColor: tokens.border }}>
                  <div className="text-xs font-medium mb-2 truncate" style={{ color: tokens.textMuted }} title={f.facility}>
                    {shortFacility(f.facility)}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-lg font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>{f.conversion_rate}%</span>
                    <span className="text-xs" style={{ color: tokens.textMuted }}>obs-to-IP conversion</span>
                  </div>
                  <div className="flex gap-4 text-xs" style={{ color: tokens.textMuted }}>
                    <span>Obs: {f.obs_count} (ALOS {f.obs_alos}d)</span>
                    <span>IP: {f.inpatient_count} (ALOS {f.inpatient_alos}d)</span>
                  </div>
                  {/* Mini bar */}
                  <div className="mt-2 flex h-2 rounded-full overflow-hidden" style={{ background: tokens.border }}>
                    <div style={{ width: `${(f.obs_count / (f.obs_count + f.inpatient_count)) * 100}%`, background: "#60a5fa" }} />
                    <div style={{ width: `${(f.inpatient_count / (f.obs_count + f.inpatient_count)) * 100}%`, background: "#2563eb" }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: tokens.textMuted }}>
                    <span>Obs</span>
                    <span>Inpatient</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ER Snapshot */}
          <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>ER Snapshot</h3>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="text-center p-3 rounded-lg" style={{ background: tokens.surfaceAlt }}>
                <div className="text-2xl font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>{er_snapshot.current_er_visits}</div>
                <div className="text-xs" style={{ color: tokens.textMuted }}>Currently in ER</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: tokens.surfaceAlt }}>
                <div className="text-2xl font-bold" style={{ fontFamily: fonts.code, color: "#f59e0b" }}>{er_snapshot.after_hours_pct}%</div>
                <div className="text-xs" style={{ color: tokens.textMuted }}>After-Hours Visits</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: tokens.surfaceAlt }}>
                <div className="text-2xl font-bold" style={{ fontFamily: fonts.code, color: "#8b5cf6" }}>{er_snapshot.weekend_pct}%</div>
                <div className="text-xs" style={{ color: tokens.textMuted }}>Weekend Visits</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* CALENDAR TAB */}
      {/* ============================================================ */}
      {activeTab === "calendar" && (
        <>
          {/* Month selector */}
          <div className="flex items-center gap-3 mb-4">
            {MONTH_NAMES.map((m, i) => (
              <button
                key={m}
                onClick={() => { setCalendarMonth(i); setSelectedDay(null); }}
                className="px-4 py-1.5 rounded-md text-sm font-medium"
                style={{
                  background: calendarMonth === i ? tokens.accent : "transparent",
                  color: calendarMonth === i ? "#fff" : tokens.textMuted,
                }}
              >
                {m} 2026
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Calendar grid */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-xs text-center font-medium py-1" style={{ color: tokens.textMuted }}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const firstDay = new Date(2026, calendarMonth, 1).getDay();
                  const blanks = Array.from({ length: firstDay }, (_, i) => (
                    <div key={`blank-${i}`} />
                  ));
                  const days = calendarDays.map((d) => {
                    const dayNum = new Date(d.date).getDate();
                    const intensity = Math.min(d.total / maxAdmits, 1);
                    const isSelected = d.date === selectedDay;
                    return (
                      <button
                        key={d.date}
                        onClick={() => setSelectedDay(d.date)}
                        className="relative flex flex-col items-center justify-center rounded-md p-1.5 transition-all"
                        style={{
                          background: isSelected ? tokens.accent : `rgba(37, 99, 235, ${intensity * 0.3})`,
                          color: isSelected ? "#fff" : tokens.text,
                          minHeight: 44,
                          border: isSelected ? `2px solid ${tokens.accent}` : "1px solid transparent",
                        }}
                      >
                        <span className="text-xs font-medium">{dayNum}</span>
                        <span className="text-[10px] font-bold" style={{ fontFamily: fonts.code }}>
                          {d.total}
                        </span>
                      </button>
                    );
                  });
                  return [...blanks, ...days];
                })()}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: tokens.textMuted }}>
                <span>Low</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.2, 0.3, 0.5, 0.7].map((v) => (
                    <div key={v} className="w-4 h-3 rounded-sm" style={{ background: `rgba(37, 99, 235, ${v})` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>

            {/* Day detail */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              {selectedDayData ? (
                <>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>
                    {new Date(selectedDayData.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-xs" style={{ color: tokens.textMuted }}>Total Admissions</div>
                      <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>{selectedDayData.total}</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-xs" style={{ color: tokens.textMuted }}>Inpatient</div>
                      <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: "#2563eb" }}>{selectedDayData.inpatient}</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-xs" style={{ color: tokens.textMuted }}>ER Visits</div>
                      <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: "#ef4444" }}>{selectedDayData.er}</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: tokens.surfaceAlt }}>
                      <div className="text-xs" style={{ color: tokens.textMuted }}>Observation</div>
                      <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: "#f59e0b" }}>{selectedDayData.observation}</div>
                    </div>
                  </div>
                  {/* Type breakdown bar */}
                  <div className="h-4 rounded-full overflow-hidden flex" style={{ background: tokens.border }}>
                    <div style={{ width: `${(selectedDayData.inpatient / selectedDayData.total) * 100}%`, background: "#2563eb" }} title="Inpatient" />
                    <div style={{ width: `${(selectedDayData.observation / selectedDayData.total) * 100}%`, background: "#f59e0b" }} title="Observation" />
                    <div style={{ width: `${(selectedDayData.er / selectedDayData.total) * 100}%`, background: "#ef4444" }} title="ER" />
                    <div style={{ width: `${(selectedDayData.snf / selectedDayData.total) * 100}%`, background: "#8b5cf6" }} title="SNF" />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: tokens.textMuted }}>
                    <span style={{ color: "#2563eb" }}>IP</span>
                    <span style={{ color: "#f59e0b" }}>Obs</span>
                    <span style={{ color: "#ef4444" }}>ER</span>
                    <span style={{ color: "#8b5cf6" }}>SNF</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-sm" style={{ color: tokens.textMuted }}>
                  Click a day to see details
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* PATTERNS TAB */}
      {/* ============================================================ */}
      {activeTab === "patterns" && patterns && (
        <>
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Time of Day */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Admission by Time of Day</h3>
              {patterns.time_of_day.map((t) => (
                <div key={t.period} className="flex items-center gap-3 mb-2">
                  <div className="w-40 text-xs truncate" style={{ color: tokens.textMuted }}>{t.period}</div>
                  <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: tokens.surfaceAlt }}>
                    <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: tokens.accent }} />
                  </div>
                  <div className="w-10 text-right text-xs font-mono" style={{ color: tokens.text }}>{t.pct}%</div>
                </div>
              ))}
            </div>

            {/* Day of Week */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Admission by Day of Week</h3>
              <div className="flex items-end gap-2 h-32">
                {patterns.day_of_week.map((d) => {
                  const maxCount = Math.max(...patterns.day_of_week.map((x) => x.count));
                  const height = (d.count / maxCount) * 100;
                  const isWeekend = d.day === "Saturday" || d.day === "Sunday";
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center">
                      <div className="text-xs font-mono mb-1" style={{ color: tokens.text }}>{d.count}</div>
                      <div className="w-full rounded-t" style={{ height: `${height}%`, background: isWeekend ? "#f59e0b" : tokens.accent }} />
                      <div className="text-[10px] mt-1" style={{ color: tokens.textMuted }}>{d.day.slice(0, 3)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: tokens.textMuted }}>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: tokens.accent }} /> Weekday
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> Weekend
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* Weekend vs Weekday */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Weekend vs Weekday</h3>
              <div className="flex items-center gap-4">
                <div className="text-center flex-1">
                  <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: tokens.accent }}>{patterns.weekend_vs_weekday.weekday_avg}</div>
                  <div className="text-xs" style={{ color: tokens.textMuted }}>Weekday Avg</div>
                </div>
                <div className="text-lg" style={{ color: tokens.textMuted }}>vs</div>
                <div className="text-center flex-1">
                  <div className="text-xl font-bold" style={{ fontFamily: fonts.code, color: "#f59e0b" }}>{patterns.weekend_vs_weekday.weekend_avg}</div>
                  <div className="text-xs" style={{ color: tokens.textMuted }}>Weekend Avg</div>
                </div>
              </div>
              <div className="text-center mt-2 text-xs" style={{ color: tokens.textMuted }}>
                {patterns.weekend_vs_weekday.weekend_pct}% of all admissions on weekends
              </div>
            </div>

            {/* After-Hours ER */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>After-Hours ER Rate</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <path
                      d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={tokens.border}
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      strokeDasharray={`${patterns.after_hours_er_rate}, 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold" style={{ fontFamily: fonts.code, color: tokens.text }}>{patterns.after_hours_er_rate}%</span>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs mt-2" style={{ color: tokens.textMuted }}>
                ER visits occurring after 6pm
              </div>
            </div>

            {/* Seasonal Trend */}
            <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Seasonal Trend</h3>
              <div className="flex items-end gap-1 h-20">
                {patterns.seasonal_trends.map((s) => {
                  const maxAdm = Math.max(...patterns.seasonal_trends.map((x) => x.admits));
                  const height = (s.admits / maxAdm) * 100;
                  return (
                    <div key={s.month} className="flex-1 flex flex-col items-center">
                      <div className="w-full rounded-t" style={{ height: `${height}%`, background: s.admits > 48 ? "#ef4444" : tokens.accent }} />
                      <div className="text-[9px] mt-1" style={{ color: tokens.textMuted }}>{s.month}</div>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs mt-2" style={{ color: tokens.textMuted }}>
                Peak months: Dec, Jan (flu season)
              </div>
            </div>
          </div>

          {/* Heatmap */}
          <div className="rounded-lg border p-4" style={{ borderColor: tokens.border, background: "#fff" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text }}>Admission Heatmap (Hour x Day)</h3>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="w-16 text-left font-medium py-1" style={{ color: tokens.textMuted }}>Hour</th>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <th key={d} className="w-12 text-center font-medium py-1" style={{ color: tokens.textMuted }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((hour) => (
                    <tr key={hour}>
                      <td className="py-0.5 font-mono" style={{ color: tokens.textMuted }}>
                        {hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`}
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const cell = patterns.heatmap.find((h) => h[0] === hour && h[1] === day);
                        const val = cell ? cell[2] : 0;
                        const maxVal = 7;
                        const intensity = Math.min(val / maxVal, 1);
                        return (
                          <td key={day} className="py-0.5">
                            <div
                              className="w-10 h-6 rounded flex items-center justify-center text-[10px] font-mono mx-auto"
                              style={{
                                background: val > 0 ? `rgba(37, 99, 235, ${intensity * 0.7 + 0.1})` : tokens.surfaceAlt,
                                color: intensity > 0.5 ? "#fff" : tokens.text,
                              }}
                            >
                              {val}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
