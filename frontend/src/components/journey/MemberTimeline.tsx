import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface MemberTimelineProps {
  events: TimelineEvent[];
  months: number;
  onMonthsChange: (m: number) => void;
}

// ---------------------------------------------------------------------------
// Event type config: color, icon label, category grouping
// ---------------------------------------------------------------------------

type EventCategory = "acute" | "office" | "post_acute" | "positive" | "pharmacy" | "lab";

interface EventTypeConfig {
  label: string;
  color: string;
  bgColor: string;
  category: EventCategory;
  icon: string;
}

const EVENT_TYPES: Record<string, EventTypeConfig> = {
  er_visit:          { label: "ER Visit",       color: tokens.red,    bgColor: tokens.redSoft,     category: "acute",      icon: "!" },
  admission:         { label: "Admission",      color: tokens.red,    bgColor: tokens.redSoft,     category: "acute",      icon: "H" },
  discharge:         { label: "Discharge",       color: "#78716c",     bgColor: "#f5f5f4",          category: "acute",      icon: "D" },
  snf_admit:         { label: "SNF Admit",      color: tokens.amber,  bgColor: tokens.amberSoft,   category: "post_acute", icon: "S" },
  snf_discharge:     { label: "SNF Discharge",  color: tokens.amber,  bgColor: tokens.amberSoft,   category: "post_acute", icon: "S" },
  hh_start:          { label: "Home Health",    color: tokens.amber,  bgColor: tokens.amberSoft,   category: "post_acute", icon: "HH" },
  hh_end:            { label: "HH Complete",    color: tokens.amber,  bgColor: tokens.amberSoft,   category: "post_acute", icon: "HH" },
  pcp_visit:         { label: "PCP Visit",      color: tokens.blue,   bgColor: tokens.blueSoft,    category: "office",     icon: "P" },
  specialist_visit:  { label: "Specialist",     color: tokens.blue,   bgColor: tokens.blueSoft,    category: "office",     icon: "Sp" },
  rx_fill:           { label: "Rx Fill",        color: "#78716c",     bgColor: "#f5f5f4",          category: "pharmacy",   icon: "Rx" },
  lab:               { label: "Lab",            color: "#78716c",     bgColor: "#f5f5f4",          category: "lab",        icon: "L" },
  hcc_captured:      { label: "HCC Captured",   color: tokens.accent, bgColor: tokens.accentSoft,  category: "positive",   icon: "+" },
  gap_closed:        { label: "Gap Closed",     color: tokens.accent, bgColor: tokens.accentSoft,  category: "positive",   icon: "G" },
};

const FILTER_GROUPS: { label: string; types: string[] }[] = [
  { label: "Acute", types: ["er_visit", "admission", "discharge"] },
  { label: "Office", types: ["pcp_visit", "specialist_visit"] },
  { label: "Post-Acute", types: ["snf_admit", "snf_discharge", "hh_start", "hh_end"] },
  { label: "Outcomes", types: ["hcc_captured", "gap_closed"] },
  { label: "Pharmacy", types: ["rx_fill"] },
  { label: "Labs", types: ["lab"] },
];

