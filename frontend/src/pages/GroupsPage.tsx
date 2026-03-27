import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { GroupCard } from "../components/groups/GroupCard";
import { GroupScorecard } from "../components/groups/GroupScorecard";
import { GroupComparison } from "../components/groups/GroupComparison";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroupRow {
  id: number;
  name: string;
  client_code: string;
  city: string;
  state: string;
  provider_count: number;
  total_panel_size: number;
  avg_capture_rate: number | null;
  avg_recapture_rate: number | null;
  avg_raf: number | null;
  group_pmpm: number | null;
  gap_closure_rate: number | null;
  tier: "green" | "amber" | "red";
}

// ---------------------------------------------------------------------------
// Group List View
// ---------------------------------------------------------------------------

function GroupListView() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/api/groups")
      .then((res) => setGroups(Array.isArray(res.data) ? res.data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCompareSelect = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleLaunchCompare = () => {
    if (compareIds.length === 2) {
      setShowComparison(true);
    }
  };

  if (showComparison && compareIds.length === 2) {
    return (
      <GroupComparison
        groupIdA={compareIds[0]}
        groupIdB={compareIds[1]}
        onClose={() => { setShowComparison(false); setCompareIds([]); setCompareMode(false); }}
      />
    );
  }

  const greenCount = groups.filter((g) => g.tier === "green").length;
  const amberCount = groups.filter((g) => g.tier === "amber").length;
  const redCount = groups.filter((g) => g.tier === "red").length;

  return (
    <div className="p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: fonts.heading, color: tokens.text }}>
            Group Scorecards
          </h1>
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
            {groups.length} offices / practice groups
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setCompareMode(!compareMode); setCompareIds([]); setShowComparison(false); }}
            className="text-[13px] px-4 py-2 rounded-lg border font-medium"
            style={{
              borderColor: compareMode ? tokens.accent : tokens.border,
              color: compareMode ? tokens.accent : tokens.textSecondary,
              background: compareMode ? tokens.accentSoft : "transparent",
            }}
          >
            {compareMode ? "Cancel Compare" : "Compare Groups"}
          </button>
          {compareMode && compareIds.length === 2 && (
            <button
              onClick={handleLaunchCompare}
              className="text-[13px] px-4 py-2 rounded-lg text-white font-medium"
              style={{ background: tokens.accent }}
            >
              Compare Selected
            </button>
          )}
        </div>
      </div>

      {/* Tier summary */}
      <div className="flex items-center gap-6">
        {[
          { label: "Meets Target", count: greenCount, color: tokens.accent },
          { label: "Near Target", count: amberCount, color: tokens.amber },
          { label: "Below Target", count: redCount, color: tokens.red },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[13px]" style={{ color: tokens.textSecondary }}>
              {label}: <span style={{ fontFamily: fonts.code, color: tokens.text }}>{count}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Group grid */}
      {loading ? (
        <div className="py-8 text-center text-[13px]" style={{ color: tokens.textMuted }}>Loading groups...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              {...g}
              compareMode={compareMode}
              selected={compareIds.includes(g.id)}
              onClick={() => !compareMode && navigate(`/groups/${g.id}`)}
              onCompareSelect={() => handleCompareSelect(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page with nested routes
// ---------------------------------------------------------------------------

export function GroupsPage() {
  return (
    <Routes>
      <Route path="/" element={<GroupListView />} />
      <Route path="/:id" element={<GroupScorecard />} />
    </Routes>
  );
}
