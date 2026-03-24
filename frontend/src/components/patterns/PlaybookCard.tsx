import { tokens, fonts } from "../../lib/tokens";

export interface Playbook {
  id: string;
  title: string;
  target_audience: string;
  steps: string[];
  expected_impact: string;
  expected_dollar_value: number;
  evidence: string;
  category: string;
}

export function PlaybookCard({ playbook }: { playbook: Playbook }) {
  const categoryColors: Record<string, { bg: string; text: string }> = {
    coding: { bg: tokens.blueSoft, text: tokens.blue },
    documentation: { bg: tokens.amberSoft, text: tokens.amber },
    screening: { bg: tokens.accentSoft, text: tokens.accentText },
  };
  const cat = categoryColors[playbook.category] || categoryColors.coding;

  return (
    <div
      className="rounded-lg border p-6"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3
            className="text-[15px] font-semibold mb-1.5"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            {playbook.title}
          </h3>
          <span
            className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full"
            style={{ background: cat.bg, color: cat.text }}
          >
            {playbook.target_audience}
          </span>
        </div>
        <span
          className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full uppercase tracking-wide"
          style={{ background: cat.bg, color: cat.text }}
        >
          {playbook.category}
        </span>
      </div>

      {/* Steps */}
      <ol className="space-y-2 mb-5">
        {playbook.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[13px]" style={{ color: tokens.text }}>
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold mt-0.5"
              style={{ background: tokens.accentSoft, color: tokens.accentText }}
            >
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>

      {/* Expected impact */}
      <div
        className="rounded-md px-4 py-3 mb-4"
        style={{ background: tokens.accentSoft }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: tokens.textSecondary }}>
            Expected Impact
          </span>
        </div>
        <p
          className="text-[14px] font-semibold mt-0.5"
          style={{ color: tokens.accentText }}
        >
          {playbook.expected_impact}
        </p>
      </div>

      {/* Evidence */}
      <p className="text-[12px] leading-relaxed" style={{ color: tokens.textMuted }}>
        {playbook.evidence}
      </p>
    </div>
  );
}
