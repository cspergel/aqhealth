import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MetricCard } from "../components/ui/MetricCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthRequest {
  id: number;
  auth_number: string | null;
  member_id: number;
  service_type: string;
  procedure_code: string | null;
  diagnosis_code: string | null;
  requesting_provider_name: string | null;
  servicing_facility: string | null;
  request_date: string | null;
  decision_date: string | null;
  urgency: string;
  status: string;
  decision: string | null;
  approved_units: number | null;
  denial_reason: string | null;
  appeal_date: string | null;
  appeal_status: string | null;
  peer_to_peer_date: string | null;
  turnaround_hours: number | null;
  compliant: boolean | null;
  reviewer_name: string | null;
  notes: string | null;
}

interface Dashboard {
  pending_count: number;
  avg_turnaround_hours: number;
  approval_rate: number;
  compliance_rate: number;
  by_service_type: { service_type: string; count: number }[];
}

interface ComplianceReport {
  by_urgency: {
    urgency: string;
    total: number;
    compliant: number;
    compliance_rate: number;
    avg_turnaround_hours: number;
    max_allowed_hours: number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: tokens.amberSoft, text: tokens.amber },
  approved: { bg: tokens.accentSoft, text: tokens.accentText },
  denied: { bg: tokens.redSoft, text: tokens.red },
  partial: { bg: tokens.blueSoft, text: tokens.blue },
  appealed: { bg: "#f5f0ff", text: "#7c3aed" },
  withdrawn: { bg: "#f5f5f4", text: "#78716c" },
};

const URGENCY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: tokens.redSoft, text: tokens.red },
  standard: { bg: tokens.surfaceAlt, text: tokens.textSecondary },
};

