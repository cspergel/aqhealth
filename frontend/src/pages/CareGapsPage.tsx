import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { GapTable, type MeasureSummary } from "../components/care-gaps/GapTable";
import { MeasureConfig, type Measure } from "../components/care-gaps/MeasureConfig";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "population" | "measures";

interface MemberGap {
  id: number;
  member_id: number;
  member_name: string | null;
  measure_code: string;
  measure_name: string;
  status: string;
  due_date: string | null;
  closed_date: string | null;
  measurement_year: number;
  stars_weight: number;
  provider_name: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CareGapsPage() {
  const [tab, setTab] = useState<Tab>("population");
  const [summaries, setSummaries] = useState<MeasureSummary[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [memberGaps, setMemberGaps] = useState<MemberGap[]>([]);
  const [selectedMeasureId, setSelectedMeasureId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummaries = () => {
    setLoading(true);
    setError(null);
    api
      .get("/api/care-gaps")
      .then((res) => setSummaries(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error("Failed to load care gap summaries:", err);
        setError("Failed to load care gap data.");
      })
      .finally(() => setLoading(false));
  };

  const loadMeasures = () => {
    api
      .get("/api/care-gaps/measures")
      .then((res) => setMeasures(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Failed to load measures:", err));
  };

  const loadMemberGaps = (measureId: number) => {
    setSelectedMeasureId(measureId);
    api
      .get("/api/care-gaps/members", { params: { measure_id: measureId } })
      .then((res) => setMemberGaps(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Failed to load member gaps:", err));
  };

  const handleCloseGap = async (gapId: number) => {
    try {
      await api.patch(`/api/care-gaps/${gapId}`, { status: "closed" });
      if (selectedMeasureId) loadMemberGaps(selectedMeasureId);
      loadSummaries();
    } catch (err) {
      console.error("Failed to close gap:", err);
    }
  };

  const handleExcludeGap = async (gapId: number) => {
    try {
      await api.patch(`/api/care-gaps/${gapId}`, { status: "excluded" });
      if (selectedMeasureId) loadMemberGaps(selectedMeasureId);
      loadSummaries();
    } catch (err) {
      console.error("Failed to exclude gap:", err);
    }
  };

  useEffect(() => {
    loadSummaries();
    loadMeasures();
  }, []);

  // Find the selected measure name for the detail header
  const selectedMeasure = summaries.find((s) => s.measure_id === selectedMeasureId);

  // Tab style helper
  const tabStyle = (t: Tab): React.CSSProperties => ({
    color: tab === t ? tokens.text : tokens.textMuted,
    borderBottomColor: tab === t ? tokens.accent : "transparent",
    fontFamily: fonts.heading,
  });

  // ----------- Loading / Error states -----------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: tokens.textMuted }}>
          Loading care gap analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-7 text-center">
        <div className="text-sm" style={{ color: tokens.red }}>{error}</div>
      </div>
    );
  }

  // ----------- Member gap detail view -----------

  if (selectedMeasureId !== null && selectedMeasure) {
    return (
      <div className="p-7">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedMeasureId(null)}
            className="text-[13px] px-3 py-1.5 rounded-md border transition-colors hover:bg-stone-50"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Back
          </button>
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              {selectedMeasure.code} — {selectedMeasure.name}
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: tokens.textMuted }}>
              {selectedMeasure.open_gaps} open gaps out of {selectedMeasure.total_eligible} eligible members
            </p>
          </div>
        </div>

        <div
          className="rounded-lg border overflow-hidden"
          style={{ background: tokens.surface, borderColor: tokens.border }}
        >
          <table className="w-full text-[13px]" style={{ fontFamily: fonts.body }}>
            <thead>
              <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary }}>Member</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary }}>Provider</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary }}>Due Date</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary }}>Status</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberGaps.map((g) => (
                <tr key={g.id} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                  <td className="px-4 py-3" style={{ color: tokens.text }}>{g.member_name ?? `Member #${g.member_id}`}</td>
                  <td className="px-4 py-3" style={{ color: tokens.textSecondary }}>{g.provider_name ?? "--"}</td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: tokens.textSecondary, fontFamily: fonts.code }}>
                    {g.due_date ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        background: g.status === "open" ? tokens.redSoft : g.status === "closed" ? tokens.accentSoft : tokens.surfaceAlt,
                        color: g.status === "open" ? tokens.red : g.status === "closed" ? tokens.accentText : tokens.textMuted,
                      }}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {g.status === "open" && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCloseGap(g.id)}
                          className="text-[12px] px-3 py-1 rounded text-white"
                          style={{ background: tokens.accent }}
                        >
                          Close
                        </button>
                        <button
                          onClick={() => handleExcludeGap(g.id)}
                          className="text-[12px] px-3 py-1 rounded border transition-colors hover:bg-stone-50"
                          style={{ borderColor: tokens.border, color: tokens.textMuted }}
                        >
                          Exclude
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {memberGaps.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-[13px]" style={{ color: tokens.textMuted }}>
                    No gaps found for this measure.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ----------- Main page with tabs -----------

  return (
    <div className="p-7">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Care Gap Tracking
          </h1>
          <p className="text-[13px] mt-1" style={{ color: tokens.textMuted }}>
            HEDIS/Stars quality measures and gap closure rates
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const response = await api.get("/api/care-gaps/export", { responseType: "blob" });
              const blob = new Blob([response.data]);
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = "care-gaps.csv";
              link.click();
              URL.revokeObjectURL(link.href);
            } catch (err) {
              console.error("Failed to export care gaps", err);
            }
          }}
          className="text-[13px] px-4 py-2 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Export Chase List
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-5 mb-6" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        {(["population", "measures"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[13px] pb-2 border-b-2 transition-colors ${tab === t ? "font-semibold" : "font-normal"}`}
            style={tabStyle(t)}
          >
            {t === "population" ? "Population" : "Measures"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "population" && (
        <GapTable measures={summaries} onSelectMeasure={loadMemberGaps} />
      )}

      {tab === "measures" && (
        <MeasureConfig measures={measures} onRefresh={loadMeasures} />
      )}
    </div>
  );
}
