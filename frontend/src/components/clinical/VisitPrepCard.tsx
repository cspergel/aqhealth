import { tokens, fonts } from "../../lib/tokens";

interface VisitPrepCardProps {
  narrative: string;
}

export function VisitPrepCard({ narrative }: VisitPrepCardProps) {
  // Split narrative into sentences for paragraph-style display
  const sentences = narrative.split(". ").filter(Boolean);
  const paragraphs: string[] = [];

  // Group ~2 sentences per paragraph
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(". ");
    paragraphs.push(chunk.endsWith(".") ? chunk : chunk + ".");
  }

  return (
    <div
      style={{
        background: tokens.accentSoft,
        borderRadius: 10,
        border: "1px solid #bbf7d0",
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: tokens.accentText,
          marginBottom: 10,
          fontFamily: fonts.body,
        }}
      >
        Visit Focus
      </div>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            fontSize: 13,
            color: tokens.textSecondary,
            lineHeight: 1.7,
            margin: i < paragraphs.length - 1 ? "0 0 8px" : 0,
            fontFamily: fonts.body,
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}