const SERVICE_LABELS: Record<string, string> = {
  inpatient: "Inpatient",
  outpatient_surgery: "Outpatient Surgery",
  imaging: "Imaging",
  DME: "DME",
  home_health: "Home Health",
  SNF: "SNF",
  specialist_referral: "Specialist Referral",
  medication: "Medication",
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || { bg: "#f5f5f4", text: "#78716c" };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriorAuthPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [auths, setAuths] = useState<AuthRequest[]>([]);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [overdue, setOverdue] = useState<AuthRequest[]>([]);
  const [selectedAuth, setSelectedAuth] = useState<AuthRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, authsRes, compRes, overdueRes] = await Promise.all([
        api.get("/api/auth-requests/dashboard"),
        api.get("/api/auth-requests"),
        api.get("/api/auth-requests/compliance"),
        api.get("/api/auth-requests/overdue"),
      ]);
      setDashboard(dashRes.data);
      setAuths(authsRes.data);
      setCompliance(compRes.data);
      setOverdue(overdueRes.data);
      setError(null);
    } catch {
      setError("Failed to load prior auth data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.textMuted }}>Loading prior authorizations...</div>
      </div>
    );
  }

  if (error && !auths.length) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <div className="text-sm" style={{ color: tokens.red }}>{error}</div>
      </div>
    );
  }

  // Detail view
  if (selectedAuth) {
    const a = selectedAuth;
    const overdueIds = new Set(overdue.map((o) => o.id));
    const isOverdue = overdueIds.has(a.id);

    return (
      <div className="p-7 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedAuth(null)}
            className="text-[13px] px-3 py-1.5 rounded-md border hover:bg-stone-50 transition-colors"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Back to Auth Requests
          </button>
          <StatusBadge status={a.status} />
          {isOverdue && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase"
              style={{ background: tokens.redSoft, color: tokens.red }}
            >
              OVERDUE
            </span>
          )}
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            {a.auth_number || `Auth #${a.id}`}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            Member #{a.member_id} | {SERVICE_LABELS[a.service_type] || a.service_type}
            {a.procedure_code ? ` | CPT: ${a.procedure_code}` : ""}
            {a.diagnosis_code ? ` | Dx: ${a.diagnosis_code}` : ""}
          </p>
        </div>

        {/* Timeline */}
        <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: tokens.text, fontFamily: fonts.heading }}>
            Authorization Timeline
          </h3>
          <div className="flex flex-col gap-3">
            {[
              { label: "Requested", date: a.request_date, active: true },
              { label: "Under Review", date: a.status !== "pending" ? a.request_date : null, active: a.status !== "pending" },
              { label: "Decision", date: a.decision_date, active: !!a.decision_date },
              ...(a.appeal_date ? [{ label: "Appealed", date: a.appeal_date, active: true }] : []),
              ...(a.peer_to_peer_date ? [{ label: "Peer-to-Peer", date: a.peer_to_peer_date, active: true }] : []),
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    background: step.active ? tokens.accent : tokens.border,
                  }}
                />
                <span className="text-[13px] font-medium w-28" style={{ color: step.active ? tokens.text : tokens.textMuted }}>
                  {step.label}
                </span>
                <span className="text-[12px]" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                  {step.date || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.text, fontFamily: fonts.heading }}>
              Request Details
            </h3>
            <dl className="flex flex-col gap-2 text-[13px]">
              {[
                ["Service Type", SERVICE_LABELS[a.service_type] || a.service_type],
                ["Urgency", a.urgency],
                ["Requesting Provider", a.requesting_provider_name],
                ["Servicing Facility", a.servicing_facility],
                ["Approved Units", a.approved_units],
                ["Turnaround (hrs)", a.turnaround_hours],
                ["Compliant", a.compliant === true ? "Yes" : a.compliant === false ? "No" : "—"],
                ["Reviewer", a.reviewer_name],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt style={{ color: tokens.textMuted }}>{label}</dt>
                  <dd className="font-medium" style={{ color: tokens.text }}>{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {a.denial_reason && (
            <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: tokens.red, fontFamily: fonts.heading }}>
                Denial Reason
              </h3>
              <p className="text-[13px]" style={{ color: tokens.text }}>{a.denial_reason}</p>
            </div>
          )}
        </div>

        {a.notes && (
          <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: tokens.text, fontFamily: fonts.heading }}>Notes</h3>
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>{a.notes}</p>
          </div>
        )}
      </div>
    );
  }

  const filteredAuths = filterStatus
    ? auths.filter((a) => a.status === filterStatus)
    : auths;

  const overdueIds = new Set(overdue.map((o) => o.id));

  // List view
  return (
    <div className="p-7 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
          Prior Authorization / UM
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: tokens.textMuted }}>
          Track utilization management requests, approvals, denials, and CMS compliance.
        </p>
      </div>

      {/* Dashboard metrics */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Pending"
            value={String(dashboard.pending_count)}
            trendDirection={dashboard.pending_count > 3 ? "down" : undefined}
          />
          <MetricCard label="Avg Turnaround" value={`${dashboard.avg_turnaround_hours}h`} />
          <MetricCard label="Approval Rate" value={`${dashboard.approval_rate}%`} />
          <MetricCard
            label="CMS Compliance"
            value={`${dashboard.compliance_rate}%`}
            trendDirection={dashboard.compliance_rate >= 90 ? "up" : "down"}
            trend={dashboard.compliance_rate >= 90 ? "On target" : "Below target"}
          />
        </div>
      )}

      {/* Compliance gauge and service type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Compliance */}
        {compliance && (
          <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: tokens.text, fontFamily: fonts.heading }}>
              CMS Turnaround Compliance
            </h3>
            {compliance.by_urgency.map((u) => (
              <div key={u.urgency} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium capitalize" style={{ color: tokens.text }}>
                    {u.urgency} ({u.total} requests)
                  </span>
                  <span className="text-[12px] font-semibold" style={{
                    color: u.compliance_rate >= 90 ? tokens.accentText : tokens.red,
                    fontFamily: fonts.code,
                  }}>
                    {u.compliance_rate}%
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: tokens.surfaceAlt }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(u.compliance_rate, 100)}%`,
                      background: u.compliance_rate >= 90 ? tokens.accent : tokens.red,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[11px]" style={{ color: tokens.textMuted }}>
                  <span>Avg: {u.avg_turnaround_hours}h</span>
                  <span>Max: {u.max_allowed_hours}h</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* By service type */}
        {dashboard && (
          <div className="rounded-[10px] border bg-white p-5" style={{ borderColor: tokens.border }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: tokens.text, fontFamily: fonts.heading }}>
              Requests by Service Type
            </h3>
            <div className="flex flex-col gap-2">
              {dashboard.by_service_type.map((s) => {
                const maxCount = Math.max(...dashboard.by_service_type.map((st) => st.count), 1);
                return (
                  <div key={s.service_type} className="flex items-center gap-3">
                    <span className="text-[13px] w-36 truncate" style={{ color: tokens.text }}>
                      {SERVICE_LABELS[s.service_type] || s.service_type}
                    </span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: tokens.surfaceAlt }}>
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${(s.count / maxCount) * 100}%`, background: tokens.accent }}
                      />
                    </div>
                    <span className="text-[12px] w-6 text-right" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                      {s.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div
          className="rounded-[10px] border p-4 flex items-center gap-3"
          style={{ borderColor: tokens.red, background: tokens.redSoft }}
        >
          <span className="text-[13px] font-semibold" style={{ color: tokens.red }}>
            {overdue.length} overdue authorization{overdue.length > 1 ? "s" : ""} past CMS deadlines
          </span>
          <span className="text-[12px]" style={{ color: tokens.red }}>
            — {overdue.map((o) => o.auth_number || `#${o.id}`).join(", ")}
          </span>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {["", "pending", "approved", "denied", "appealed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="text-[12px] px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: filterStatus === s ? tokens.accent : tokens.border,
              background: filterStatus === s ? tokens.accentSoft : "transparent",
              color: filterStatus === s ? tokens.accentText : tokens.textSecondary,
              fontWeight: filterStatus === s ? 600 : 400,
            }}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {/* Auth table */}
      <div className="rounded-[10px] border bg-white" style={{ borderColor: tokens.border }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: tokens.textMuted, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left font-medium p-3 text-[11px]">Auth #</th>
              <th className="text-left font-medium p-3 text-[11px]">Service</th>
              <th className="text-left font-medium p-3 text-[11px]">Provider</th>
              <th className="text-left font-medium p-3 text-[11px]">Urgency</th>
              <th className="text-left font-medium p-3 text-[11px]">Status</th>
              <th className="text-left font-medium p-3 text-[11px]">Requested</th>
              <th className="text-left font-medium p-3 text-[11px]">Decision</th>
            </tr>
          </thead>
          <tbody>
            {filteredAuths.map((a) => {
              const isOD = overdueIds.has(a.id);
              return (
                <tr
                  key={a.id}
                  className="border-t cursor-pointer hover:bg-stone-50 transition-colors"
                  style={{
                    borderColor: tokens.borderSoft,
                    background: isOD ? tokens.redSoft : undefined,
                  }}
                  onClick={() => setSelectedAuth(a)}
                >
                  <td className="p-3 font-medium" style={{ color: isOD ? tokens.red : tokens.text }}>
                    {a.auth_number || `#${a.id}`}
                    {isOD && (
                      <span className="ml-1 text-[10px] font-bold" style={{ color: tokens.red }}>OVERDUE</span>
                    )}
                  </td>
                  <td className="p-3" style={{ color: tokens.textSecondary }}>
                    {SERVICE_LABELS[a.service_type] || a.service_type}
                  </td>
                  <td className="p-3" style={{ color: tokens.textSecondary }}>
                    {a.requesting_provider_name || "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      style={{
                        background: URGENCY_COLORS[a.urgency]?.bg || tokens.surfaceAlt,
                        color: URGENCY_COLORS[a.urgency]?.text || tokens.textSecondary,
                      }}
                    >
                      {a.urgency}
                    </span>
                  </td>
                  <td className="p-3"><StatusBadge status={a.status} /></td>
                  <td className="p-3" style={{ color: tokens.textSecondary }}>{a.request_date}</td>
                  <td className="p-3" style={{ color: tokens.textSecondary }}>{a.decision_date || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
