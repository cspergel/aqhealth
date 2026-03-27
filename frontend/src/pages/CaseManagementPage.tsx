import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaseNote {
  id: number;
  note_type: string;
  content: string;
  contact_method: string | null;
  duration_minutes: number | null;
  author_id: number;
  author_name: string;
  created_at: string | null;
}

interface CaseAssignment {
  id: number;
  member_id: number;
  care_manager_id: number;
  care_manager_name: string;
  assignment_date: string;
  end_date: string | null;
  reason: string | null;
  status: string;
  priority: string;
  last_contact_date: string | null;
  next_contact_date: string | null;
  contact_count: number;
  notes: string | null;
}

interface CaseDetail extends CaseAssignment {
  case_notes: CaseNote[];
}

interface Dashboard {
  total_active: number;
  by_manager: { care_manager_id: number; care_manager_name: string; case_count: number }[];
  by_priority: Record<string, number>;
  overdue_contacts: number;
}

interface Workload {
  care_manager_id: number;
  care_manager_name: string;
  total_cases: number;
  high_priority: number;
  overdue_contacts: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: tokens.redSoft, text: tokens.red },
  medium: { bg: tokens.amberSoft, text: tokens.amber },
  low: { bg: tokens.accentSoft, text: tokens.accentText },
};

const REASON_LABELS: Record<string, string> = {
  high_risk: "High Risk",
  post_discharge: "Post-Discharge",
  chronic_disease: "Chronic Disease",
  complex_case: "Complex Case",
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  phone_call: "Phone Call",
  in_person: "In-Person",
  coordination: "Coordination",
  assessment: "Assessment",
  follow_up: "Follow-Up",
};

