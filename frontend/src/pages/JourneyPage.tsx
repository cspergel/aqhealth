import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { MemberSummary } from "../components/journey/MemberSummary";
import { MemberTimeline } from "../components/journey/MemberTimeline";
import { RiskTrajectory } from "../components/journey/RiskTrajectory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberSearchResult {
  id: number;
  member_id: string;
  name: string;
  dob: string;
  current_raf: number;
}

interface MemberSummaryData {
  id: number;
  member_id: string;
  name: string;
  dob: string;
  age: number;
  gender: string;
  health_plan: string | null;
  pcp: string | null;
  current_raf: number;
  projected_raf: number;
  risk_tier: string | null;
  total_spend_12m: number;
  open_suspects: number;
  open_gaps: number;
  conditions: string[];
}

interface EventFlag {
  type: string;
  message: string;
}

interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  provider: string;
  facility: string;
  diagnoses: string[];
  cost: number;
  description: string;
  flags: EventFlag[];
}

interface TrajectoryPoint {
  date: string;
  raf: number;
  cost: number;
  disease_raf: number;
  demographic_raf: number;
  hcc_count: number;
  event?: string;
}

interface JourneyData {
  member: MemberSummaryData;
  timeline: TimelineEvent[];
  narrative: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JourneyPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();

  const [members, setMembers] = useState<MemberSearchResult[]>([]);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState(24);
  const [searchOpen, setSearchOpen] = useState(!memberId);
  const [searchQuery, setSearchQuery] = useState("");

  // Load member list for search
  useEffect(() => {
    api.get("/api/journey/members")
      .then((res) => setMembers(Array.isArray(res.data) ? res.data : []))
      .catch(() => {
        // Endpoint may not exist; members list will be empty
        setMembers([]);
      });
  }, []);

  // Load journey data when memberId changes
  const loadJourney = useCallback(
    (id: number) => {
      setLoading(true);
      Promise.all([
        api.get(`/api/journey/${id}`),
        api.get(`/api/journey/${id}/trajectory`),
      ])
        .then(([journeyRes, trajectoryRes]) => {
          setJourney(journeyRes.data);
          setTrajectory(trajectoryRes.data);
          setSearchOpen(false);
        })
        .catch((err) => {
          console.error("Failed to load journey:", err);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (memberId) {
      loadJourney(parseInt(memberId));
    }
  }, [memberId, loadJourney]);

  const selectMember = (id: number) => {
    navigate(`/journey/${id}`);
  };

  // Filter events by month range
  const filteredTimeline = journey
    ? months === 0
      ? journey.timeline
      : journey.timeline.filter((e) => {
          const eventDate = new Date(e.date);
          const cutoff = new Date();
          cutoff.setMonth(cutoff.getMonth() - months);
          return eventDate >= cutoff;
        })
    : [];

  // Filter search results
  const filteredMembers = searchQuery
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.member_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : members;

  return (
    <div className="px-7 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            Member Journey
          </h1>
          <p className="text-xs mt-0.5" style={{ color: tokens.textMuted }}>
            Patient-level timeline showing every touchpoint across the continuum of care
          </p>
        </div>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
          style={{
            borderColor: tokens.border,
            color: tokens.textSecondary,
            background: searchOpen ? tokens.surfaceAlt : "white",
          }}
        >
          {journey ? "Switch Member" : "Select Member"}
        </button>
      </div>

      {/* Member search panel */}
      {searchOpen && (
        <div
          className="rounded-[10px] border bg-white p-5"
          style={{ borderColor: tokens.border }}
        >
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search by name or member ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
              style={{
                borderColor: tokens.border,
                color: tokens.text,
                fontFamily: fonts.body,
              }}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMember(m.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-stone-50"
                style={{
                  background:
                    memberId && parseInt(memberId) === m.id
                      ? tokens.surfaceAlt
                      : "transparent",
                }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: tokens.text }}>
                    {m.name}
                  </div>
                  <div className="text-[11px]" style={{ color: tokens.textMuted }}>
                    {m.member_id} &middot; DOB: {m.dob}
                  </div>
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
                >
                  RAF {(m.current_raf ?? 0).toFixed(3)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="text-center py-20 text-sm"
          style={{ color: tokens.textMuted }}
        >
          Loading member journey...
        </div>
      )}

      {/* No member selected */}
      {!loading && !journey && !searchOpen && (
        <div
          className="text-center py-20 rounded-[10px] border"
          style={{ borderColor: tokens.border, background: tokens.surfaceAlt }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: tokens.textSecondary }}>
            No member selected
          </div>
          <div className="text-xs" style={{ color: tokens.textMuted }}>
            Use the member search above to view a patient's journey timeline.
          </div>
        </div>
      )}

      {/* Journey content */}
      {!loading && journey && (
        <>
          {/* Member summary card */}
          <MemberSummary member={journey.member} />

          {/* AI Narrative */}
          <div
            className="rounded-[10px] border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: tokens.accentSoft, color: tokens.accentText }}
              >
                AI
              </div>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: tokens.textMuted }}
              >
                Journey Narrative
              </span>
            </div>
            <p
              className="text-sm leading-relaxed"
              style={{ color: tokens.textSecondary }}
            >
              {journey.narrative}
            </p>
          </div>

          {/* Risk trajectory chart */}
          {trajectory.length > 0 && <RiskTrajectory data={trajectory} />}

          {/* Timeline */}
          <div
            className="rounded-[10px] border bg-white p-5"
            style={{ borderColor: tokens.border }}
          >
            <h3
              className="text-sm font-semibold mb-4"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Timeline
            </h3>
            <MemberTimeline
              events={filteredTimeline}
              months={months}
              onMonthsChange={setMonths}
            />
          </div>
        </>
      )}
    </div>
  );
}
