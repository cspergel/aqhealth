import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";
import { ScenarioCard, type PrebuiltScenario } from "../components/scenarios/ScenarioCard";
import { ScenarioBuilder } from "../components/scenarios/ScenarioBuilder";
import { ScenarioResults } from "../components/scenarios/ScenarioResults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioResult {
  scenario_name: string;
  scenario_type: string;
  current_state: Record<string, unknown>;
  projected_state: Record<string, unknown>;
  financial_impact: Record<string, number>;
  timeline: string;
  assumptions: string[];
  confidence: number;
}

type Tab = "prebuilt" | "custom";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScenariosPage() {
  const [tab, setTab] = useState<Tab>("prebuilt");
  const [prebuilt, setPrebuilt] = useState<PrebuiltScenario[]>([]);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/scenarios/prebuilt")
      .then((res) => setPrebuilt(res.data))
      .catch((err) => console.error("Failed to load scenarios:", err))
      .finally(() => setInitialLoading(false));
  }, []);

  const runScenario = (type: string, params: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    api.post("/api/scenarios/run", { type, params })
      .then((res) => setResult(res.data as ScenarioResult))
      .catch((err) => {
        console.error("Failed to run scenario:", err);
        setError("Failed to run scenario. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  const runPrebuilt = (scenario: PrebuiltScenario) => {
    runScenario(scenario.type, scenario.default_params);
  };

  return (
    <div className="px-7 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold tracking-tight mb-1"
          style={{ fontFamily: fonts.heading, color: tokens.text }}
        >
          What-If Scenarios
        </h1>
        <p className="text-[13px]" style={{ color: tokens.textMuted }}>
          Model financial, quality, and operational impacts before taking action
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: tokens.border }}>
        <button
          onClick={() => setTab("prebuilt")}
          className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px"
          style={{
            color: tab === "prebuilt" ? tokens.text : tokens.textMuted,
            borderBottomColor: tab === "prebuilt" ? tokens.accent : "transparent",
          }}
        >
          Pre-built Scenarios
        </button>
        <button
          onClick={() => setTab("custom")}
          className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px"
          style={{
            color: tab === "custom" ? tokens.text : tokens.textMuted,
            borderBottomColor: tab === "custom" ? tokens.accent : "transparent",
          }}
        >
          Custom Scenario
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg p-4 mb-4 text-[13px]" style={{ background: tokens.redSoft, color: tokens.red }}>
          {error}
        </div>
      )}

      {/* =================== PRE-BUILT =================== */}
      {tab === "prebuilt" && (
        <div>
          {/* Scenario cards grid */}
          {initialLoading ? (
            <div className="py-20 text-center text-[13px]" style={{ color: tokens.textMuted }}>
              Loading scenarios...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {prebuilt.map((s) => (
                <ScenarioCard key={s.id} scenario={s} onRun={runPrebuilt} />
              ))}
            </div>
          )}

          {/* Results */}
          {loading && (
            <div className="py-12 text-center text-[13px]" style={{ color: tokens.textMuted }}>
              Running scenario...
            </div>
          )}

          {!loading && result && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 rounded-full" style={{ background: tokens.accent }} />
                <h2 className="text-[15px] font-semibold" style={{ fontFamily: fonts.heading, color: tokens.text }}>
                  Scenario Results
                </h2>
              </div>
              <ScenarioResults result={result} />
            </div>
          )}
        </div>
      )}

      {/* =================== CUSTOM =================== */}
      {tab === "custom" && (
        <div className="grid grid-cols-5 gap-6">
          {/* Builder (left) */}
          <div className="col-span-2">
            <ScenarioBuilder onRun={runScenario} loading={loading} />
          </div>

          {/* Results (right) */}
          <div className="col-span-3">
            {loading && (
              <div className="py-20 text-center text-[13px]" style={{ color: tokens.textMuted }}>
                Running scenario...
              </div>
            )}

            {!loading && result && <ScenarioResults result={result} />}

            {!loading && !result && (
              <div
                className="rounded-[10px] border p-12 text-center"
                style={{ borderColor: tokens.border, background: tokens.surface }}
              >
                <div className="text-4xl mb-3" style={{ color: tokens.textMuted }}>
                  ?
                </div>
                <h3 className="text-[14px] font-medium mb-1" style={{ color: tokens.textSecondary }}>
                  No scenario results yet
                </h3>
                <p className="text-[12px]" style={{ color: tokens.textMuted }}>
                  Configure a scenario and click "Run Scenario" to see projected impact.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
