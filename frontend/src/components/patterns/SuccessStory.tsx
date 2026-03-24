import { tokens, fonts } from "../../lib/tokens";

export interface SuccessStoryData {
  id: string;
  title: string;
  description: string;
  metric_label: string;
  before_value: string;
  after_value: string;
  improvement: string;
  provider_name: string;
  office_name: string;
  intervention: string;
  timeline: string;
  member_count: number;
  total_value: number;
}

export function SuccessStory({ story }: { story: SuccessStoryData }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      {/* Title & attribution */}
      <h3
        className="text-[14px] font-semibold mb-1"
        style={{ fontFamily: fonts.heading, color: tokens.text }}
      >
        {story.title}
      </h3>
      <p className="text-[12px] mb-4" style={{ color: tokens.textMuted }}>
        {story.provider_name} &middot; {story.office_name} &middot; {story.timeline}
      </p>

      {/* Description */}
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: tokens.textSecondary }}>
        {story.description}
      </p>

      {/* Before / After timeline */}
      <div
        className="flex items-center gap-4 rounded-md px-4 py-3 mb-4"
        style={{ background: tokens.surfaceAlt }}
      >
        <div className="flex-1 text-center">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            Before
          </div>
          <div className="text-[18px] font-bold" style={{ color: tokens.textSecondary }}>
            {story.before_value}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div
            className="w-8 h-0.5 rounded"
            style={{ background: tokens.accent }}
          />
          <div className="text-[11px] font-semibold" style={{ color: tokens.accentText }}>
            {story.improvement}
          </div>
          <div
            className="w-8 h-0.5 rounded"
            style={{ background: tokens.accent }}
          />
        </div>
        <div className="flex-1 text-center">
          <div className="text-[11px] font-medium mb-0.5" style={{ color: tokens.textMuted }}>
            After
          </div>
          <div className="text-[18px] font-bold" style={{ color: tokens.accentText }}>
            {story.after_value}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[12px]">
        <div>
          <span style={{ color: tokens.textMuted }}>Intervention: </span>
          <span className="font-medium" style={{ color: tokens.text }}>{story.intervention}</span>
        </div>
        <div className="w-px h-3" style={{ background: tokens.border }} />
        <div>
          <span style={{ color: tokens.textMuted }}>Members: </span>
          <span className="font-medium" style={{ color: tokens.text }}>{story.member_count}</span>
        </div>
        <div className="w-px h-3" style={{ background: tokens.border }} />
        <div>
          <span style={{ color: tokens.textMuted }}>Value: </span>
          <span className="font-semibold" style={{ color: tokens.accentText }}>
            ${story.total_value.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
