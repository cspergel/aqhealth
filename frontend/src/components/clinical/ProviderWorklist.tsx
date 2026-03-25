import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";
import type { ClinicalWorklistItem } from "../../lib/mockData";

interface ProviderWorklistProps {
  patients: ClinicalWorklistItem[];
  onSelectPatient: (memberId: number) => void;
}

const tierColors: Record<string, "red" | "amber" | "blue" | "default" | "green"> = {
  complex: "red",
  high: "amber",
  rising: "blue",
  low: "default",
};

export function ProviderWorklist({ patients, onSelectPatient }: ProviderWorklistProps) {
  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: fonts.heading,
            fontSize: 20,
            fontWeight: 700,
            color: tokens.text,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Today&apos;s Patients
        </h2>
        <div style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
          {patients.length} patients &middot; Sorted by priority score
        </div>
      </div>

      <div
        style={{
          background: tokens.surface,
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 50px 100px 80px 80px 80px 1fr",
            gap: 0,
            padding: "10px 16px",
            borderBottom: `1px solid ${tokens.border}`,
            background: tokens.surfaceAlt,
          }}
        >
          {["Time", "Patient", "Age", "Visit Type", "RAF", "Suspects", "Gaps", "Priority"].map(
            (h) => (
              <div
                key={h}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: tokens.textMuted,
                }}
              >
                {h}
              </div>
            ),
          )}
        </div>

        {/* Rows */}
        {patients.map((patient, i) => {
          const isHighValue = patient.priority_score > 5;
          return (
            <div
              key={patient.member_id}
              onClick={() => onSelectPatient(patient.member_id)}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 50px 100px 80px 80px 80px 1fr",
                gap: 0,
                padding: "12px 16px",
                borderBottom:
                  i < patients.length - 1 ? `1px solid ${tokens.borderSoft}` : "none",
                cursor: "pointer",
                transition: "background 150ms",
                background: isHighValue ? "#fefffe" : "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isHighValue ? "#fefffe" : "transparent";
              }}
            >
              {/* Time */}
              <div style={{ fontSize: 13, color: tokens.textSecondary, fontFamily: fonts.code }}>
                {patient.time_slot || "--"}
              </div>

              {/* Patient name + risk tier */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: tokens.text }}>
                  {patient.name}
                </span>
                <Tag variant={tierColors[patient.risk_tier] || "default"}>
                  {patient.risk_tier}
                </Tag>
              </div>

              {/* Age */}
              <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                {patient.age}{patient.gender}
              </div>

              {/* Visit type */}
              <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                {patient.visit_type || "--"}
              </div>

              {/* RAF */}
              <div style={{ fontFamily: fonts.code, fontSize: 13, fontWeight: 600, color: tokens.text }}>
                {patient.current_raf.toFixed(3)}
              </div>

              {/* Suspects */}
              <div>
                {patient.suspect_count > 0 ? (
                  <Tag variant="green">{patient.suspect_count}</Tag>
                ) : (
                  <span style={{ fontSize: 12, color: tokens.textMuted }}>0</span>
                )}
              </div>

              {/* Gaps */}
              <div>
                {patient.gap_count > 0 ? (
                  <Tag variant="amber">{patient.gap_count}</Tag>
                ) : (
                  <span style={{ fontSize: 12, color: tokens.textMuted }}>0</span>
                )}
              </div>

              {/* Priority reason */}
              <div style={{ fontSize: 12, color: tokens.textSecondary, lineHeight: 1.4 }}>
                {patient.priority_reason}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
