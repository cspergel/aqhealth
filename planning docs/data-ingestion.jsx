import { useState } from "react";

const C = {
  bg: "#09090b", surface: "#18181b", card: "#1c1c21",
  border: "#27272a", borderLight: "#3f3f46",
  text: "#fafafa", sub: "#a1a1aa", dim: "#71717a",
  g: "#22c55e", gM: "rgba(34,197,94,0.12)",
  b: "#3b82f6", bM: "rgba(59,130,246,0.12)",
  a: "#f59e0b", aM: "rgba(245,158,11,0.12)",
  r: "#ef4444", rM: "rgba(239,68,68,0.12)",
  p: "#a78bfa", pM: "rgba(167,139,250,0.1)",
  c: "#06b6d4", cM: "rgba(6,182,212,0.1)",
};
const mo = "'IBM Plex Mono','JetBrains Mono',monospace";
const sa = "'Outfit','Inter',system-ui,sans-serif";

const Badge = ({ children, color = C.g, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: mo, fontWeight: 600, color, background: bg || C.gM }}>{children}</span>
);
const Chip = ({ label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontFamily: mo, fontWeight: 700, color: C.p, background: C.pM }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.p }} />{label}
  </span>
);

// ═══════════════════════════════════════════════════════════════
// Supported file formats
// ═══════════════════════════════════════════════════════════════
const FILE_TYPES = [
  { ext: "834", name: "X12 834 Enrollment", category: "eligibility", desc: "Member enrollment/disenrollment, demographics, plan info", icon: "👥", auto: true },
  { ext: "837P", name: "X12 837P Professional Claims", category: "claims", desc: "Professional/physician claims with CPT, ICD-10, modifiers", icon: "📋", auto: true },
  { ext: "837I", name: "X12 837I Institutional Claims", category: "claims", desc: "Facility/institutional claims (inpatient, SNF, HH)", icon: "🏥", auto: true },
  { ext: "835", name: "X12 835 Remittance", category: "financial", desc: "ERA payment/denial data, adjustment reason codes", icon: "💰", auto: true },
  { ext: "270/271", name: "X12 270/271 Eligibility", category: "eligibility", desc: "Real-time eligibility inquiry/response", icon: "✓", auto: true },
  { ext: "CSV", name: "CSV / Delimited", category: "universal", desc: "Any tabular data — auto-mapped with AI column detection", icon: "📊", auto: true },
  { ext: "XLSX", name: "Excel Workbook", category: "universal", desc: "Multi-sheet workbooks, health plan reports, member rosters", icon: "📗", auto: true },
  { ext: "JSON", name: "JSON / FHIR Bundle", category: "clinical", desc: "FHIR R4 bundles, API exports, structured clinical data", icon: "🔗", auto: true },
  { ext: "HL7", name: "HL7v2 Messages", category: "clinical", desc: "ADT, ORU, ORM messages from hospitals/labs", icon: "⚡", auto: true },
  { ext: "PDF", name: "PDF Documents", category: "documents", desc: "Member rosters, plan reports, clinical records — OCR + AI extraction", icon: "📄", auto: false },
  { ext: "XML", name: "CCDA / CCD", category: "clinical", desc: "Continuity of Care Documents, clinical summaries", icon: "🏷️", auto: true },
  { ext: "TXT/DAT", name: "Fixed-Width / Custom", category: "legacy", desc: "Legacy flat files — AI pattern detection for field mapping", icon: "📝", auto: false },
];

