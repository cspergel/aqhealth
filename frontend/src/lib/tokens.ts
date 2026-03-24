// CANONICAL DESIGN TOKENS — from design-reset.jsx
// See: docs/plans/2026-03-24-platform-architecture-design.md Section 4

export const tokens = {
  // Backgrounds
  bg: "#fafaf9",
  surface: "#ffffff",
  surfaceAlt: "#f5f5f4",

  // Borders
  border: "#e7e5e4",
  borderSoft: "#f0eeec",

  // Text
  text: "#1c1917",
  textSecondary: "#57534e",
  textMuted: "#a8a29e",

  // Accent — green is the ONLY primary accent
  accent: "#16a34a",
  accentSoft: "#dcfce7",
  accentText: "#15803d",

  // Semantic colors — used sparingly
  blue: "#2563eb",
  blueSoft: "#dbeafe",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  red: "#dc2626",
  redSoft: "#fee2e2",
} as const;

export const fonts = {
  heading: "'Instrument Sans', 'General Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'Berkeley Mono', 'SF Mono', 'JetBrains Mono', monospace",
} as const;
