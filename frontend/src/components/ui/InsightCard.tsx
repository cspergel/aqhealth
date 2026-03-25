import api from "../../lib/api";
import { tokens } from "../../lib/tokens";

function trackInteraction(type: string, targetType: string, targetId?: number, meta?: Record<string, unknown>) {
  api.post("/api/learning/track", {
    interaction_type: type,
    target_type: targetType,
    target_id: targetId ?? null,
    page_context: window.location.pathname,
    metadata: meta ?? null,
  }).catch(() => {}); // fire-and-forget
}

interface InsightCardProps {
  id?: number;
  title: string;
  description: string;
  impact?: string;
  category: "revenue" | "cost" | "quality" | "provider" | "trend";
  onDismiss?: () => void;
  onBookmark?: () => void;
}

const categoryColors = {
  revenue: { bg: tokens.accentSoft, border: "#bbf7d0", accent: tokens.accentText },
  cost: { bg: tokens.amberSoft, border: "#fde68a", accent: "#92400e" },
  quality: { bg: tokens.blueSoft, border: "#bfdbfe", accent: "#1e40af" },
  provider: { bg: tokens.surfaceAlt, border: tokens.border, accent: tokens.textSecondary },
  trend: { bg: tokens.redSoft, border: "#fecaca", accent: "#991b1b" },
};

export function InsightCard({ id, title, description, impact, category, onDismiss, onBookmark }: InsightCardProps) {
  const colors = categoryColors[category];

  const handleDismiss = () => {
    trackInteraction("dismiss", "insight", id, { category, title });
    onDismiss?.();
  };

  const handleBookmark = () => {
    trackInteraction("bookmark", "insight", id, { category, title });
    onBookmark?.();
  };

  return (
    <div
      className="rounded-[10px] p-4"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <div className="text-[13px] font-semibold mb-1" style={{ color: colors.accent }}>{title}</div>
      <div className="text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>{description}</div>
      {impact && (
        <div className="text-[13px] font-semibold mt-2" style={{ color: colors.accent }}>{impact}</div>
      )}
      {(onDismiss || onBookmark) && (
        <div className="flex gap-2 mt-3">
          {onBookmark && (
            <button
              onClick={handleBookmark}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: tokens.border, color: tokens.accentText }}
            >
              Bookmark
            </button>
          )}
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: tokens.border, color: tokens.textMuted }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
