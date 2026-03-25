import { useState, useEffect, useRef } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface DataPoint {
  label: string;
  value: string;
}

interface RelatedMember {
  id: string;
  name: string;
  reason: string;
}

interface QueryAnswer {
  answer: string;
  data_points: DataPoint[];
  related_members: RelatedMember[];
  recommended_actions: string[];
  follow_up_questions: string[];
}

export function AskBar({ pageContext }: { pageContext: string }) {
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<QueryAnswer | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions when context changes
  useEffect(() => {
    api
      .get("/api/query/suggestions", { params: { context: pageContext } })
      .then((r) => setSuggestions(r.data))
      .catch(() => {});
  }, [pageContext]);

  async function handleAsk(q?: string) {
    const text = q || question;
    if (!text.trim()) return;
    setQuestion(text);
    setExpanded(true);
    setLoading(true);
    setAnswer(null);

    // Track the question for learning
    api.post("/api/learning/track", {
      interaction_type: "ask_question",
      target_type: "query",
      target_id: null,
      page_context: pageContext,
      metadata: { question: text },
    }).catch(() => {});

    try {
      const res = await api.post("/api/query/ask", {
        question: text,
        page_context: pageContext,
      });
      setAnswer(res.data);
    } catch {
      setAnswer({
        answer: "Sorry, something went wrong. Please try again.",
        data_points: [],
        related_members: [],
        recommended_actions: [],
        follow_up_questions: [],
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAsk();
    if (e.key === "Escape") {
      setExpanded(false);
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  function collapse() {
    setExpanded(false);
    setAnswer(null);
    setQuestion("");
  }

  const showSuggestions = focused && !question && !expanded && suggestions.length > 0;

  return (
    <div
      className="sticky bottom-0 z-40 w-full"
      style={{ fontFamily: fonts.body }}
    >
      {/* Suggestion chips */}
      {showSuggestions && (
        <div
          className="max-w-[1440px] mx-auto px-7 pb-2 flex flex-wrap gap-2"
        >
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleAsk(s)}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-green-300"
              style={{
                background: tokens.accentSoft,
                color: tokens.accentText,
                borderColor: tokens.accentSoft,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Answer panel */}
      {expanded && (
        <div
          ref={panelRef}
          className="max-w-[1440px] mx-auto px-7 pb-3"
        >
          <div
            className="rounded-xl border p-5 shadow-lg"
            style={{
              background: tokens.surface,
              borderColor: tokens.border,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: tokens.textMuted }}
              >
                AI Answer
              </span>
              <button
                onClick={collapse}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: tokens.textMuted }}
              >
                Close
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: tokens.accent }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: tokens.accent, animationDelay: "0.2s" }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: tokens.accent, animationDelay: "0.4s" }}
                />
                <span className="text-sm ml-2" style={{ color: tokens.textMuted }}>
                  Analyzing your data...
                </span>
              </div>
            ) : answer ? (
              <div className="space-y-4">
                {/* Narrative answer */}
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: tokens.text }}
                >
                  {answer.answer}
                </div>

                {/* Data points */}
                {answer.data_points.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {answer.data_points.map((dp, i) => (
                      <div
                        key={i}
                        className="rounded-lg border px-3 py-2 min-w-[120px]"
                        style={{
                          background: tokens.surfaceAlt,
                          borderColor: tokens.borderSoft,
                        }}
                      >
                        <div
                          className="text-[11px] mb-0.5"
                          style={{ color: tokens.textMuted }}
                        >
                          {dp.label}
                        </div>
                        <div
                          className="text-sm font-semibold"
                          style={{ fontFamily: fonts.code, color: tokens.text }}
                        >
                          {dp.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Related members */}
                {answer.related_members.length > 0 && (
                  <div>
                    <div
                      className="text-[11px] font-medium uppercase tracking-wide mb-1.5"
                      style={{ color: tokens.textMuted }}
                    >
                      Related Members
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {answer.related_members.map((m) => (
                        <span
                          key={m.id}
                          className="text-xs px-2.5 py-1 rounded-full border cursor-pointer hover:shadow-sm transition-shadow"
                          style={{
                            borderColor: tokens.border,
                            color: tokens.blue,
                            background: tokens.surface,
                          }}
                          title={m.reason}
                        >
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended actions */}
                {answer.recommended_actions.length > 0 && (
                  <div>
                    <div
                      className="text-[11px] font-medium uppercase tracking-wide mb-1.5"
                      style={{ color: tokens.textMuted }}
                    >
                      Recommended Actions
                    </div>
                    <ul className="space-y-1">
                      {answer.recommended_actions.map((a, i) => (
                        <li
                          key={i}
                          className="text-xs flex items-start gap-2"
                          style={{ color: tokens.text }}
                        >
                          <span
                            className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: tokens.accent }}
                          />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Follow-up questions */}
                {answer.follow_up_questions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {answer.follow_up_questions.map((fq, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQuestion(fq);
                          handleAsk(fq);
                        }}
                        className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-green-300"
                        style={{
                          background: tokens.accentSoft,
                          color: tokens.accentText,
                          borderColor: tokens.accentSoft,
                        }}
                      >
                        {fq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div
        className="border-t px-7 py-2.5"
        style={{
          background: tokens.surface,
          borderColor: tokens.border,
          boxShadow: expanded ? "0 -4px 24px rgba(0,0,0,0.06)" : "0 -1px 4px rgba(0,0,0,0.03)",
        }}
      >
        <div className="max-w-[1440px] mx-auto flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: tokens.accent }}
          />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Ask about your data..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-stone-400"
            style={{ color: tokens.text }}
            disabled={loading}
          />
          <button
            onClick={() => handleAsk()}
            disabled={!question.trim() || loading}
            className="text-xs font-medium px-4 py-1.5 rounded-lg transition-opacity disabled:opacity-30"
            style={{
              background: tokens.accent,
              color: "#fff",
            }}
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
