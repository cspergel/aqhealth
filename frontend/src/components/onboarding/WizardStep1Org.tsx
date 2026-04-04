import { useState, useMemo } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

/* ------------------------------------------------------------------ */
/* WizardStep1Org — Organization setup form                            */
/* ------------------------------------------------------------------ */

/* ---------- Constants ---------- */

const ORG_TYPES = [
  { value: "mso", label: "MSO (Management Services Organization)" },
  { value: "aco", label: "ACO (Accountable Care Organization)" },
  { value: "ipa", label: "IPA (Independent Practice Association)" },
  { value: "health_system", label: "Health System" },
] as const;

const US_STATES: { value: string; label: string }[] = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
  { value: "AS", label: "American Samoa" },
  { value: "GU", label: "Guam" },
  { value: "MP", label: "Northern Mariana Islands" },
  { value: "PR", label: "Puerto Rico" },
  { value: "VI", label: "U.S. Virgin Islands" },
];

/** Hardcoded state average county rates (PMPM) for AI-assist display */
const STATE_AVG_RATES: Record<string, number> = {
  AL: 1_112, AK: 1_458, AZ: 1_195, AR: 1_078, CA: 1_285,
  CO: 1_168, CT: 1_298, DE: 1_215, DC: 1_342, FL: 1_262,
  GA: 1_148, HI: 1_312, ID: 1_052, IL: 1_198, IN: 1_125,
  IA: 1_065, KS: 1_088, KY: 1_142, LA: 1_178, ME: 1_128,
  MD: 1_248, MA: 1_318, MI: 1_158, MN: 1_118, MS: 1_098,
  MO: 1_108, MT: 1_072, NE: 1_058, NV: 1_205, NH: 1_175,
  NJ: 1_278, NM: 1_112, NY: 1_342, NC: 1_138, ND: 1_045,
  OH: 1_155, OK: 1_095, OR: 1_162, PA: 1_225, RI: 1_268,
  SC: 1_122, SD: 1_048, TN: 1_145, TX: 1_198, UT: 1_085,
  VT: 1_115, VA: 1_178, WA: 1_198, WV: 1_152, WI: 1_108,
  WY: 1_062, AS: 1_050, GU: 1_080, MP: 1_065, PR: 1_042,
  VI: 1_095,
};

const PAYER_OPTIONS = [
  "Humana",
  "UHC/Optum",
  "Aetna",
  "Cigna",
  "Anthem",
  "Optimum Healthcare",
  "Freedom Health",
  "Other",
] as const;

const BONUS_TIERS = [
  { value: 0, label: "0% — No bonus" },
  { value: 3.5, label: "3.5% — 4+ stars" },
  { value: 5, label: "5% — 5 stars" },
] as const;

/* ---------- Props ---------- */

export interface WizardStep1OrgProps {
  /** Called when the user confirms; parent should advance the wizard step */
  onConfirm: () => void;
}

/* ---------- Component ---------- */

