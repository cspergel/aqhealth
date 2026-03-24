import { tokens } from "../../lib/tokens";

const variants = {
  default: { bg: tokens.surfaceAlt, color: tokens.textSecondary, border: tokens.border },
  green: { bg: tokens.accentSoft, color: tokens.accentText, border: "#bbf7d0" },
  amber: { bg: tokens.amberSoft, color: "#92400e", border: "#fde68a" },
  red: { bg: tokens.redSoft, color: "#991b1b", border: "#fecaca" },
  blue: { bg: tokens.blueSoft, color: "#1e40af", border: "#bfdbfe" },
} as const;

interface TagProps {
  children: React.ReactNode;
  variant?: keyof typeof variants;
}

export function Tag({ children, variant = "default" }: TagProps) {
  const s = variants[variant];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      {children}
    </span>
  );
}