const ZOOM_OPTIONS = [6, 12, 24, 0] as const; // 0 = all

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCost(v: number): string {
  if (v === 0) return "";
  if (v >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemberTimeline({ events, months, onMonthsChange }: MemberTimelineProps) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const toggleGroup = (types: string[]) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      const allHidden = types.every((t) => next.has(t));
      if (allHidden) {
        types.forEach((t) => next.delete(t));
      } else {
        types.forEach((t) => next.add(t));
      }
      return next;
    });
  };

  // Apply filters
  const filtered = events.filter((e) => !hiddenTypes.has(e.type));

  // Group by month for section headers
  const grouped: { month: string; events: TimelineEvent[] }[] = [];
  let currentMonth = "";
  for (const ev of filtered) {
    const m = ev.date.substring(0, 7); // YYYY-MM
    const label = new Date(ev.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (m !== currentMonth) {
      currentMonth = m;
      grouped.push({ month: label, events: [ev] });
    } else {
      grouped[grouped.length - 1].events.push(ev);
    }
  }

  return (
    <div>
      {/* Controls bar */}
      <div
        className="flex items-center justify-between mb-4 pb-4 border-b"
        style={{ borderColor: tokens.border }}
      >
        {/* Filter toggles */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium mr-1" style={{ color: tokens.textMuted }}>
            Filter:
          </span>
          {FILTER_GROUPS.map((group) => {
            const allHidden = group.types.every((t) => hiddenTypes.has(t));
            const someHidden = group.types.some((t) => hiddenTypes.has(t));
            return (
              <button
                key={group.label}
                onClick={() => toggleGroup(group.types)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all"
                style={{
                  background: allHidden ? tokens.surfaceAlt : "white",
                  color: allHidden ? tokens.textMuted : someHidden ? tokens.textSecondary : tokens.text,
                  borderColor: allHidden ? tokens.borderSoft : tokens.border,
                  opacity: allHidden ? 0.6 : 1,
                }}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        {/* Zoom options */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium mr-1" style={{ color: tokens.textMuted }}>
            Range:
          </span>
          {ZOOM_OPTIONS.map((z) => (
            <button
              key={z}
              onClick={() => onMonthsChange(z)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-all"
              style={{
                background: months === z ? tokens.text : "transparent",
                color: months === z ? "white" : tokens.textSecondary,
              }}
            >
              {z === 0 ? "All" : `${z}mo`}
            </button>
          ))}
        </div>
      </div>

      {/* Event count */}
      <div className="text-xs mb-4" style={{ color: tokens.textMuted }}>
        Showing {filtered.length} of {events.length} events
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div
          className="text-center py-12 text-sm"
          style={{ color: tokens.textMuted }}
        >
          No events match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.month}>
              {/* Month header */}
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-3 pb-2 border-b"
                style={{ color: tokens.textMuted, borderColor: tokens.borderSoft }}
              >
                {group.month}
              </div>

              {/* Events in this month */}
              <div className="space-y-2">
                {group.events.map((ev, idx) => {
                  const cfg = EVENT_TYPES[ev.type] || EVENT_TYPES.pcp_visit;
                  return (
                    <TimelineEventCard key={`${ev.date}-${ev.type}-${idx}`} event={ev} config={cfg} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single timeline event card
// ---------------------------------------------------------------------------

function TimelineEventCard({
  event,
  config,
}: {
  event: TimelineEvent;
  config: EventTypeConfig;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="flex gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm"
      style={{
        borderColor: expanded ? config.color + "40" : tokens.borderSoft,
        background: expanded ? config.bgColor + "30" : "white",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Date column */}
      <div className="flex-shrink-0 w-[90px] pt-0.5">
        <div
          className="text-[11px] font-medium"
          style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
        >
          {formatDate(event.date)}
        </div>
      </div>

      {/* Type badge */}
      <div className="flex-shrink-0 pt-0.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{
            background: config.bgColor,
            color: config.color,
            border: `1.5px solid ${config.color}40`,
          }}
        >
          {config.icon}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div>
            <div
              className="text-sm font-medium leading-snug"
              style={{ color: tokens.text }}
            >
              {event.title}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ background: config.bgColor, color: config.color }}
              >
                {config.label}
              </span>
              {event.provider && event.type !== "rx_fill" && (
                <span className="text-[11px]" style={{ color: tokens.textMuted }}>
                  {event.provider}
                </span>
              )}
            </div>
          </div>

          {/* Cost */}
          {event.cost > 0 && (
            <div
              className="text-sm font-medium flex-shrink-0 ml-2"
              style={{ fontFamily: fonts.code, color: tokens.textSecondary }}
            >
              {formatCost(event.cost)}
            </div>
          )}
        </div>

        {/* Flags — always visible */}
        {event.flags.length > 0 && (
          <div className="mt-2 space-y-1">
            {event.flags.map((flag, fi) => (
              <div
                key={fi}
                className="flex items-start gap-1.5 text-[11px] font-medium px-2 py-1 rounded"
                style={{
                  background: flag.type === "success" ? tokens.accentSoft : tokens.amberSoft,
                  color: flag.type === "success" ? tokens.accentText : tokens.amber,
                }}
              >
                <span className="flex-shrink-0 mt-px">
                  {flag.type === "success" ? "\u2713" : "\u26A0"}
                </span>
                <span>{flag.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: tokens.borderSoft }}>
            {event.description && (
              <p className="text-xs leading-relaxed" style={{ color: tokens.textSecondary }}>
                {event.description}
              </p>
            )}
            {event.diagnoses.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium" style={{ color: tokens.textMuted }}>
                  Dx:
                </span>
                {event.diagnoses.map((dx, di) => (
                  <span
                    key={di}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      fontFamily: fonts.code,
                      background: tokens.surfaceAlt,
                      color: tokens.textSecondary,
                      border: `1px solid ${tokens.borderSoft}`,
                    }}
                  >
                    {dx}
                  </span>
                ))}
              </div>
            )}
            {event.facility && (
              <div className="text-[11px]" style={{ color: tokens.textMuted }}>
                Facility: {event.facility}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
