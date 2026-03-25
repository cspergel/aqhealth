import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { tokens, fonts } from "../../lib/tokens";

// ---------------------------------------------------------------------------
// DRG Lookup Table
// ---------------------------------------------------------------------------

interface DrgInfo {
  description: string;
  mdc: string;
  avg_national_cost: number;
  typical_los: number;
}

const DRG_LOOKUP: Record<string, DrgInfo> = {
  "065": { description: "Intracranial Hemorrhage w/ MCC", mdc: "MDC 01 — Nervous System", avg_national_cost: 42800, typical_los: 7.2 },
  "069": { description: "Transient Ischemic Attack (TIA)", mdc: "MDC 01 — Nervous System", avg_national_cost: 8200, typical_los: 2.8 },
  "190": { description: "COPD w/ MCC", mdc: "MDC 04 — Respiratory System", avg_national_cost: 12600, typical_los: 5.1 },
  "191": { description: "COPD w/ CC", mdc: "MDC 04 — Respiratory System", avg_national_cost: 9400, typical_los: 4.0 },
  "193": { description: "Pneumonia w/ MCC", mdc: "MDC 04 — Respiratory System", avg_national_cost: 11800, typical_los: 5.3 },
  "194": { description: "Pneumonia w/ CC", mdc: "MDC 04 — Respiratory System", avg_national_cost: 8800, typical_los: 4.1 },
  "252": { description: "Other Vascular Procedures", mdc: "MDC 05 — Circulatory System", avg_national_cost: 28600, typical_los: 5.8 },
  "291": { description: "Heart Failure & Shock w/ MCC", mdc: "MDC 05 — Circulatory System", avg_national_cost: 15200, typical_los: 5.4 },
  "292": { description: "Heart Failure & Shock w/ CC", mdc: "MDC 05 — Circulatory System", avg_national_cost: 10800, typical_los: 4.2 },
  "378": { description: "GI Hemorrhage w/ CC", mdc: "MDC 06 — Digestive System", avg_national_cost: 9200, typical_los: 3.8 },
  "392": { description: "Esophagitis & GI Misc w/o MCC", mdc: "MDC 06 — Digestive System", avg_national_cost: 7100, typical_los: 3.1 },
  "470": { description: "Major Hip/Knee Joint Replacement", mdc: "MDC 08 — Musculoskeletal", avg_national_cost: 19500, typical_los: 2.8 },
  "480": { description: "Hip & Femur Procedures", mdc: "MDC 08 — Musculoskeletal", avg_national_cost: 22400, typical_los: 5.2 },
  "603": { description: "Cellulitis w/o MCC", mdc: "MDC 09 — Skin & Subcutaneous", avg_national_cost: 7800, typical_los: 3.6 },
  "683": { description: "Renal Failure w/ MCC", mdc: "MDC 11 — Kidney & Urinary", avg_national_cost: 14200, typical_los: 5.0 },
  "684": { description: "Renal Failure w/ CC", mdc: "MDC 11 — Kidney & Urinary", avg_national_cost: 10100, typical_los: 3.9 },
  "689": { description: "Kidney & UTI w/ MCC", mdc: "MDC 11 — Kidney & Urinary", avg_national_cost: 9600, typical_los: 4.4 },
  "690": { description: "Kidney & UTI w/ CC", mdc: "MDC 11 — Kidney & Urinary", avg_national_cost: 7200, typical_los: 3.5 },
  "743": { description: "Uterine & Adnexa Procedures", mdc: "MDC 13 — Female Reproductive", avg_national_cost: 14800, typical_los: 2.4 },
  "766": { description: "Cesarean Section w/o CC/MCC", mdc: "MDC 14 — Pregnancy & Childbirth", avg_national_cost: 11800, typical_los: 3.2 },
  "871": { description: "Septicemia w/o MV >96hrs w/ MCC", mdc: "MDC 18 — Infectious Disease", avg_national_cost: 22000, typical_los: 6.8 },
  "872": { description: "Septicemia w/o MV >96hrs w/o MCC", mdc: "MDC 18 — Infectious Disease", avg_national_cost: 12400, typical_los: 4.6 },
};

export { DRG_LOOKUP };

// ---------------------------------------------------------------------------
// Per-hospital mock breakdown (shown on click)
// ---------------------------------------------------------------------------

const HOSPITAL_BREAKDOWNS: Record<string, { hospital: string; cases: number; avg_cost: number }[]> = {
  "291": [
    { hospital: "Memorial Regional", cases: 18, avg_cost: 21400 },
    { hospital: "St. Joseph Hospital", cases: 12, avg_cost: 17800 },
    { hospital: "Bayfront Health", cases: 10, avg_cost: 14200 },
    { hospital: "Community General", cases: 8, avg_cost: 15600 },
  ],
  "470": [
    { hospital: "Memorial Regional", cases: 14, avg_cost: 25800 },
    { hospital: "St. Joseph Hospital", cases: 10, avg_cost: 21400 },
    { hospital: "Mercy Medical", cases: 12, avg_cost: 18200 },
    { hospital: "Community General", cases: 6, avg_cost: 19800 },
  ],
  "871": [
    { hospital: "University Health", cases: 14, avg_cost: 26200 },
    { hospital: "Memorial Regional", cases: 10, avg_cost: 28400 },
    { hospital: "Lakeside Health", cases: 8, avg_cost: 22100 },
  ],
  "190": [
    { hospital: "Memorial Regional", cases: 8, avg_cost: 16800 },
    { hospital: "University Health", cases: 10, avg_cost: 14600 },
    { hospital: "Mercy Medical", cases: 8, avg_cost: 12200 },
  ],
  "392": [
    { hospital: "Community General", cases: 12, avg_cost: 7800 },
    { hospital: "St. Joseph Hospital", cases: 10, avg_cost: 8600 },
    { hospital: "Memorial Regional", cases: 8, avg_cost: 9200 },
    { hospital: "Mercy Medical", cases: 8, avg_cost: 7400 },
  ],
  "689": [
    { hospital: "Memorial Regional", cases: 10, avg_cost: 8400 },
    { hospital: "University Health", cases: 8, avg_cost: 7600 },
    { hospital: "Lakeside Health", cases: 6, avg_cost: 7200 },
  ],
};

