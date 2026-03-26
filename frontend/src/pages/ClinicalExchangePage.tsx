import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExchangeDashboard {
  total_requests: number;
  auto_responded: number;
  pending: number;
  completed: number;
  avg_response_hours: number;
  auto_respond_rate: number;
  requests_this_month: number;
  requests_last_month: number;
}

interface ExchangeRequest {
  id: number;
  request_type: string;
  requestor: string | null;
  member_id: number | null;
  member_name: string | null;
  hcc_code: number | null;
  hcc_label: string | null;
  measure_code: string | null;
  status: string;
  request_date: string;
  response_date: string | null;
  auto_generated: boolean;
  notes: string | null;
}

interface EvidencePackage {
  request_id: number;
  member_id: number;
  member_name: string;
  hcc_code: number;
  hcc_label: string;
  package_type: string;
  generated_at: string;
  supporting_claims: { claim_id: string; date_of_service: string; provider: string; diagnosis_codes: string[]; cpt_codes: string[]; facility: string }[];
  meat_documentation: {
    monitored: { status: boolean; evidence: string };
    evaluated: { status: boolean; evidence: string };
    assessed: { status: boolean; evidence: string };
    treated: { status: boolean; evidence: string };
    overall_score: number;
  };
  medication_support: { drug: string; start_date: string; prescriber: string; implies: string }[];
  lab_results: { test: string; date: string; result: string; reference_range: string; interpretation: string }[];
  documentation_timeline: { date: string; event: string; provider: string }[];
  evidence_strength: string;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClinicalExchangePage() {
  const [dashboard, setDashboard] = useState<ExchangeDashboard | null>(null);
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<EvidencePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "all">("all");
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // Generate evidence tool state
  const [showGenerateTool, setShowGenerateTool] = useState(false);
  const [genMemberId, setGenMemberId] = useState("");
  const [genType, setGenType] = useState("hcc_evidence");
  const [genHccCode, setGenHccCode] = useState("");
  const [genMeasureCode, setGenMeasureCode] = useState("");
  const [genResult, setGenResult] = useState<EvidencePackage | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/exchange/dashboard"),
      api.get("/api/exchange/requests"),
    ])
      .then(([dashRes, reqRes]) => {
        setDashboard(dashRes.data);
        setRequests(reqRes.data);
      })
      .catch((err) => console.error("Failed to load exchange data:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleAutoRespond = (requestId: number) => {
    setGeneratingId(requestId);
    api.post(`/api/exchange/auto-respond/${requestId}`)
      .then((res) => {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, status: "auto_responded", response_date: new Date().toISOString().split("T")[0], auto_generated: true }
              : r,
          ),
        );
        if (dashboard) {
          setDashboard({ ...dashboard, pending: dashboard.pending - 1, auto_responded: dashboard.auto_responded + 1 });
        }
        setSelectedPackage(res.data.package);
      })
      .catch((err) => console.error("Auto-respond failed:", err))
      .finally(() => setGeneratingId(null));
  };

  const handleViewPackage = (requestId: number) => {
    api.get(`/api/exchange/package/${requestId}`)
      .then((res) => setSelectedPackage(res.data))
      .catch((err) => console.error("Failed to load package:", err));
  };

  const handleGenerateEvidence = () => {
    const body: any = { member_id: parseInt(genMemberId), type: genType };
    if (genType === "hcc_evidence") body.hcc_code = parseInt(genHccCode);
    if (genType === "quality_evidence") body.measure_code = genMeasureCode;
    api.post("/api/exchange/generate-evidence", body)
      .then((res) => setGenResult(res.data))
      .catch((err) => console.error("Generate evidence failed:", err));
  };

  const filteredRequests = requests.filter((r) => {
    if (activeTab === "pending") return r.status === "pending";
    if (activeTab === "completed") return r.status === "completed" || r.status === "auto_responded";
    return true;
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pending: { bg: "#FEF3C7", text: "#92400E" },
      auto_responded: { bg: "#D1FAE5", text: "#065F46" },
      completed: { bg: "#DBEAFE", text: "#1E40AF" },
      manual_review: { bg: "#FDE8E8", text: "#991B1B" },
      rejected: { bg: "#FEE2E2", text: "#991B1B" },
    };
    const c = colors[status] || { bg: "#F3F4F6", text: "#374151" };
    const labels: Record<string, string> = {
      pending: "Pending",
      auto_responded: "Auto-Responded",
      completed: "Completed",
      manual_review: "Manual Review",
      rejected: "Rejected",
    };
    return (
      <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
        {labels[status] || status}
      </span>
    );
  };

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      hcc_evidence: "HCC Evidence",
      quality_evidence: "Quality Evidence",
      radv_audit: "RADV Audit",
      chart_request: "Chart Request",
    };
    return labels[type] || type;
  };

  const metricCard = (label: string, value: string | number, color?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
    </div>
  );

  const meatCheck = (val: boolean) => (
    <span style={{ fontSize: 14, color: val ? tokens.accent : tokens.red, fontWeight: 700 }}>
      {val ? "\u2713" : "\u2717"}
    </span>
  );

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading exchange data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: 0 }}>
          Clinical Data Exchange
        </h1>
        <p style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
          Automated evidence packaging for payer data requests
        </p>
      </div>

      {/* Dashboard Metrics */}
      {dashboard && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {metricCard("Total Requests", dashboard.total_requests)}
          {metricCard("Auto-Responded", dashboard.auto_responded, tokens.accent)}
          {metricCard("Pending", dashboard.pending, tokens.amber)}
          {metricCard("Avg Response Time", `${dashboard.avg_response_hours}h`, tokens.accent)}
          {metricCard("Auto-Respond Rate", `${dashboard.auto_respond_rate}%`, tokens.accent)}
        </div>
      )}

      {/* Action Row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setShowGenerateTool(!showGenerateTool)}
          style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: `1px solid ${tokens.accent}`, background: showGenerateTool ? tokens.accent : "transparent",
            color: showGenerateTool ? "#fff" : tokens.accent, cursor: "pointer",
          }}
        >
          Generate Evidence Tool
        </button>
      </div>

      {/* Generate Evidence Tool */}
      {showGenerateTool && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: "0 0 16px" }}>
            Generate Evidence Package
          </h3>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Member ID</label>
              <input
                type="text" value={genMemberId} onChange={(e) => setGenMemberId(e.target.value)}
                placeholder="e.g. 1042"
                style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 120 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Type</label>
              <select
                value={genType} onChange={(e) => setGenType(e.target.value)}
                style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6 }}
              >
                <option value="hcc_evidence">HCC Evidence</option>
                <option value="quality_evidence">Quality Evidence</option>
                <option value="radv_audit">RADV Audit</option>
              </select>
            </div>
            {genType === "hcc_evidence" && (
              <div>
                <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>HCC Code</label>
                <input
                  type="text" value={genHccCode} onChange={(e) => setGenHccCode(e.target.value)}
                  placeholder="e.g. 19"
                  style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 80 }}
                />
              </div>
            )}
            {genType === "quality_evidence" && (
              <div>
                <label style={{ fontSize: 11, color: tokens.textMuted, display: "block", marginBottom: 4 }}>Measure Code</label>
                <input
                  type="text" value={genMeasureCode} onChange={(e) => setGenMeasureCode(e.target.value)}
                  placeholder="e.g. C01-HbA1c"
                  style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${tokens.border}`, borderRadius: 6, width: 140 }}
                />
              </div>
            )}
            <button
              onClick={handleGenerateEvidence}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none",
                background: tokens.accent, color: "#fff", cursor: "pointer",
              }}
            >
              Generate
            </button>
          </div>

          {/* Generated result */}
          {genResult && (
            <div style={{ marginTop: 16, padding: 16, background: tokens.bg, borderRadius: 8, border: `1px solid ${tokens.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tokens.accent, marginBottom: 8 }}>Evidence package generated</div>
              <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                Member: {genResult.member_name} | HCC {genResult.hcc_code}: {genResult.hcc_label} | Strength: {genResult.evidence_strength}
              </div>
              <button
                onClick={() => setSelectedPackage(genResult)}
                style={{
                  marginTop: 8, padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: `1px solid ${tokens.accent}`, background: "transparent", color: tokens.accent, cursor: "pointer",
                }}
              >
                View Full Package
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${tokens.border}` }}>
        {(["all", "pending", "completed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? tokens.accent : tokens.textMuted, background: "transparent",
              border: "none", borderBottom: activeTab === tab ? `2px solid ${tokens.accent}` : "2px solid transparent",
              cursor: "pointer", textTransform: "capitalize",
            }}
          >
            {tab} ({tab === "all" ? requests.length : tab === "pending" ? requests.filter((r) => r.status === "pending").length : requests.filter((r) => r.status === "completed" || r.status === "auto_responded").length})
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt }}>
              {["Type", "Requestor", "Member", "Code", "Status", "Requested", "Responded", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${tokens.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 500 }}>{typeLabel(r.request_type)}</td>
                <td style={{ padding: "10px 14px" }}>{r.requestor}</td>
                <td style={{ padding: "10px 14px" }}>{r.member_name || `ID: ${r.member_id}`}</td>
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12 }}>
                  {r.hcc_code ? `HCC ${r.hcc_code}` : r.measure_code || "--"}
                </td>
                <td style={{ padding: "10px 14px" }}>{statusBadge(r.status)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: tokens.textSecondary }}>{r.request_date}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: tokens.textSecondary }}>{r.response_date || "--"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {r.status === "pending" && (
                      <button
                        onClick={() => handleAutoRespond(r.id)}
                        disabled={generatingId === r.id}
                        style={{
                          padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none",
                          background: tokens.accent, color: "#fff", cursor: generatingId === r.id ? "wait" : "pointer",
                          opacity: generatingId === r.id ? 0.6 : 1,
                        }}
                      >
                        {generatingId === r.id ? "Generating..." : "Auto-Respond"}
                      </button>
                    )}
                    {(r.status === "auto_responded" || r.status === "completed") && (
                      <button
                        onClick={() => handleViewPackage(r.id)}
                        style={{
                          padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                          border: `1px solid ${tokens.accent}`, background: "transparent", color: tokens.accent, cursor: "pointer",
                        }}
                      >
                        View Package
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Evidence Package Viewer */}
      {selectedPackage && (
        <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, margin: 0 }}>
                Evidence Package
              </h2>
              <p style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>
                {selectedPackage.member_name} -- HCC {selectedPackage.hcc_code}: {selectedPackage.hcc_label}
              </p>
            </div>
            <button
              onClick={() => setSelectedPackage(null)}
              style={{ padding: "4px 12px", fontSize: 12, border: `1px solid ${tokens.border}`, borderRadius: 6, background: "transparent", cursor: "pointer", color: tokens.textMuted }}
            >
              Close
            </button>
          </div>

          {/* Evidence Strength Banner */}
          <div style={{
            padding: "12px 20px", borderRadius: 8, marginBottom: 20,
            background: selectedPackage.evidence_strength === "strong" ? "#D1FAE5" : "#FEF3C7",
            color: selectedPackage.evidence_strength === "strong" ? "#065F46" : "#92400E",
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Evidence Strength: {selectedPackage.evidence_strength.toUpperCase()}</span>
            <span style={{ fontSize: 12, marginLeft: 12 }}>{selectedPackage.recommendation}</span>
          </div>

          {/* MEAT Documentation */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>MEAT Documentation</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(["monitored", "evaluated", "assessed", "treated"] as const).map((key) => {
                const item = selectedPackage.meat_documentation[key];
                return (
                  <div key={key} style={{ padding: "12px 16px", background: tokens.bg, borderRadius: 8, border: `1px solid ${tokens.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {meatCheck(item.status)}
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{key}</span>
                    </div>
                    <div style={{ fontSize: 12, color: tokens.textSecondary, lineHeight: 1.5 }}>{item.evidence}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: tokens.accent }}>
              Overall MEAT Score: {selectedPackage.meat_documentation.overall_score}/100
            </div>
          </div>

          {/* Supporting Claims */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>Supporting Claims</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Claim ID", "Date of Service", "Provider", "Dx Codes", "CPT Codes", "Facility"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, borderBottom: `1px solid ${tokens.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedPackage.supporting_claims.map((c, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.claim_id}</td>
                    <td style={{ padding: "8px 12px" }}>{c.date_of_service}</td>
                    <td style={{ padding: "8px 12px" }}>{c.provider}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.diagnosis_codes.join(", ")}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.cpt_codes.join(", ")}</td>
                    <td style={{ padding: "8px 12px" }}>{c.facility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Medication Support */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>Medication Support</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {selectedPackage.medication_support.map((m, i) => (
                <div key={i} style={{ padding: "12px 16px", background: tokens.bg, borderRadius: 8, border: `1px solid ${tokens.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{m.drug}</div>
                  <div style={{ fontSize: 11, color: tokens.textSecondary }}>Since: {m.start_date}</div>
                  <div style={{ fontSize: 11, color: tokens.textSecondary }}>Prescriber: {m.prescriber}</div>
                  <div style={{ fontSize: 11, color: tokens.accent, marginTop: 4, fontStyle: "italic" }}>{m.implies}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Lab Results */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>Lab Results</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: tokens.surfaceAlt }}>
                  {["Test", "Date", "Result", "Reference", "Interpretation"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: tokens.textMuted, fontSize: 11, borderBottom: `1px solid ${tokens.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedPackage.lab_results.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{l.test}</td>
                    <td style={{ padding: "8px 12px" }}>{l.date}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{l.result}</td>
                    <td style={{ padding: "8px 12px", color: tokens.textSecondary }}>{l.reference_range}</td>
                    <td style={{ padding: "8px 12px", fontStyle: "italic" }}>{l.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Documentation Timeline */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>Documentation Timeline</h3>
            <div style={{ position: "relative", paddingLeft: 20 }}>
              {selectedPackage.documentation_timeline.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 16, marginBottom: 16, position: "relative" }}>
                  <div style={{
                    position: "absolute", left: -20, top: 4, width: 10, height: 10, borderRadius: "50%",
                    background: tokens.accent, border: "2px solid #fff", boxShadow: `0 0 0 1px ${tokens.accent}`,
                  }} />
                  {i < selectedPackage.documentation_timeline.length - 1 && (
                    <div style={{
                      position: "absolute", left: -16, top: 16, width: 2, height: "calc(100% + 4px)",
                      background: tokens.border,
                    }} />
                  )}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: tokens.text }}>{t.date}</div>
                    <div style={{ fontSize: 12, color: tokens.textSecondary }}>{t.event}</div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>{t.provider}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
