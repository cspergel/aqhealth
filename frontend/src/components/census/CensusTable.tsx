import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

export interface CensusItem {
  event_id: number;
  member_id: number | null;
  patient_name: string | null;
  patient_class: string;
  admit_date: string | null;
  los_days: number;
  facility_name: string | null;
  facility_type: string | null;
  attending_provider: string | null;
  diagnosis_codes: string[];
  estimated_daily_cost: number;
  total_accrued_cost: number;
  typical_los: number;
  projected_discharge: string | null;
  los_status: "normal" | "extended" | "critical";
}

interface CensusTableProps {
  items: CensusItem[];
  facilityFilter: string;
  classFilter: string;
  providerFilter: string;
  onFacilityFilterChange: (v: string) => void;
  onClassFilterChange: (v: string) => void;
  onProviderFilterChange: (v: string) => void;
}

const classVariant: Record<string, "default" | "green" | "amber" | "red" | "blue"> = {
  inpatient: "blue",
  emergency: "red",
  observation: "amber",
  snf: "default",
  rehab: "green",
};

function losColor(status: string): string {
  if (status === "critical") return tokens.red;
  if (status === "extended") return tokens.amber;
  return tokens.text;
}

function losBg(status: string): string {
  if (status === "critical") return tokens.redSoft;
  if (status === "extended") return tokens.amberSoft;
  return "transparent";
}

export function CensusTable({
  items,
  facilityFilter,
  classFilter,
  providerFilter,
  onFacilityFilterChange,
  onClassFilterChange,
  onProviderFilterChange,
}: CensusTableProps) {
  // Extract unique values for filters
  const facilities = [...new Set(items.map((i) => i.facility_name).filter(Boolean))] as string[];
  const classes = [...new Set(items.map((i) => i.patient_class).filter(Boolean))];
  const providers = [...new Set(items.map((i) => i.attending_provider).filter(Boolean))] as string[];

  // Apply filters
  const filtered = items.filter((item) => {
    if (facilityFilter && item.facility_name !== facilityFilter) return false;
    if (classFilter && item.patient_class !== classFilter) return false;
    if (providerFilter && item.attending_provider !== providerFilter) return false;
    return true;
  });

  const selectStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.surface,
    color: tokens.text,
    fontFamily: fonts.body,
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={facilityFilter}
          onChange={(e) => onFacilityFilterChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Facilities</option>
          {facilities.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => onClassFilterChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={providerFilter}
          onChange={(e) => onProviderFilterChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="text-xs ml-auto" style={{ color: tokens.textMuted }}>
          {filtered.length} of {items.length} patients
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[10px] border" style={{ borderColor: tokens.border }}>
        <table className="w-full text-left" style={{ fontSize: 13, fontFamily: fonts.body }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              {["Patient", "Facility", "Class", "Admit Date", "LOS", "Attending", "Dx Codes", "Daily Cost", "Proj. Discharge"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 font-semibold text-xs"
                  style={{ color: tokens.textSecondary, borderBottom: `1px solid ${tokens.border}` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.event_id}
                className="border-b last:border-b-0 hover:bg-stone-50 transition-colors"
                style={{ borderColor: tokens.borderSoft }}
              >
                <td className="px-3 py-2.5 font-medium" style={{ color: tokens.text }}>
                  {item.patient_name || "Unknown"}
                </td>
                <td className="px-3 py-2.5" style={{ color: tokens.textSecondary }}>
                  {item.facility_name || "-"}
                </td>
                <td className="px-3 py-2.5">
                  <Tag variant={classVariant[item.patient_class] || "default"}>
                    {item.patient_class}
                  </Tag>
                </td>
                <td className="px-3 py-2.5" style={{ color: tokens.textSecondary, fontFamily: fonts.code, fontSize: 12 }}>
                  {item.admit_date ? new Date(item.admit_date).toLocaleDateString() : "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                    style={{
                      color: losColor(item.los_status),
                      background: losBg(item.los_status),
                      fontFamily: fonts.code,
                    }}
                  >
                    {item.los_days}d
                    {item.los_status === "extended" && " !"}
                    {item.los_status === "critical" && " !!"}
                  </span>
                </td>
                <td className="px-3 py-2.5" style={{ color: tokens.textSecondary }}>
                  {item.attending_provider || "-"}
                </td>
                <td className="px-3 py-2.5" style={{ color: tokens.textSecondary, fontSize: 11, fontFamily: fonts.code }}>
                  {(item.diagnosis_codes || []).slice(0, 3).join(", ")}
                  {(item.diagnosis_codes || []).length > 3 && ` +${(item.diagnosis_codes || []).length - 3}`}
                </td>
                <td className="px-3 py-2.5" style={{ fontFamily: fonts.code, fontSize: 12, color: tokens.text }}>
                  ${item.estimated_daily_cost.toLocaleString()}
                </td>
                <td className="px-3 py-2.5" style={{ color: tokens.textMuted, fontFamily: fonts.code, fontSize: 12 }}>
                  {item.projected_discharge && item.projected_discharge !== "None"
                    ? new Date(item.projected_discharge).toLocaleDateString()
                    : "-"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm" style={{ color: tokens.textMuted }}>
                  No patients match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
