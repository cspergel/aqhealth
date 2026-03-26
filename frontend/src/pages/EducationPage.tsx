import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EducationModule {
  id: number;
  title: string;
  description: string;
  category: string;
  estimated_minutes: number;
  relevance_score: number | null;
  completed: boolean;
  completed_date: string | null;
}

type Tab = "recommendations" | "library";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EducationPage() {
  const [tab, setTab] = useState<Tab>("recommendations");
  const [recommendations, setRecommendations] = useState<EducationModule[]>([]);
  const [library, setLibrary] = useState<EducationModule[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(8);
  const [loading, setLoading] = useState(true);

  const providers = [
    { id: 8, name: "Dr. Robert Kim" },
    { id: 9, name: "Dr. David Wilson" },
    { id: 7, name: "Dr. Karen Murphy" },
  ];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/education/recommendations", { params: { provider_id: selectedProvider } }),
      api.get("/api/education/library"),
    ])
      .then(([recRes, libRes]) => {
        setRecommendations(recRes.data);
        setLibrary(libRes.data);
      })
      .catch((err) => console.error("Failed to load education data:", err))
      .finally(() => setLoading(false));
  }, [selectedProvider]);

  const handleComplete = (moduleId: number) => {
    api.post("/api/education/complete", { provider_id: selectedProvider, module_id: moduleId })
      .then(() => {
        setRecommendations((prev) => prev.map((m) =>
          m.id === moduleId ? { ...m, completed: true, completed_date: new Date().toISOString().split("T")[0] } : m
        ));
        setLibrary((prev) => prev.map((m) =>
          m.id === moduleId ? { ...m, completed: true, completed_date: new Date().toISOString().split("T")[0] } : m
        ));
      })
      .catch((err) => console.error("Failed to record completion:", err));
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13, padding: "6px 14px", borderRadius: 8,
    fontWeight: active ? 600 : 400, color: active ? tokens.text : tokens.textMuted,
    background: active ? tokens.surface : "transparent",
    border: active ? `1px solid ${tokens.border}` : "1px solid transparent",
    cursor: "pointer", transition: "all 0.15s", fontFamily: fonts.body,
  });

  const categoryColor = (cat: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      Coding: { bg: tokens.blueSoft, color: tokens.blue },
      Quality: { bg: tokens.accentSoft, color: tokens.accentText },
      Revenue: { bg: tokens.amberSoft, color: tokens.amber },
    };
    return map[cat] || { bg: tokens.surfaceAlt, color: tokens.textMuted };
  };

  const moduleCard = (mod: EducationModule, showRelevance: boolean) => (
    <div
      key={mod.id}
      style={{
        background: tokens.surface, border: `1px solid ${mod.completed ? tokens.accent : tokens.border}`,
        borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, ...categoryColor(mod.category) }}>
            {mod.category}
          </span>
          {mod.completed && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, background: tokens.accentSoft, color: tokens.accentText }}>
              Completed
            </span>
          )}
        </div>
        {showRelevance && mod.relevance_score && (
          <span style={{ fontSize: 11, fontWeight: 600, color: mod.relevance_score >= 90 ? tokens.red : tokens.amber }}>
            {mod.relevance_score}% relevant
          </span>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
          {mod.title}
        </h3>
        <p style={{ fontSize: 12, color: tokens.textSecondary, lineHeight: 1.5, margin: 0 }}>
          {mod.description}
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
        <span style={{ fontSize: 12, color: tokens.textMuted }}>{mod.estimated_minutes} min</span>
        {mod.completed ? (
          <span style={{ fontSize: 12, color: tokens.accentText, fontWeight: 500 }}>
            Completed {mod.completed_date}
          </span>
        ) : (
          <button
            onClick={() => handleComplete(mod.id)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 8,
              border: `1px solid ${tokens.accent}`, background: tokens.accentSoft,
              color: tokens.accentText, cursor: "pointer",
            }}
          >
            Mark Complete
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading education data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        Provider Education
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 20 }}>
        Targeted education modules based on provider coding patterns and performance gaps.
      </p>

      {/* Tabs + provider selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={tabStyle(tab === "recommendations")} onClick={() => setTab("recommendations")}>Recommendations</button>
          <button style={tabStyle(tab === "library")} onClick={() => setTab("library")}>Full Library</button>
        </div>
        {tab === "recommendations" && (
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(parseInt(e.target.value))}
            style={{
              fontSize: 12, padding: "6px 10px", borderRadius: 6,
              border: `1px solid ${tokens.border}`, background: tokens.surface,
              color: tokens.text, fontFamily: fonts.body,
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "recommendations" && (
        <>
          <div style={{ background: tokens.blueSoft, border: `1px solid ${tokens.blue}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: tokens.blue }}>
              Based on <strong>{providers.find((p) => p.id === selectedProvider)?.name}</strong>'s coding patterns, these modules address their specific gaps.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {recommendations.map((mod) => moduleCard(mod, true))}
          </div>
        </>
      )}

      {tab === "library" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {library.map((mod) => moduleCard(mod, false))}
        </div>
      )}
    </div>
  );
}