// ═══════════════════════════════════════════════════════════════
// Data domains that get populated
// ═══════════════════════════════════════════════════════════════
const DATA_DOMAINS = [
  { id: "members", label: "Members / Eligibility", icon: "👥", sources: ["834", "CSV", "XLSX", "PDF"], fields: "demographics, plan, PCP attribution, enrollment dates" },
  { id: "claims", label: "Claims / Encounters", icon: "📋", sources: ["837P", "837I", "CSV", "XLSX"], fields: "service dates, CPT, ICD-10, charges, paid amounts, providers" },
  { id: "remittance", label: "Payments / Denials", icon: "💰", sources: ["835", "CSV", "XLSX"], fields: "paid amounts, denial codes, adjustment reasons, check details" },
  { id: "diagnoses", label: "Diagnosis History", icon: "🏷️", sources: ["837P", "837I", "CCDA", "FHIR", "CSV"], fields: "ICD-10 codes, HCC mapping, payment year, provider" },
  { id: "pharmacy", label: "Pharmacy / Rx", icon: "💊", sources: ["837P", "CSV", "XLSX", "FHIR"], fields: "NDC, drug name, days supply, cost, prescriber, PDC" },
  { id: "labs", label: "Lab Results", icon: "🧪", sources: ["HL7", "FHIR", "CSV", "XLSX"], fields: "LOINC codes, values, reference ranges, dates" },
  { id: "providers", label: "Provider Network", icon: "👨‍⚕️", sources: ["CSV", "XLSX", "834"], fields: "NPI, name, specialty, TIN, panel assignments" },
  { id: "quality", label: "Quality / HEDIS", icon: "⭐", sources: ["CSV", "XLSX", "FHIR"], fields: "measure rates, numerator/denominator, gap lists" },
  { id: "financial", label: "Financial / Capitation", icon: "📊", sources: ["CSV", "XLSX", "835"], fields: "cap payments, PMPM rates, MLR, IBNR, surplus/deficit" },
];

// ═══════════════════════════════════════════════════════════════
// Client ingestion status
// ═══════════════════════════════════════════════════════════════
const CLIENTS = [
  {
    name: "Sunstate Medical Group", status: "active", lives: 4200,
    feeds: [
      { name: "Humana 834 Eligibility", type: "834", freq: "Monthly", lastRun: "03/15/2026", records: 4247, status: "success", nextRun: "04/15/2026" },
      { name: "Humana 837P Claims", type: "837P", freq: "Weekly", lastRun: "03/21/2026", records: 12840, status: "success", nextRun: "03/28/2026" },
      { name: "Humana 835 Remittance", type: "835", freq: "Weekly", lastRun: "03/21/2026", records: 11200, status: "success", nextRun: "03/28/2026" },
      { name: "Aetna MA Claims Export", type: "CSV", freq: "Monthly", lastRun: "03/10/2026", records: 3420, status: "success", nextRun: "04/10/2026" },
      { name: "Quest Lab Results", type: "HL7", freq: "Daily", lastRun: "03/23/2026", records: 89, status: "success", nextRun: "03/24/2026" },
      { name: "Rx Claims (CVS Caremark)", type: "CSV", freq: "Monthly", lastRun: "03/05/2026", records: 8912, status: "success", nextRun: "04/05/2026" },
    ],
    domains: { members: 98, claims: 94, remittance: 92, diagnoses: 96, pharmacy: 88, labs: 72, providers: 100, quality: 65, financial: 90 },
  },
  {
    name: "Gulf Coast Primary Care", status: "active", lives: 2100,
    feeds: [
      { name: "UHC 834 Eligibility", type: "834", freq: "Monthly", lastRun: "03/12/2026", records: 2134, status: "success", nextRun: "04/12/2026" },
      { name: "UHC Claims Extract", type: "XLSX", freq: "Monthly", lastRun: "03/08/2026", records: 6200, status: "warning", nextRun: "04/08/2026", issue: "12 records failed column mapping" },
      { name: "athena EMR Export", type: "FHIR", freq: "Daily", lastRun: "03/23/2026", records: 342, status: "success", nextRun: "03/24/2026" },
    ],
    domains: { members: 96, claims: 82, remittance: 0, diagnoses: 84, pharmacy: 0, labs: 58, providers: 90, quality: 0, financial: 45 },
  },
  {
    name: "Bayside Physician Network", status: "onboarding", lives: 1650,
    feeds: [
      { name: "Member Roster (PDF)", type: "PDF", freq: "One-time", lastRun: "03/20/2026", records: 1650, status: "processing", nextRun: "—" },
      { name: "Historical Claims (Excel)", type: "XLSX", freq: "One-time", lastRun: "03/20/2026", records: 0, status: "mapping", nextRun: "—", issue: "Column mapping needed — 14 unmapped fields" },
    ],
    domains: { members: 72, claims: 0, remittance: 0, diagnoses: 0, pharmacy: 0, labs: 0, providers: 30, quality: 0, financial: 0 },
  },
];

