import { tokens } from "../../lib/tokens";

interface FollowUpBadgeProps {
  followUpDate: string | null;
  followUpCompleted: boolean;
}

/**
 * Small badge showing follow-up status:
 * - Green: follow-up completed
 * - Amber: follow-up due within 7 days
 * - Red: follow-up overdue
 */
export function FollowUpBadge({ followUpDate, followUpCompleted }: FollowUpBadgeProps) {
  if (!followUpDate) return null;

  const due = new Date(followUpDate);
  const now = new Date();
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let color: string;
  let bgColor: string;
  let label: string;

  if (followUpCompleted) {
    color = tokens.accentText;
    bgColor = tokens.accentSoft;
    label = "Completed";
  } else if (daysUntilDue < 0) {
    color = tokens.red;
    bgColor = tokens.redSoft;
    label = `${Math.abs(daysUntilDue)}d overdue`;
  } else if (daysUntilDue <= 7) {
    color = tokens.amber;
    bgColor = tokens.amberSoft;
    label = daysUntilDue === 0 ? "Due today" : `Due in ${daysUntilDue}d`;
  } else {
    color = tokens.textMuted;
    bgColor = tokens.surfaceAlt;
    label = `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        padding: "2px 7px",
        borderRadius: 9999,
        color,
        background: bgColor,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
