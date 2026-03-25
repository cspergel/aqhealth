import { useState, useCallback } from "react";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";
import { CaptureButton } from "./CaptureButton";
import { VisitPrepCard } from "./VisitPrepCard";
import type { ClinicalPatientContext, ClinicalSuspect, ClinicalCareGap } from "../../lib/mockData";
import api from "../../lib/api";

interface PatientContextProps {
  patient: ClinicalPatientContext;
  onBack?: () => void;
}

const tierColors: Record<string, "red" | "amber" | "blue" | "default"> = {
  complex: "red",
  high: "amber",
  rising: "blue",
  low: "default",
};

export function PatientContext({ patient, onBack }: PatientContextProps) {
  const [capturedIds, setCapturedIds] = useState<Set<number>>(new Set());
  const [closedGapIds, setClosedGapIds] = useState<Set<number>>(new Set());
  const [rafDelta, setRafDelta] = useState(0);

  const totalRAF = patient.raf.projected_raf + rafDelta;
  const interactionTotal = patient.interactions.reduce((s, i) => s + i.bonus_raf, 0);

  const handleCaptured = useCallback((suspectId: number, rafValue: number) => {
    setCapturedIds((prev) => new Set(prev).add(suspectId));
    setRafDelta((prev) => prev + rafValue);
  }, []);

  const handleCloseGap = useCallback(async (gap: ClinicalCareGap) => {
    try {
      await api.post("/api/clinical/close-gap", {
        member_id: patient.demographics.id,
        gap_id: gap.id,
      });
      setClosedGapIds((prev) => new Set(prev).add(gap.id));
    } catch {
      // ignore
    }
  }, [patient.demographics.id]);

  const { demographics: demo, raf } = patient;

  return (
    <div style={{ fontFamily: fonts.body, color: tokens.text }}>
      {/* Patient header */}
      <div
        style={{
          background: tokens.surface,
          borderBottom: `1px solid ${tokens.border}`,
          padding: "20px 28px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{
                    background: "none",
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 12,
                    color: tokens.textSecondary,
                    cursor: "pointer",
                  }}
                >
                  &larr; Back
                </button>
              )}
              <h1
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.03em",
                  color: tokens.text,
                }}
              >
                {demo.name}
              </h1>
              <Tag variant={tierColors[patient.risk.tier] || "default"}>
                {patient.risk.tier} risk
              </Tag>
            </div>
            <div
              style={{
                fontSize: 13,
                color: tokens.textSecondary,
                marginTop: 4,
                display: "flex",
                gap: 16,
              }}
            >
              <span>{demo.age}{demo.gender}</span>
              <span>DOB {demo.dob}</span>
              {demo.room && <span>Rm {demo.room}</span>}
              <span>{demo.insurance}</span>
              <span>PCP: {demo.pcp}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 32, alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 500, marginBottom: 4 }}>
                Current RAF
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontFamily: fonts.code,
                  fontWeight: 600,
                  color: tokens.text,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {raf.total_raf.toFixed(3)}
              </div>
            </div>

            <div style={{ fontSize: 18, color: tokens.textMuted, marginBottom: 4 }}>&rarr;</div>

            <div>
              <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 500, marginBottom: 4 }}>
                Projected
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontFamily: fonts.code,
                  fontWeight: 600,
                  color: tokens.text,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {(raf.projected_raf + rafDelta).toFixed(3)}
              </div>
              <div style={{ fontSize: 12, color: tokens.accentText, fontWeight: 500, marginTop: 4 }}>
                +{(raf.delta + rafDelta).toFixed(3)} uplift
              </div>
            </div>

            <div style={{ borderLeft: `1px solid ${tokens.border}`, paddingLeft: 24, marginLeft: 8 }}>
              <div style={{ fontSize: 12, color: tokens.textMuted, fontWeight: 500, marginBottom: 4 }}>
                Annualized value
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontFamily: fonts.code,
                  fontWeight: 600,
                  color: tokens.text,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                ${Math.round(totalRAF * 11000).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ padding: "24px 28px", borderRight: `1px solid ${tokens.border}` }}>
          {/* Visit Prep */}
          <VisitPrepCard narrative={patient.visit_prep} />

          {/* Suspect HCC Panel */}
          {patient.suspects.length > 0 && (
            <div
              style={{
                padding: 16,
                background: tokens.accentSoft,
                borderRadius: 10,
                border: "1px solid #bbf7d0",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: tokens.accentText,
                  marginBottom: 10,
                }}
              >
                Conditions supported by clinical evidence &mdash; review for documentation
              </div>
              {patient.suspects.map((s: ClinicalSuspect, i: number) => {
                const isCaptured = capturedIds.has(s.id) || s.captured;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderTop: i > 0 ? "1px solid #bbf7d0" : "none",
                      opacity: isCaptured ? 0.6 : 1,
                      background: isCaptured ? "#f0fdf4" : "transparent",
                      borderRadius: isCaptured ? 6 : 0,
                      paddingLeft: isCaptured ? 8 : 0,
                      paddingRight: isCaptured ? 8 : 0,
                      transition: "all 300ms ease",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: tokens.text }}>
                        {s.condition_name}{" "}
                        <span style={{ fontFamily: fonts.code, fontSize: 12, color: tokens.textMuted }}>
                          {s.icd10_code}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <Tag variant="green">HCC {s.hcc_code}</Tag>
                        <span style={{ fontFamily: fonts.code, fontSize: 12, color: tokens.accentText }}>
                          +{s.raf_value.toFixed(3)} &middot; ${s.annual_value.toLocaleString()}/yr
                        </span>
                        <span style={{ fontSize: 11, color: tokens.textMuted }}>
                          {s.confidence}% confidence
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 4 }}>
                        {s.evidence_summary}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, marginLeft: 12 }}>
                      {isCaptured ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: tokens.accentSoft,
                            color: tokens.accent,
                            fontSize: 16,
                          }}
                        >
                          &#10003;
                        </span>
                      ) : (
                        <CaptureButton
                          memberId={patient.demographics.id}
                          suspectId={s.id}
                          rafValue={s.raf_value}
                          onCaptured={handleCaptured}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Medication Review */}
          <div
            style={{
              background: tokens.surface,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted, marginBottom: 12 }}>
              Medication Review
            </div>
            {patient.medications.map((med, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom:
                    i < patient.medications.length - 1
                      ? `1px solid ${tokens.borderSoft}`
                      : "none",
                }}
              >
                <div>
                  <span style={{ fontSize: 14, color: tokens.text }}>{med.drug_name}</span>
                  {med.inferred_diagnosis && (
                    <span style={{ fontSize: 11, color: tokens.textMuted, marginLeft: 8 }}>
                      ({med.inferred_diagnosis})
                    </span>
                  )}
                </div>
                {med.has_matching_dx ? (
                  <Tag variant="green">Dx linked</Tag>
                ) : (
                  <Tag variant="amber">No matching dx</Tag>
                )}
              </div>
            ))}
            {patient.medications.every((m) => m.has_matching_dx) && (
              <div style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted }}>
                All medications have corresponding diagnoses documented.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (sidebar) */}
        <div style={{ padding: "24px 20px", background: tokens.surfaceAlt, overflow: "auto" }}>
          {/* RAF Summary */}
          <div
            style={{
              background: tokens.surface,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted, marginBottom: 12 }}>
              Risk Score Summary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Base conditions</div>
                <div style={{ fontFamily: fonts.code, fontSize: 20, fontWeight: 600, color: tokens.text }}>
                  {(totalRAF - interactionTotal).toFixed(3)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Interaction bonuses</div>
                <div style={{ fontFamily: fonts.code, fontSize: 20, fontWeight: 600, color: tokens.accent }}>
                  +{interactionTotal.toFixed(3)}
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${tokens.border}`, marginTop: 12, paddingTop: 12 }}>
              {patient.interactions.map((ix, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "3px 0",
                    color: tokens.textSecondary,
                  }}
                >
                  <span>{ix.name}</span>
                  <span style={{ fontFamily: fonts.code, color: tokens.accent }}>
                    +{ix.bonus_raf.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirmed HCCs */}
          <div
            style={{
              background: tokens.surface,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted }}>
                Documented HCCs
              </span>
              <span style={{ fontFamily: fonts.code, fontSize: 12, color: tokens.accentText }}>
                {patient.confirmed_hccs.length} conditions
              </span>
            </div>
            {patient.confirmed_hccs.map((hcc, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
                    {hcc.condition_name.length > 35
                      ? hcc.condition_name.substring(0, 35) + "..."
                      : hcc.condition_name}
                  </div>
                  <div style={{ fontFamily: fonts.code, fontSize: 11, color: tokens.textMuted }}>
                    {hcc.icd10_code} &rarr; HCC {hcc.hcc_code}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: fonts.code,
                    fontSize: 12,
                    fontWeight: 600,
                    color: tokens.textSecondary,
                  }}
                >
                  {hcc.raf_value.toFixed(3)}
                </span>
              </div>
            ))}
          </div>

          {/* Open Care Gaps */}
          <div
            style={{
              background: tokens.surface,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted }}>
                Open care gaps
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: tokens.amber }}>
                {patient.care_gaps.filter((g) => !closedGapIds.has(g.id) && !g.closed).length}
              </span>
            </div>
            {patient.care_gaps.map((gap: ClinicalCareGap, i: number) => {
              const isClosed = closedGapIds.has(gap.id) || gap.closed;
              if (isClosed) return null;
              return (
                <div
                  key={gap.id}
                  style={{
                    padding: "8px 0",
                    borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
                      {gap.measure_name}
                    </span>
                    <Tag variant="amber">{gap.measure_code}</Tag>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>
                      {gap.stars_weight >= 3
                        ? `Star ${"*".repeat(gap.stars_weight)} (${gap.stars_weight}x weight)`
                        : `Star ${"*".repeat(gap.stars_weight)}`}
                    </span>
                    <button
                      onClick={() => handleCloseGap(gap)}
                      style={{
                        background: "none",
                        border: `1px solid ${tokens.border}`,
                        borderRadius: 5,
                        padding: "3px 10px",
                        fontSize: 11,
                        color: tokens.textSecondary,
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      {gap.recommended_action}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Encounters */}
          <div
            style={{
              background: tokens.surface,
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted, marginBottom: 12 }}>
              Recent Encounters
            </div>
            {patient.encounters.slice(0, 5).map((enc, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 0",
                  borderTop: i > 0 ? `1px solid ${tokens.borderSoft}` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: fonts.code, fontSize: 12, color: tokens.textSecondary }}>
                    {enc.date}
                  </span>
                  <Tag variant={enc.type === "inpatient" ? "red" : enc.type === "ed_observation" ? "amber" : "default"}>
                    {enc.type === "ed_observation" ? "ED/Obs" : enc.type}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 2 }}>
                  {enc.facility} &middot; {enc.provider}
                </div>
              </div>
            ))}
          </div>

          {/* Near-miss interactions */}
          {patient.near_misses.length > 0 && (
            <div
              style={{
                background: tokens.surface,
                borderRadius: 10,
                border: `1px solid ${tokens.border}`,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: tokens.textMuted, marginBottom: 8 }}>
                Nearby interaction opportunity
              </div>
              {patient.near_misses.map((nm, i) => (
                <div
                  key={i}
                  style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.6, marginBottom: i < patient.near_misses.length - 1 ? 8 : 0 }}
                >
                  Documenting conditions for{" "}
                  <span style={{ fontWeight: 500, color: tokens.text }}>{nm.name}</span> would
                  trigger an interaction bonus worth{" "}
                  <span style={{ fontFamily: fonts.code, fontWeight: 600, color: tokens.accent }}>
                    +{nm.potential_raf.toFixed(3)} RAF
                  </span>
                  . Missing: {nm.missing}.
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
