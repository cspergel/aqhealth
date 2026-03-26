import { useEffect, useState } from "react";
import api from "../lib/api";
import { tokens, fonts } from "../lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VulnerableCode {
  hcc_code: number;
  hcc_label: string;
  member_count: number;
  avg_meat_score: number;
  weakest_member: string | null;
  risk_level: string;
}

interface AuditReadiness {
  overall_score: number;
  by_category: { category: string; hcc_codes: number[]; captures: number; avg_meat_score: number; status: string }[];
  weakest_codes: VulnerableCode[];
  strongest_codes: { hcc_code: number; hcc_label: string; captures: number; avg_meat_score: number }[];
}

interface MemberAuditProfile {
  member_id: string;
  member_name: string;
  overall_score: number;
  hccs: {
    hcc_code: number;
    hcc_label: string;
    meat_score: number;
    evidence_strength: string;
    vulnerability: string;
    meat_detail: { monitored: boolean; evaluated: boolean; assessed: boolean; treated: boolean; score: number };
  }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RADVPage() {
  const [readiness, setReadiness] = useState<AuditReadiness | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberAuditProfile | null>(null);
  const [_selectedMember, setSelectedMember] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/radv/readiness")
      .then((res) => setReadiness(res.data))
      .catch((err) => console.error("Failed to load RADV readiness:", err))
      .finally(() => setLoading(false));
  }, []);

  const loadMemberProfile = (memberId: string) => {
    setSelectedMember(memberId);
    api.get(`/api/radv/member/${memberId}`)
      .then((res) => setMemberProfile(res.data))
      .catch((err) => console.error("Failed to load member profile:", err));
  };

  const gaugeColor = (score: number) => score >= 85 ? tokens.accent : score >= 70 ? tokens.amber : tokens.red;

  const meatCheck = (val: boolean) => (
    <span style={{ fontSize: 14, color: val ? tokens.accent : tokens.red, fontWeight: 700 }}>
      {val ? "\u2713" : "\u2717"}
    </span>
  );

  const metricCard = (label: string, value: string | number, color?: string) => (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "20px 24px", flex: 1 }}>
      <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: fonts.heading, color: color || tokens.text }}>{value}</div>
    </div>
  );

  if (loading) {
    return <div style={{ padding: 32, color: tokens.textMuted }}>Loading RADV data...</div>;
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: fonts.heading, color: tokens.text, marginBottom: 4 }}>
        RADV Audit Readiness
      </h1>
      <p style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 24 }}>
        MEAT evidence scoring for every captured HCC. Identify vulnerable codes before CMS audits.
      </p>

      {readiness && (
        <>
          {/* Overall score gauge + summary cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 200 }}>
              <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 8 }}>Overall Readiness</div>
              <div style={{
                width: 100, height: 100, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                border: `6px solid ${gaugeColor(readiness.overall_score)}`, background: tokens.surface,
              }}>
                <span style={{ fontSize: 32, fontWeight: 700, fontFamily: fonts.heading, color: gaugeColor(readiness.overall_score) }}>
                  {readiness.overall_score}
                </span>
              </div>
              <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 8 }}>
                {readiness.overall_score >= 85 ? "Audit Ready" : readiness.overall_score >= 70 ? "Needs Improvement" : "At Risk"}
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 16 }}>
              {metricCard("Vulnerable Codes", readiness.weakest_codes.length, tokens.red)}
              {metricCard("Strong Codes", readiness.strongest_codes.length, tokens.accent)}
              {metricCard("Categories Tracked", readiness.by_category.length)}
            </div>
          </div>

          {/* By-HCC category breakdown */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 12, color: tokens.text }}>By Category</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  {["Category", "HCC Codes", "Captures", "Avg MEAT Score", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readiness.by_category.map((cat) => (
                  <tr key={cat.category} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{cat.category}</td>
                    <td style={{ padding: "8px 12px", fontFamily: fonts.code, fontSize: 11 }}>{cat.hcc_codes.join(", ")}</td>
                    <td style={{ padding: "8px 12px" }}>{cat.captures}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: gaugeColor(cat.avg_meat_score) }}>{cat.avg_meat_score}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                        background: cat.status === "strong" ? tokens.accentSoft : cat.status === "moderate" ? tokens.amberSoft : tokens.redSoft,
                        color: cat.status === "strong" ? tokens.accentText : cat.status === "moderate" ? tokens.amber : tokens.red,
                      }}>
                        {cat.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vulnerable codes */}
          <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, marginBottom: 4, color: tokens.text }}>Vulnerable Codes</h2>
            <p style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 12 }}>
              These {readiness.weakest_codes.reduce((s, c) => s + c.member_count, 0)} HCC captures would likely fail audit -- strengthen evidence.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  {["HCC Code", "Condition", "Members", "Avg MEAT", "Weakest Member", "Risk"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readiness.weakest_codes.map((code) => (
                  <tr key={code.hcc_code} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                    <td style={{ padding: "8px 12px", fontFamily: fonts.code, fontWeight: 600 }}>HCC {code.hcc_code}</td>
                    <td style={{ padding: "8px 12px" }}>{code.hcc_label}</td>
                    <td style={{ padding: "8px 12px" }}>{code.member_count}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: gaugeColor(code.avg_meat_score) }}>{code.avg_meat_score}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {code.weakest_member && (
                        <button
                          onClick={() => loadMemberProfile(code.weakest_member === "Robert Williams" ? "M1002" : "M1001")}
                          style={{ fontSize: 12, color: tokens.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                          {code.weakest_member}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                        background: code.risk_level === "high" ? tokens.redSoft : tokens.amberSoft,
                        color: code.risk_level === "high" ? tokens.red : tokens.amber,
                      }}>
                        {code.risk_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Member drill-down */}
          {memberProfile && (
            <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.heading, color: tokens.text }}>
                  {memberProfile.member_name} -- MEAT Breakdown
                </h2>
                <button
                  onClick={() => { setMemberProfile(null); setSelectedMember(""); }}
                  style={{ fontSize: 12, color: tokens.textMuted, background: "none", border: "none", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
              <div style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 12 }}>
                Overall Score: <strong style={{ color: gaugeColor(memberProfile.overall_score) }}>{memberProfile.overall_score}</strong>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    {["HCC", "Condition", "MEAT Score", "M", "E", "A", "T", "Evidence", "Vulnerability"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: tokens.textMuted, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberProfile.hccs.map((hcc) => (
                    <tr key={hcc.hcc_code} style={{ borderBottom: `1px solid ${tokens.borderSoft}` }}>
                      <td style={{ padding: "8px 10px", fontFamily: fonts.code, fontWeight: 600 }}>HCC {hcc.hcc_code}</td>
                      <td style={{ padding: "8px 10px" }}>{hcc.hcc_label}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: gaugeColor(hcc.meat_score) }}>{hcc.meat_score}</td>
                      <td style={{ padding: "8px 10px" }}>{meatCheck(hcc.meat_detail.monitored)}</td>
                      <td style={{ padding: "8px 10px" }}>{meatCheck(hcc.meat_detail.evaluated)}</td>
                      <td style={{ padding: "8px 10px" }}>{meatCheck(hcc.meat_detail.assessed)}</td>
                      <td style={{ padding: "8px 10px" }}>{meatCheck(hcc.meat_detail.treated)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                          background: hcc.evidence_strength === "strong" ? tokens.accentSoft : hcc.evidence_strength === "moderate" ? tokens.amberSoft : tokens.redSoft,
                          color: hcc.evidence_strength === "strong" ? tokens.accentText : hcc.evidence_strength === "moderate" ? tokens.amber : tokens.red,
                        }}>
                          {hcc.evidence_strength}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999,
                          background: hcc.vulnerability === "low" ? tokens.accentSoft : hcc.vulnerability === "medium" ? tokens.amberSoft : tokens.redSoft,
                          color: hcc.vulnerability === "low" ? tokens.accentText : hcc.vulnerability === "medium" ? tokens.amber : tokens.red,
                        }}>
                          {hcc.vulnerability}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