function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] || { bg: "#f5f5f4", text: "#78716c" };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: colors.bg, color: colors.text }}
    >
      {priority}
    </span>
  );
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CaseManagementPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [cases, setCases] = useState<CaseAssignment[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, casesRes, workloadRes] = await Promise.all([
        api.get("/api/cases/dashboard"),
        api.get("/api/cases"),
        api.get("/api/cases/workload"),
      ]);
      setDashboard(dashRes.data);
      setCases(casesRes.data);
      setWorkload(workloadRes.data);
      setError(null);
    } catch {
      setError("Failed to load case management data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = useCallback(async (caseId: number) => {
    try {
      const res = await api.get(`/api/cases/${caseId}`);
      setSelectedCase(res.data);
    } catch {
      setError("Failed to load case detail.");
    }
  }, []);

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.textMuted }}>Loading case management...</div>
      </div>
    );
  }

  if (error && !cases.length) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.red }}>{error}</div>
      </div>
    );
  }

  // Detail view
  if (selectedCase) {
    return (
      <div className="p-7 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedCase(null)}
            className="text-[13px] px-3 py-1.5 rounded-md border hover:bg-stone-50 transition-colors"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Back to Cases
          </button>
          <PriorityBadge priority={selectedCase.priority} />
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: tokens.blueSoft, color: tokens.blue }}
          >
            {selectedCase.status}
          </span>
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Case #{selectedCase.id} — Member #{selectedCase.member_id}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Care Manager: {selectedCase.care_manager_name} | Assigned: {selectedCase.assignment_date}
            {selectedCase.reason ? ` | Reason: ${REASON_LABELS[selectedCase.reason] || selectedCase.reason}` : ""}
          </p>
          {selectedCase.notes && (
            <p className="text-[13px] mt-2" style={{ color: tokens.textSecondary }}>{selectedCase.notes}</p>
          )}
        </div>

        {/* Case info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total Contacts" value={String(selectedCase.contact_count)} />
          <MetricCard
            label="Last Contact"
            value={selectedCase.last_contact_date || "None"}
          />
          <MetricCard
            label="Next Contact Due"
            value={selectedCase.next_contact_date || "Not set"}
            trendDirection={isOverdue(selectedCase.next_contact_date) ? "down" : undefined}
            trend={isOverdue(selectedCase.next_contact_date) ? "Overdue" : undefined}
          />
          <MetricCard label="Days Active" value={String(
            Math.floor((Date.now() - new Date(selectedCase.assignment_date).getTime()) / 86400000)
          )} />
        </div>

        {/* Contact log */}
        <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: tokens.text, fontFamily: fonts.heading }}>
            Contact Log ({selectedCase.case_notes.length} notes)
          </h3>
          <div className="flex flex-col gap-3">
            {selectedCase.case_notes.map((note) => (
              <div key={note.id} className="p-3 rounded-md" style={{ background: tokens.surfaceAlt }}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                    style={{ background: tokens.blueSoft, color: tokens.blue }}
                  >
                    {NOTE_TYPE_LABELS[note.note_type] || note.note_type}
                  </span>
                  {note.contact_method && (
                    <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                      via {note.contact_method}
                    </span>
                  )}
                  {note.duration_minutes && (
                    <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                      {note.duration_minutes} min
                    </span>
                  )}
                  <span className="ml-auto text-[11px]" style={{ color: tokens.textMuted }}>
                    {note.created_at ? new Date(note.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-[13px]" style={{ color: tokens.text }}>{note.content}</p>
                <span className="text-[11px]" style={{ color: tokens.textMuted }}>— {note.author_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard view
  return (
    <div className="p-7 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
          Case Management
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: tokens.textMuted }}>
          Manage care manager caseloads, track member outreach, and monitor workload balance.
        </p>
      </div>

      {/* Dashboard metrics */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Active Cases" value={String(dashboard.total_active)} />
          <MetricCard label="Care Managers" value={String(dashboard.by_manager.length)} />
          <MetricCard label="High Priority" value={String(dashboard.by_priority.high || 0)} />
          <MetricCard
            label="Overdue Contacts"
            value={String(dashboard.overdue_contacts)}
            trendDirection={dashboard.overdue_contacts > 0 ? "down" : "up"}
            trend={dashboard.overdue_contacts > 0 ? "Needs attention" : "All current"}
          />
        </div>
      )}

      {/* Workload balance */}
      <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: tokens.text, fontFamily: fonts.heading }}>
          Workload Balance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {workload.map((w) => {
            const maxCases = Math.max(...workload.map((wl) => wl.total_cases), 1);
            return (
              <div key={w.care_manager_id} className="p-3 rounded-md" style={{ background: tokens.surfaceAlt }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-medium" style={{ color: tokens.text }}>{w.care_manager_name}</span>
                  <span className="text-[12px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.accentText }}>
                    {w.total_cases} cases
                  </span>
                </div>
                <div className="h-1.5 rounded-full mb-2" style={{ background: tokens.border }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${(w.total_cases / maxCases) * 100}%`, background: tokens.accent }}
                  />
                </div>
                <div className="flex gap-3 text-[11px]" style={{ color: tokens.textMuted }}>
                  <span>{w.high_priority} high priority</span>
                  {w.overdue_contacts > 0 && (
                    <span style={{ color: tokens.red }}>{w.overdue_contacts} overdue</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cases table */}
      <div className="rounded-[10px] border bg-white" style={{ borderColor: tokens.border }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left font-medium p-3 text-[11px]">Member</th>
              <th className="text-left font-medium p-3 text-[11px]">Care Manager</th>
              <th className="text-left font-medium p-3 text-[11px]">Priority</th>
              <th className="text-left font-medium p-3 text-[11px]">Reason</th>
              <th className="text-right font-medium p-3 text-[11px]">Contacts</th>
              <th className="text-left font-medium p-3 text-[11px]">Last Contact</th>
              <th className="text-left font-medium p-3 text-[11px]">Next Due</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="border-t cursor-pointer hover:bg-stone-50 transition-colors"
                style={{ borderColor: tokens.borderSoft }}
                onClick={() => openDetail(c.id)}
              >
                <td className="p-3">
                  <div className="font-medium" style={{ color: tokens.text }}>Member #{c.member_id}</div>
                  {c.notes && (
                    <div className="text-[11px] truncate max-w-[200px]" style={{ color: tokens.textMuted }}>
                      {c.notes}
                    </div>
                  )}
                </td>
                <td className="p-3" style={{ color: tokens.textSecondary }}>{c.care_manager_name}</td>
                <td className="p-3"><PriorityBadge priority={c.priority} /></td>
                <td className="p-3" style={{ color: tokens.textSecondary }}>
                  {REASON_LABELS[c.reason || ""] || c.reason || "—"}
                </td>
                <td className="text-right p-3" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                  {c.contact_count}
                </td>
                <td className="p-3" style={{ color: tokens.textSecondary }}>{c.last_contact_date || "None"}</td>
                <td className="p-3" style={{
                  color: isOverdue(c.next_contact_date) ? tokens.red : tokens.textSecondary,
                  fontWeight: isOverdue(c.next_contact_date) ? 600 : 400,
                }}>
                  {c.next_contact_date || "Not set"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