// ═══════════════════════════════════════════════════════════════
// Column mapping simulation for CSV/Excel
// ═══════════════════════════════════════════════════════════════
const MAPPING_EXAMPLE = {
  filename: "uhc_claims_march_2026.xlsx",
  detectedColumns: [
    { source: "Patient_Last", aiMatch: "member.last_name", confidence: 98, status: "auto" },
    { source: "Patient_First", aiMatch: "member.first_name", confidence: 98, status: "auto" },
    { source: "DOB", aiMatch: "member.date_of_birth", confidence: 95, status: "auto" },
    { source: "Mbr_ID", aiMatch: "member.member_id", confidence: 97, status: "auto" },
    { source: "Svc_From", aiMatch: "claim.service_date_from", confidence: 94, status: "auto" },
    { source: "Svc_To", aiMatch: "claim.service_date_to", confidence: 92, status: "auto" },
    { source: "Proc_Code", aiMatch: "claim.cpt_code", confidence: 96, status: "auto" },
    { source: "Dx1", aiMatch: "claim.diagnosis_1", confidence: 99, status: "auto" },
    { source: "Dx2", aiMatch: "claim.diagnosis_2", confidence: 99, status: "auto" },
    { source: "Chrg_Amt", aiMatch: "claim.charge_amount", confidence: 93, status: "auto" },
    { source: "Pd_Amt", aiMatch: "claim.paid_amount", confidence: 91, status: "auto" },
    { source: "Rndr_NPI", aiMatch: "provider.npi", confidence: 97, status: "auto" },
    { source: "Place_Svc", aiMatch: "claim.place_of_service", confidence: 88, status: "auto" },
    { source: "Auth_Nbr", aiMatch: "claim.authorization_number", confidence: 82, status: "review" },
    { source: "Remark_Cd", aiMatch: "claim.remark_code", confidence: 72, status: "review" },
    { source: "SPEC_CD", aiMatch: "provider.specialty_code", confidence: 68, status: "review" },
    { source: "BEN_PLAN_TYP", aiMatch: null, confidence: 0, status: "unmapped" },
  ],
};

// ═══════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════

