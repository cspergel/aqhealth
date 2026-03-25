import { useState } from "react";
import { tokens, fonts } from "../../lib/tokens";

interface DataTierBadgeProps {
  /** Optional custom tooltip text */
  tooltip?: string;
  /** Compact mode: just shows a small dot indicator */
  compact?: boolean;
}

/**
 * DataTierBadge -- indicates that a value is estimated (signal-tier) rather
 * than adjudicated (record-tier). Record-tier data shows no badge at all.
 *
 * - Default: subtle "Est." label in amber with dotted border
 * - Hover: tooltip explaining the estimate source
 * - Compact: small amber dot indicator
 */
export function DataTierBadge({
  tooltip = "This value is estimated from ADT data. Actual claim has not been received yet.",
  compact = false,
}: DataTierBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (compact) {
    return (
      <span
        className="relative inline-flex items-center"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full ml-1"
          style={{ background: tokens.amber, opacity: 0.8 }}
        />
        {showTooltip && (
          <span
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md text-[11px] leading-tight whitespace-nowrap z-50 shadow-md"
            style={{
              background: tokens.text,
              color: "#fff",
              fontFamily: fonts.body,
              maxWidth: 260,
              whiteSpace: "normal",
            }}
          >
            {tooltip}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider cursor-default"
        style={{
          color: tokens.amber,
          background: tokens.amberSoft,
          border: `1px dashed ${tokens.amber}`,
          fontFamily: fonts.code,
          lineHeight: 1.2,
        }}
      >
        Est.
      </span>
      {showTooltip && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md text-[11px] leading-tight z-50 shadow-md"
          style={{
            background: tokens.text,
            color: "#fff",
            fontFamily: fonts.body,
            maxWidth: 260,
            whiteSpace: "normal",
          }}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
