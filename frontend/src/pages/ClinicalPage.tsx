import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { tokens, fonts } from "../lib/tokens";
import { ProviderWorklist } from "../components/clinical/ProviderWorklist";
import { PatientContext } from "../components/clinical/PatientContext";
import { useAuth } from "../lib/auth";
import { useGlobalFilter } from "../lib/filterContext";
import api from "../lib/api";
import type { ClinicalPatientContext, ClinicalWorklistItem } from "../lib/mockData";

export function ClinicalPage() {
  const { memberId } = useParams<{ memberId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedProvider } = useGlobalFilter();

  // Use the globally-selected provider if available, otherwise fall back to the user's own ID
  const providerId = selectedProvider?.id ?? user?.id ?? 1;

  const [worklist, setWorklist] = useState<ClinicalWorklistItem[]>([]);
  const [patient, setPatient] = useState<ClinicalPatientContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load worklist
  useEffect(() => {
    if (!memberId) {
      setLoading(true);
      api
        .get("/api/clinical/worklist", { params: { provider_id: providerId } })
        .then((res) => {
          setWorklist(res.data);
          setPatient(null);
          setError(null);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Failed to load worklist";
          setError(message);
        })
        .finally(() => setLoading(false));
    }
  }, [memberId, providerId]);

  // Load patient context
  useEffect(() => {
    if (memberId) {
      setLoading(true);
      api
        .get(`/api/clinical/patient/${memberId}`)
        .then((res) => {
          if (res.data && !res.data.error) {
            setPatient(res.data);
            setError(null);
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Failed to load patient data";
          setError(message);
        })
        .finally(() => setLoading(false));
    }
  }, [memberId]);

  const handleSelectPatient = useCallback(
    (id: number) => {
      navigate(`/clinical/${id}`);
    },
    [navigate],
  );

  const handleBack = useCallback(() => {
    setPatient(null);
    navigate("/clinical");
  }, [navigate]);

  // Search filter for worklist
  const filteredWorklist = searchQuery
    ? worklist.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.member_external_id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : worklist;

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: tokens.textMuted,
          fontFamily: fonts.body,
        }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: tokens.text,
          fontFamily: fonts.body,
        }}
      >
        <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
            cursor: "pointer",
            fontSize: 13,
            fontFamily: fonts.body,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Patient mode
  if (memberId && patient) {
    return <PatientContext patient={patient} onBack={handleBack} />;
  }

  // Worklist mode
  return (
    <div style={{ fontFamily: fonts.body }}>
      {/* Search bar */}
      <div
        style={{
          padding: "16px 28px",
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.surface,
        }}
      >
        <input
          type="text"
          placeholder="Search patients by name, DOB, or MRN..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
            fontSize: 13,
            fontFamily: fonts.body,
            color: tokens.text,
            background: tokens.surfaceAlt,
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = tokens.accent;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = tokens.border;
          }}
        />
      </div>

      <ProviderWorklist patients={filteredWorklist} onSelectPatient={handleSelectPatient} />
    </div>
  );
}