export function WizardStep1Org({ onConfirm }: WizardStep1OrgProps) {
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [primaryState, setPrimaryState] = useState("");
  const [selectedPayers, setSelectedPayers] = useState<Set<string>>(new Set());
  const [bonusPct, setBonusPct] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Derived */
  const stateRate = primaryState ? STATE_AVG_RATES[primaryState] ?? null : null;
  const orgTypeLabel = ORG_TYPES.find((t) => t.value === orgType)?.label.split(" (")[0] ?? "";
  const stateLabel =
    US_STATES.find((s) => s.value === primaryState)?.label ?? primaryState;

  const isFormValid = useMemo(
    () =>
      orgName.trim().length > 0 &&
      orgType !== "" &&
      primaryState !== "" &&
      selectedPayers.size > 0 &&
      bonusPct !== null,
    [orgName, orgType, primaryState, selectedPayers, bonusPct],
  );

  /* Payer toggle */
  const togglePayer = (payer: string) => {
    setSelectedPayers((prev) => {
      const next = new Set(prev);
      if (next.has(payer)) next.delete(payer);
      else next.add(payer);
      return next;
    });
    setConfirmed(false);
  };

  /* Confirm & submit */
  const handleConfirm = async () => {
    setSubmitting(true);
    setSaveError(null);

    const orgConfig = {
      org_name: orgName.trim(),
      org_type: orgType,
      primary_state: primaryState,
      payer_mix: [...selectedPayers],
      default_bonus_pct: bonusPct,
    };

    try {
      const tenantId = localStorage.getItem("tenant_id");
      if (tenantId) {
        // Real API call — save org config to tenant record
        await api.patch(`/api/tenants/${tenantId}`, {
          name: orgName.trim(),
          config: orgConfig,
        });
      } else {
        console.warn(
          "[WizardStep1Org] No tenant_id in localStorage — saving config locally only",
        );
        // Store org config in localStorage as fallback
        localStorage.setItem("org_config", JSON.stringify(orgConfig));
      }
      onConfirm();
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to save organization settings";
      console.error("[WizardStep1Org] Save failed:", detail);
      setSaveError(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Shared styles ---- */
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: tokens.text,
    marginBottom: 6,
    fontFamily: fonts.body,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    fontFamily: fonts.body,
    border: `1px solid ${tokens.border}`,
    borderRadius: 6,
    background: tokens.surface,
    color: tokens.text,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 150ms",
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 28,
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* ---- Organization Name ---- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          Organization Name <span style={{ color: tokens.red }}>*</span>
        </label>
        <input
          type="text"
          value={orgName}
          onChange={(e) => {
            setOrgName(e.target.value);
            setConfirmed(false);
          }}
          placeholder="e.g. Southeast Health Partners"
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = tokens.blue;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = tokens.border;
          }}
        />
      </div>

      {/* ---- Organization Type ---- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          Organization Type <span style={{ color: tokens.red }}>*</span>
        </label>
        <select
          value={orgType}
          onChange={(e) => {
            setOrgType(e.target.value);
            setConfirmed(false);
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            appearance: "auto",
          }}
        >
          <option value="">Select type...</option>
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Primary State ---- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          Primary State <span style={{ color: tokens.red }}>*</span>
        </label>
        <select
          value={primaryState}
          onChange={(e) => {
            setPrimaryState(e.target.value);
            setConfirmed(false);
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            appearance: "auto",
          }}
        >
          <option value="">Select state...</option>
          {US_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* ---- AI Assist: State Rate ---- */}
      {primaryState && stateRate !== null && (
        <div
          style={{
            background: tokens.blueSoft,
            border: `1px solid ${tokens.blue}20`,
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: tokens.blue,
              marginBottom: 6,
              fontFamily: fonts.heading,
            }}
          >
            AI Assist
          </div>
          <div
            style={{
              fontSize: 14,
              color: tokens.text,
              lineHeight: 1.6,
            }}
          >
            Based on <strong>{stateLabel}</strong>, your average county rate is{" "}
            <strong>
              ${stateRate.toLocaleString()} PMPM
            </strong>
            .
            {bonusPct !== null && bonusPct > 0 && (
              <>
                {" "}
                With a {bonusPct}% star bonus, effective rate is{" "}
                <strong>
                  $
                  {Math.round(stateRate * (1 + bonusPct / 100)).toLocaleString()}{" "}
                  PMPM
                </strong>
                .
              </>
            )}
            {bonusPct === null && (
              <span style={{ color: tokens.textSecondary }}>
                {" "}
                Select your star bonus tier below to see per-member values.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Primary Payers ---- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          Primary Payers <span style={{ color: tokens.red }}>*</span>
        </label>
        <p
          style={{
            fontSize: 13,
            color: tokens.textSecondary,
            margin: "0 0 10px 0",
          }}
        >
          Select all Medicare Advantage payers you work with.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {PAYER_OPTIONS.map((payer) => {
            const checked = selectedPayers.has(payer);
            return (
              <label
                key={payer}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${checked ? tokens.accent : tokens.border}`,
                  background: checked ? tokens.accentSoft : tokens.surface,
                  cursor: "pointer",
                  transition: "all 150ms",
                  fontSize: 14,
                  color: tokens.text,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePayer(payer)}
                  style={{
                    accentColor: tokens.accent,
                    width: 16,
                    height: 16,
                    cursor: "pointer",
                  }}
                />
                {payer}
              </label>
            );
          })}
        </div>
      </div>

      {/* ---- Star Rating / Bonus Tier ---- */}
      <div style={sectionStyle}>
        <label style={labelStyle}>
          Star Rating / Bonus Tier <span style={{ color: tokens.red }}>*</span>
        </label>
        <p
          style={{
            fontSize: 13,
            color: tokens.textSecondary,
            margin: "0 0 10px 0",
          }}
        >
          CMS quality bonus percentage applied to your benchmark.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {BONUS_TIERS.map((tier) => {
            const checked = bonusPct === tier.value;
            return (
              <label
                key={tier.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${checked ? tokens.accent : tokens.border}`,
                  background: checked ? tokens.accentSoft : tokens.surface,
                  cursor: "pointer",
                  transition: "all 150ms",
                  fontSize: 14,
                  color: tokens.text,
                  userSelect: "none",
                }}
              >
                <input
                  type="radio"
                  name="bonusTier"
                  checked={checked}
                  onChange={() => {
                    setBonusPct(tier.value);
                    setConfirmed(false);
                  }}
                  style={{
                    accentColor: tokens.accent,
                    width: 16,
                    height: 16,
                    cursor: "pointer",
                  }}
                />
                {tier.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* ---- Confirm Gate ---- */}
      {isFormValid && (
        <div
          style={{
            background: confirmed ? tokens.accentSoft : tokens.surfaceAlt,
            border: `1px solid ${confirmed ? tokens.accent : tokens.border}`,
            borderRadius: 10,
            padding: "18px 20px",
            marginTop: 8,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: tokens.text,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            I'll set up '<strong>{orgName.trim()}</strong>' as{" "}
            {/^[aeiou]/i.test(orgTypeLabel) ? "an" : "a"}{" "}
            <strong>{orgTypeLabel}</strong> in{" "}
            <strong>{stateLabel}</strong> with{" "}
            <strong>{bonusPct}%</strong> quality bonus. Primary payers:{" "}
            <strong>{[...selectedPayers].join(", ")}</strong>.
          </div>
          {saveError && (
            <div
              style={{
                padding: "10px 14px",
                marginBottom: 12,
                borderRadius: 6,
                background: `${tokens.red}10`,
                border: `1px solid ${tokens.red}40`,
                color: tokens.red,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {saveError}
            </div>
          )}
          <button
            onClick={() => {
              if (!confirmed) {
                setConfirmed(true);
              } else {
                handleConfirm();
              }
            }}
            disabled={submitting}
            style={{
              padding: "10px 28px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: fonts.body,
              borderRadius: 6,
              border: "none",
              background: submitting
                ? tokens.textMuted
                : confirmed
                  ? tokens.accent
                  : tokens.blue,
              color: "#ffffff",
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.6 : 1,
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => {
              if (!submitting)
                e.currentTarget.style.background = confirmed
                  ? tokens.accentText
                  : tokens.accent;
            }}
            onMouseLeave={(e) => {
              if (!submitting)
                e.currentTarget.style.background = confirmed
                  ? tokens.accent
                  : tokens.blue;
            }}
          >
            {submitting
              ? "Saving..."
              : confirmed
                ? "Confirm & Continue"
                : "Review & Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}