function ClientFeedsView({ client }) {
  const completeness = Object.values(client.domains);
  const avgComplete = Math.round(completeness.reduce((a, b) => a + b, 0) / completeness.length);

  return (
    <div style={{ marginTop: 16 }}>
      {/* Domain completeness heatmap */}
      <div style={{ fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Data Domain Completeness</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${DATA_DOMAINS.length}, 1fr)`, gap: 4, marginBottom: 20 }}>
        {DATA_DOMAINS.map((d) => {
          const val = client.domains[d.id] || 0;
          const color = val >= 90 ? C.g : val >= 70 ? C.a : val >= 40 ? C.a : val > 0 ? C.r : C.dim;
          const bg = val >= 90 ? C.gM : val >= 70 ? C.aM : val > 0 ? C.rM : C.surface;
          return (
            <div key={d.id} style={{ background: bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 16 }}>{d.icon}</div>
              <div style={{ fontFamily: mo, fontSize: 9, color: C.dim, marginTop: 2 }}>{d.label.split("/")[0].trim()}</div>
              <div style={{ fontFamily: mo, fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{val > 0 ? `${val}%` : "—"}</div>
            </div>
          );
        })}
      </div>

      {/* Feed status table */}
      <div style={{ fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Active Data Feeds</div>
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.5fr 0.5fr 0.7fr 0.5fr 0.5fr 1fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mo, color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Feed Name</span><span>Format</span><span>Frequency</span><span>Last Run</span><span>Records</span><span>Status</span><span>Issue</span>
        </div>
        {client.feeds.map((f, i) => {
          const statusColor = f.status === "success" ? C.g : f.status === "warning" ? C.a : f.status === "processing" ? C.b : f.status === "mapping" ? C.p : C.r;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.5fr 0.5fr 0.7fr 0.5fr 0.5fr 1fr", gap: 8, padding: "10px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: sa, fontSize: 12, fontWeight: 600, color: C.text }}>{f.name}</span>
              <Badge color={C.b} bg={C.bM}>{f.type}</Badge>
              <span style={{ fontFamily: mo, fontSize: 11, color: C.sub }}>{f.freq}</span>
              <span style={{ fontFamily: mo, fontSize: 11, color: C.sub }}>{f.lastRun}</span>
              <span style={{ fontFamily: mo, fontSize: 11, color: C.text }}>{f.records > 0 ? f.records.toLocaleString() : "—"}</span>
              <Badge color={statusColor} bg={`${statusColor}22`}>
                {f.status === "success" ? "✓" : f.status === "warning" ? "⚠" : f.status === "processing" ? "⟳" : f.status === "mapping" ? "⌗" : "✕"} {f.status.toUpperCase()}
              </Badge>
              <span style={{ fontFamily: sa, fontSize: 10, color: f.issue ? C.a : C.dim }}>{f.issue || "—"}</span>
            </div>
          );
        })}
      </div>

      {/* Overall stats */}
      <div style={{ marginTop: 12, padding: "10px 16px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: mo, fontSize: 11, color: C.sub }}>
          Overall data completeness: <span style={{ color: avgComplete >= 70 ? C.g : C.a, fontWeight: 700 }}>{avgComplete}%</span>
        </span>
        <span style={{ fontFamily: mo, fontSize: 11, color: C.sub }}>
          {client.feeds.length} active feeds · {client.feeds.reduce((s, f) => s + f.records, 0).toLocaleString()} total records ingested
        </span>
      </div>
    </div>
  );
}

function ColumnMappingView() {
  const cols = MAPPING_EXAMPLE.detectedColumns;
  const autoCount = cols.filter(c => c.status === "auto").length;
  const reviewCount = cols.filter(c => c.status === "review").length;
  const unmappedCount = cols.filter(c => c.status === "unmapped").length;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: mo, fontSize: 10, color: C.p, textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Column Mapping</div>
          <Chip label="AI MAPPER" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.g}>{autoCount} auto-mapped</Badge>
          <Badge color={C.a} bg={C.aM}>{reviewCount} needs review</Badge>
          {unmappedCount > 0 && <Badge color={C.r} bg={C.rM}>{unmappedCount} unmapped</Badge>}
        </div>
      </div>

      <div style={{ padding: "10px 16px", background: C.pM, borderRadius: 8, border: `1px solid ${C.p}22`, marginBottom: 12 }}>
        <span style={{ fontFamily: sa, fontSize: 12, color: C.p, fontWeight: 600 }}>
          File: {MAPPING_EXAMPLE.filename} — AI mapped {autoCount}/{cols.length} columns automatically ({Math.round(autoCount / cols.length * 100)}% auto-resolution rate)
        </span>
      </div>

      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 0.3fr 1.2fr 0.5fr 0.5fr", gap: 8, padding: "8px 14px", fontSize: 9, fontFamily: mo, color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
          <span>Source Column</span><span></span><span>Mapped To</span><span>Confidence</span><span>Status</span>
        </div>
        {cols.map((col, i) => {
          const sColor = col.status === "auto" ? C.g : col.status === "review" ? C.a : C.r;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 0.3fr 1.2fr 0.5fr 0.5fr",
              gap: 8, padding: "8px 14px", alignItems: "center", borderBottom: `1px solid ${C.border}`,
              background: col.status === "unmapped" ? C.rM : "transparent",
            }}>
              <span style={{ fontFamily: mo, fontSize: 12, fontWeight: 600, color: C.text }}>{col.source}</span>
              <span style={{ fontFamily: mo, fontSize: 12, color: C.dim }}>→</span>
              <span style={{ fontFamily: mo, fontSize: 11, color: col.aiMatch ? C.sub : C.r }}>
                {col.aiMatch || "⚠ No match — manual mapping required"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border }}>
                  <div style={{ width: `${col.confidence}%`, height: "100%", borderRadius: 2, background: col.confidence >= 90 ? C.g : col.confidence >= 70 ? C.a : C.r }} />
                </div>
                <span style={{ fontFamily: mo, fontSize: 10, color: sColor }}>{col.confidence > 0 ? `${col.confidence}%` : "—"}</span>
              </div>
              <Badge color={sColor} bg={`${sColor}22`}>
                {col.status === "auto" ? "✓ AUTO" : col.status === "review" ? "⚠ REVIEW" : "✕ MANUAL"}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadView() {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Upload New Data</div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? C.g : C.borderLight}`,
          borderRadius: 12, padding: "40px 24px", textAlign: "center",
          background: dragOver ? C.gM : C.surface, transition: "all 0.2s",
          cursor: "pointer", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.6 }}>📂</div>
        <div style={{ fontFamily: sa, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
          Drop files here or click to browse
        </div>
        <div style={{ fontFamily: sa, fontSize: 12, color: C.sub, marginBottom: 12 }}>
          Accepts X12 (834, 837, 835), CSV, Excel, JSON, FHIR, HL7, CCDA, PDF, and custom flat files
        </div>
        <div style={{ fontFamily: sa, fontSize: 11, color: C.dim }}>
          AI auto-detects format, maps columns, validates data, and routes to the correct domain
        </div>
      </div>

      {/* Supported formats grid */}
      <div style={{ fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Supported Formats</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {FILE_TYPES.map((ft, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{ft.icon}</span>
              {ft.auto && <Badge color={C.p} bg={C.pM}>AUTO</Badge>}
            </div>
            <div style={{ fontFamily: sa, fontWeight: 600, fontSize: 11, color: C.text }}>{ft.name}</div>
            <div style={{ fontFamily: mo, fontSize: 9, color: C.dim, marginTop: 2 }}>{ft.ext}</div>
            <div style={{ fontFamily: sa, fontSize: 10, color: C.sub, marginTop: 4, lineHeight: 1.4 }}>{ft.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Pipeline spec (shown as visual in the UI)
// ═══════════════════════════════════════════════════════════════
function PipelineView() {
  const steps = [
    { name: "Intake", desc: "File upload, SFTP drop, API push, scheduled pull", icon: "📥", color: C.b },
    { name: "Detect", desc: "AI identifies format (X12, CSV, HL7, FHIR, PDF), encoding, delimiters", icon: "🔍", color: C.p },
    { name: "Parse", desc: "Format-specific parser extracts structured records. X12 segment/loop parsing, CSV column split, HL7 segment parsing, PDF OCR", icon: "⚙️", color: C.c },
    { name: "Map", desc: "AI maps source fields → standard schema. Auto-maps common patterns, flags ambiguous fields for human review", icon: "🗺️", color: C.p },
    { name: "Validate", desc: "Data quality checks: required fields, format validation, referential integrity, duplicate detection, date range checks", icon: "✅", color: C.g },
    { name: "Enrich", desc: "ICD-10→HCC mapping, RAF calculation, HEDIS measure eligibility flagging, provider NPI enrichment", icon: "💎", color: C.a },
    { name: "Load", desc: "Write to normalized tables. Upsert logic for incremental updates. Full audit trail of every record", icon: "💾", color: C.g },
    { name: "Alert", desc: "Notify on: ingestion complete, validation failures, data quality anomalies, missing expected feeds", icon: "🔔", color: C.r },
  ];

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ingestion Pipeline</div>
        <Chip label="AUTOMATED" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, borderTop: `2px solid ${step.color}`, position: "relative" }}>
            {i < steps.length - 1 && i % 4 !== 3 && (
              <div style={{ position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", color: C.dim, fontSize: 12 }}>→</div>
            )}
            <div style={{ fontSize: 20, marginBottom: 6 }}>{step.icon}</div>
            <div style={{ fontFamily: sa, fontWeight: 700, fontSize: 12, color: C.text }}>{step.name}</div>
            <div style={{ fontFamily: sa, fontSize: 10, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>{step.desc}</div>
          </div>
        ))}
      </div>

      {/* Delivery methods */}
      <div style={{ marginTop: 16, fontFamily: mo, fontSize: 10, color: C.c, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Data Delivery Methods</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { method: "Web Upload", desc: "Drag & drop in portal. Instant processing.", icon: "🌐", status: "Available" },
          { method: "SFTP Drop", desc: "Scheduled file drops. Auto-pickup every 15min.", icon: "📁", status: "Available" },
          { method: "API Push", desc: "REST API endpoint. Real-time record ingestion.", icon: "🔌", status: "Available" },
          { method: "Scheduled Pull", desc: "Platform pulls from client's SFTP/API on schedule.", icon: "⏰", status: "Available" },
        ].map((d, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{d.icon}</div>
            <div style={{ fontFamily: sa, fontWeight: 600, fontSize: 12, color: C.text }}>{d.method}</div>
            <div style={{ fontFamily: sa, fontSize: 10, color: C.sub, marginTop: 4 }}>{d.desc}</div>
            <Badge color={C.g} bg={C.gM}>{d.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
export default function DataIngestion() {
  const [selectedClient, setSelectedClient] = useState(0);
  const [tab, setTab] = useState("feeds");

  const tabs = [
    { id: "feeds", label: "Data Feeds" },
    { id: "upload", label: "Upload Data" },
    { id: "mapping", label: "Column Mapping" },
    { id: "pipeline", label: "Pipeline" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: sa }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(9,9,11,0.95)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.g}, ${C.b})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: mo, color: "#000" }}>A</div>
          <span style={{ fontFamily: mo, fontWeight: 700, fontSize: 14 }}>AQSoft<span style={{ color: C.g }}>.AI</span></span>
          <span style={{ fontFamily: mo, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>Data Ingestion</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? C.surface : "transparent",
              border: tab === t.id ? `1px solid ${C.borderLight}` : "1px solid transparent",
              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
              fontFamily: mo, fontSize: 11, fontWeight: 600,
              color: tab === t.id ? C.g : C.sub, transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
        <Badge color={C.dim} bg={C.surface}>{CLIENTS.length} clients</Badge>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
        {/* Client sidebar */}
        <div style={{ borderRight: `1px solid ${C.border}`, padding: "16px 0" }}>
          <div style={{ padding: "0 16px 12px", fontFamily: mo, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>MSO Clients</div>
          {CLIENTS.map((client, i) => {
            const avgComplete = Math.round(Object.values(client.domains).reduce((a, b) => a + b, 0) / Object.values(client.domains).length);
            return (
              <div key={i} onClick={() => setSelectedClient(i)} style={{
                padding: "12px 16px", cursor: "pointer",
                background: selectedClient === i ? C.surface : "transparent",
                borderLeft: selectedClient === i ? `3px solid ${C.g}` : "3px solid transparent",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ fontFamily: sa, fontWeight: 600, fontSize: 13, color: C.text }}>{client.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontFamily: mo, fontSize: 10, color: C.dim }}>{client.lives.toLocaleString()} lives</span>
                  <Badge color={client.status === "active" ? C.g : client.status === "onboarding" ? C.b : C.dim} bg={client.status === "active" ? C.gM : client.status === "onboarding" ? C.bM : C.surface}>
                    {client.status.toUpperCase()}
                  </Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.border }}>
                    <div style={{ width: `${avgComplete}%`, height: "100%", borderRadius: 2, background: avgComplete >= 70 ? C.g : avgComplete >= 40 ? C.a : C.r }} />
                  </div>
                  <span style={{ fontFamily: mo, fontSize: 9, color: C.dim }}>{avgComplete}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main content */}
        <div style={{ padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ fontFamily: sa, fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>{CLIENTS[selectedClient].name}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <Badge>{CLIENTS[selectedClient].lives.toLocaleString()} lives</Badge>
              <Badge color={C.b} bg={C.bM}>{CLIENTS[selectedClient].feeds.length} feeds</Badge>
            </div>
          </div>

          {tab === "feeds" && <ClientFeedsView client={CLIENTS[selectedClient]} />}
          {tab === "upload" && <UploadView />}
          {tab === "mapping" && <ColumnMappingView />}
          {tab === "pipeline" && <PipelineView />}
        </div>
      </div>
    </div>
  );
}
