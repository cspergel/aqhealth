import { useEffect, useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccuracyPoint {
  month: string;
  accuracy: number;
  total: number;
}

interface PredictionTypeAccuracy {
  type: string;
  label: string;
  accuracy: number;
  total: number;
  confirmed: number;
}

interface Lesson {
  text: string;
  category: "improvement" | "blind_spot" | "strength";
}

interface BlindSpot {
  area: string;
  accuracy: number;
  description: string;
}

interface ImprovingArea {
  area: string;
  accuracy: number;
  trend: number; // pct improvement
  description: string;
}

interface LearningData {
  accuracy_over_time: AccuracyPoint[];
  accuracy_by_type: PredictionTypeAccuracy[];
  lessons: Lesson[];
  blind_spots: BlindSpot[];
  improving_areas: ImprovingArea[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LearningDashboard() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/learning/report")
      .then((res) => setData(res.data))
      .catch((err) => console.error("Failed to load learning data:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center text-[13px]" style={{ color: tokens.textMuted }}>
        Loading learning data...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-[13px]" style={{ color: tokens.textMuted }}>
        No learning data available yet. The system needs prediction outcomes to learn from.
      </div>
    );
  }

  const maxAccuracy = Math.max(...data.accuracy_over_time.map((p) => p.accuracy), 100);

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div
        className="rounded-lg border p-4"
        style={{ background: tokens.accentSoft, borderColor: "#bbf7d0" }}
      >
        <div className="text-[13px] font-semibold mb-1" style={{ color: tokens.accentText }}>
          System Learning Status
        </div>
        <div className="text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
          The AI has evaluated{" "}
          <span style={{ fontFamily: fonts.code, fontWeight: 600, color: tokens.text }}>
            {data.accuracy_over_time.reduce((sum, p) => sum + p.total, 0).toLocaleString()}
          </span>{" "}
          predictions and is continuously improving. Current overall accuracy:{" "}
          <span style={{ fontFamily: fonts.code, fontWeight: 600, color: tokens.accentText }}>
            {data.accuracy_over_time.length > 0
              ? data.accuracy_over_time[data.accuracy_over_time.length - 1].accuracy
              : 0}
            %
          </span>
        </div>
      </div>

      {/* Accuracy over time — simple bar chart */}
      <div
        className="rounded-lg border p-5"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <h3
          className="text-[14px] font-semibold mb-4"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Prediction Accuracy Over Time
        </h3>
        <div className="flex items-end gap-2" style={{ height: 160 }}>
          {data.accuracy_over_time.map((point, i) => {
            const height = (point.accuracy / maxAccuracy) * 140;
            return (
              <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className="text-[10px] mb-1"
                  style={{ fontFamily: fonts.code, color: tokens.textMuted }}
                >
                  {point.accuracy}%
                </div>
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height,
                    background: point.accuracy >= 70 ? tokens.accent : point.accuracy >= 50 ? tokens.amber : tokens.red,
                    minHeight: 4,
                    maxWidth: 40,
                    margin: "0 auto",
                  }}
                />
                <div
                  className="text-[10px] mt-1 truncate w-full text-center"
                  style={{ color: tokens.textMuted }}
                >
                  {point.month}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accuracy by prediction type */}
      <div
        className="rounded-lg border p-5"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <h3
          className="text-[14px] font-semibold mb-4"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          Accuracy by Prediction Type
        </h3>
        <div className="space-y-3">
          {data.accuracy_by_type.map((t) => (
            <div key={t.type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium" style={{ color: tokens.text }}>
                  {t.label}
                </span>
                <span
                  className="text-[13px] font-semibold"
                  style={{
                    fontFamily: fonts.code,
                    color: t.accuracy >= 70 ? tokens.accentText : t.accuracy >= 50 ? tokens.amber : tokens.red,
                  }}
                >
                  {t.accuracy}%
                </span>
              </div>
              <div
                className="w-full h-2 rounded-full"
                style={{ background: tokens.surfaceAlt }}
              >
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${t.accuracy}%`,
                    background: t.accuracy >= 70 ? tokens.accent : t.accuracy >= 50 ? tokens.amber : tokens.red,
                  }}
                />
              </div>
              <div
                className="text-[11px] mt-0.5"
                style={{ color: tokens.textMuted }}
              >
                {t.confirmed} confirmed / {t.total} total predictions
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two column: Lessons + Blind Spots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* What we've learned */}
        <div
          className="rounded-lg border p-5"
          style={{ background: tokens.surface, borderColor: tokens.border }}
        >
          <h3
            className="text-[14px] font-semibold mb-3"
            style={{ fontFamily: fonts.heading, color: tokens.text }}
          >
            What the System Has Learned
          </h3>
          <div className="space-y-3">
            {data.lessons.map((lesson, i) => {
              const iconColor =
                lesson.category === "strength"
                  ? tokens.accentText
                  : lesson.category === "blind_spot"
                  ? tokens.amber
                  : tokens.blue;
              const bgColor =
                lesson.category === "strength"
                  ? tokens.accentSoft
                  : lesson.category === "blind_spot"
                  ? tokens.amberSoft
                  : tokens.blueSoft;
              return (
                <div
                  key={i}
                  className="rounded-md p-3 text-[13px] leading-relaxed"
                  style={{ background: bgColor, color: tokens.textSecondary }}
                >
                  <span style={{ color: iconColor, fontWeight: 600 }}>
                    {lesson.category === "strength"
                      ? "Strength: "
                      : lesson.category === "blind_spot"
                      ? "Watch: "
                      : "Learning: "}
                  </span>
                  {lesson.text}
                </div>
              );
            })}
          </div>
        </div>

        {/* Blind spots + Improving */}
        <div className="space-y-5">
          {/* Blind spots */}
          <div
            className="rounded-lg border p-5"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <h3
              className="text-[14px] font-semibold mb-3"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Known Blind Spots
            </h3>
            {data.blind_spots.length === 0 ? (
              <p className="text-[13px]" style={{ color: tokens.textMuted }}>
                No significant blind spots identified yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.blind_spots.map((spot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md px-3 py-2"
                    style={{ background: tokens.amberSoft }}
                  >
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: tokens.text }}>
                        {spot.area}
                      </div>
                      <div className="text-[11px]" style={{ color: tokens.textMuted }}>
                        {spot.description}
                      </div>
                    </div>
                    <div
                      className="text-[13px] font-semibold shrink-0 ml-3"
                      style={{ fontFamily: fonts.code, color: tokens.amber }}
                    >
                      {spot.accuracy}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Getting better at */}
          <div
            className="rounded-lg border p-5"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <h3
              className="text-[14px] font-semibold mb-3"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              Getting Better At
            </h3>
            {data.improving_areas.length === 0 ? (
              <p className="text-[13px]" style={{ color: tokens.textMuted }}>
                Not enough data to identify improvement trends yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.improving_areas.map((area, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md px-3 py-2"
                    style={{ background: tokens.accentSoft }}
                  >
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: tokens.text }}>
                        {area.area}
                      </div>
                      <div className="text-[11px]" style={{ color: tokens.textMuted }}>
                        {area.description}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div
                        className="text-[13px] font-semibold"
                        style={{ fontFamily: fonts.code, color: tokens.accentText }}
                      >
                        {area.accuracy}%
                      </div>
                      <div
                        className="text-[10px]"
                        style={{ color: tokens.accentText }}
                      >
                        +{area.trend}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
