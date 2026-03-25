import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrebuiltScenario {
  id: string;
  name: string;
  description: string;
  type: string;
  icon: string;
  default_params: Record<string, unknown>;
  category: string;
}

interface ScenarioCardProps {
  scenario: PrebuiltScenario;
  onRun: (scenario: PrebuiltScenario) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  revenue: { bg: tokens.accentSoft, text: tokens.accentText, border: tokens.accent },
  cost: { bg: tokens.blueSoft, text: tokens.blue, border: tokens.blue },
  quality: { bg: tokens.amberSoft, text: tokens.amber, border: tokens.amber },
  provider: { bg: "#f3e8ff", text: "#7c3aed", border: "#7c3aed" },
};

const ICON_MAP: Record<string, string> = {
  "trending-up": "\u2197",
  building: "\u2302",
  "check-circle": "\u2713",
  users: "\u2694",
  scissors: "\u2702",
  "graduation-cap": "\u2605",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenarioCard({ scenario, onRun }: ScenarioCardProps) {
  const colors = CATEGORY_COLORS[scenario.category] || CATEGORY_COLORS.revenue;

  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col justify-between hover:shadow-sm transition-shadow cursor-pointer"
      style={{ borderColor: tokens.border, background: tokens.surface }}
      onClick={() => onRun(scenario)}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ background: colors.bg, color: colors.text }}
          >
            {ICON_MAP[scenario.icon] || "\u27A4"}
          </div>
          <span
            className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: colors.bg, color: colors.text }}
          >
            {scenario.category}
          </span>
        </div>

        {/* Title & description */}
        <h3
          className="text-[14px] font-semibold mb-1.5"
          style={{ color: tokens.text, fontFamily: fonts.heading }}
        >
          {scenario.name}
        </h3>
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: tokens.textSecondary }}>
          {scenario.description}
        </p>
      </div>

      {/* Run button */}
      <button
        className="w-full py-2 rounded-lg text-[12px] font-medium border transition-colors hover:opacity-90"
        style={{
          background: tokens.surface,
          color: colors.text,
          borderColor: colors.border + "40",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRun(scenario);
        }}
      >
        Run with defaults
      </button>
    </div>
  );
}
