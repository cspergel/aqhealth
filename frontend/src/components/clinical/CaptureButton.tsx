import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";

interface CaptureButtonProps {
  memberId: number;
  suspectId: number;
  rafValue: number;
  onCaptured?: (suspectId: number, rafValue: number) => void;
}

export function CaptureButton({ memberId, suspectId, rafValue, onCaptured }: CaptureButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "captured">("idle");
  const [showDelta, setShowDelta] = useState(false);

  const handleCapture = async () => {
    if (state !== "idle") return;
    setState("loading");

    try {
      await api.post("/api/clinical/capture", {
        member_id: memberId,
        suspect_id: suspectId,
      });

      setState("captured");
      setShowDelta(true);
      onCaptured?.(suspectId, rafValue);

      // Hide RAF delta after 2 seconds
      setTimeout(() => setShowDelta(false), 2000);
    } catch {
      setState("idle");
    }
  };

  if (state === "captured") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {showDelta && (
          <span
            style={{
              fontFamily: fonts.code,
              fontSize: 12,
              fontWeight: 600,
              color: tokens.accentText,
              animation: "fadeIn 300ms ease",
            }}
          >
            +{rafValue.toFixed(3)}
          </span>
        )}
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
      </div>
    );
  }

  return (
    <button
      onClick={handleCapture}
      disabled={state === "loading"}
      style={{
        background: tokens.accent,
        color: "white",
        border: "none",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: state === "loading" ? "wait" : "pointer",
        opacity: state === "loading" ? 0.7 : 1,
        flexShrink: 0,
        transition: "opacity 150ms",
      }}
    >
      {state === "loading" ? "..." : "Capture"}
    </button>
  );
}