// ---------------------------------------------------------------------------
// Helper: detect if a string value looks like a DRG code
// ---------------------------------------------------------------------------

export function isDrgCode(value: string): boolean {
  const stripped = value.replace(/^DRG\s*/i, "").trim();
  return /^\d{3}$/.test(stripped) && stripped in DRG_LOOKUP;
}

export function extractDrgCode(value: string): string | null {
  const stripped = value.replace(/^DRG\s*/i, "").trim();
  if (/^\d{3}$/.test(stripped) && stripped in DRG_LOOKUP) return stripped;
  return null;
}

// Extract all DRG codes from a string like "DRG 291, 470, 392"
export function extractDrgCodes(value: string): string[] {
  const codes: string[] = [];
  const matches = value.match(/\b\d{3}\b/g);
  if (matches) {
    for (const m of matches) {
      if (m in DRG_LOOKUP) codes.push(m);
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// DrgTooltip component
// ---------------------------------------------------------------------------

interface DrgTooltipProps {
  code: string; // e.g. "291"
  children?: React.ReactNode;
}

export function DrgTooltip({ code, children }: DrgTooltipProps) {
  const [expanded, setExpanded] = useState(false);
  const info = DRG_LOOKUP[code];

  if (!info) {
    return <>{children || code}</>;
  }

  const breakdown = HOSPITAL_BREAKDOWNS[code];

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (breakdown) setExpanded(!expanded);
            }}
            className="cursor-pointer inline-flex items-center gap-1"
          >
            <span
              className="px-1 py-0.5 rounded text-[12px]"
              style={{
                fontFamily: fonts.code,
                background: tokens.surfaceAlt,
                color: tokens.text,
                borderBottom: `1px dashed ${tokens.textMuted}`,
              }}
            >
              {children || code}
            </span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="rounded-lg border px-4 py-3 shadow-lg z-50 max-w-xs"
            style={{
              background: tokens.surface,
              borderColor: tokens.border,
              color: tokens.text,
            }}
          >
            <div className="text-[13px] font-semibold mb-1" style={{ fontFamily: fonts.heading }}>
              DRG {code}: {info.description}
            </div>
            <div className="text-[11px] mb-2" style={{ color: tokens.textMuted }}>
              {info.mdc}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <div style={{ color: tokens.textMuted }}>Avg National Cost</div>
              <div className="text-right font-medium" style={{ fontFamily: fonts.code }}>
                ${info.avg_national_cost.toLocaleString()}
              </div>
              <div style={{ color: tokens.textMuted }}>Typical LOS</div>
              <div className="text-right font-medium" style={{ fontFamily: fonts.code }}>
                {info.typical_los} days
              </div>
            </div>
            <Tooltip.Arrow style={{ fill: tokens.surface }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      {/* Inline expanded breakdown */}
      {expanded && breakdown && (
        <div
          className="mt-1 rounded-md border px-3 py-2"
          style={{ background: tokens.surfaceAlt, borderColor: tokens.borderSoft }}
        >
          <div
            className="text-[11px] font-semibold mb-1.5"
            style={{ color: tokens.textSecondary }}
          >
            Hospital Breakdown — DRG {code}
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: tokens.textMuted }}>
                <th className="text-left pb-1">Hospital</th>
                <th className="text-right pb-1">Cases</th>
                <th className="text-right pb-1">Avg Cost</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.hospital}>
                  <td className="py-0.5" style={{ color: tokens.text }}>{row.hospital}</td>
                  <td className="text-right py-0.5" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
                    {row.cases}
                  </td>
                  <td className="text-right py-0.5" style={{ fontFamily: fonts.code, color: tokens.text }}>
                    ${row.avg_cost.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// DrgCellValue: wraps a cell value, detecting and wrapping DRG codes
// ---------------------------------------------------------------------------

export function DrgCellValue({ value }: { value: string }) {
  // Handle comma-separated DRG lists like "DRG 291, 470, 392"
  const codes = extractDrgCodes(value);
  if (codes.length > 1) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {codes.map((code, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: tokens.textMuted }}>, </span>}
            <DrgTooltip code={code}>DRG {code}</DrgTooltip>
          </span>
        ))}
      </span>
    );
  }

  // Single DRG code
  const single = extractDrgCode(value);
  if (single) {
    return <DrgTooltip code={single}>{value}</DrgTooltip>;
  }

  return <>{value}</>;
}
