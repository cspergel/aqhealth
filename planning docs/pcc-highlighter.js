/**
 * PCC Smart Highlighter + LLM Triage
 *
 * Runs AUTOMATICALLY when a PCC patient chart loads. No click required.
 *
 * Phase 1 (instant, <50ms): Regex-based highlighting
 *   - Scans progress notes table and highlights important rows
 *   - Injects category badges (BIMS, PHQ, Skin, etc.)
 *   - Highlights active diagnoses that map to HCCs
 *   - Flags code status prominently
 *
 * Phase 2 (async, ~1-2s): LLM triage pass
 *   - Sends note preview snippets to backend
 *   - Fast model (Haiku) classifies clinical significance
 *   - Catches things regex misses:
 *     "patient confused and agitated" → cognitive relevance
 *     "albumin 2.1, poor oral intake" → malnutrition suspect
 *     "wound care to sacral area" → pressure ulcer
 *   - Updates highlights with LLM-detected items
 *
 * This module is SEPARATE from the dashboard-scraper.js.
 * It runs on page load and provides visual cues.
 * The scraper runs on user action (Quick/Deep Scan button).
 */

(function () {
  "use strict";

  const nameBar =
    document.querySelector("span#name") ||
    document.querySelector("td.residentNameBarName span");
  if (!nameBar) return;

  // Skip Document Manager
  for (const t of document.querySelectorAll("table")) {
    if (t.querySelector("tr")?.textContent.includes("Document Name")) return;
  }

  console.log("[PCC Highlight] Initializing smart highlighter...");

  const BACKEND_URL = "http://localhost:8000";

  // ═══════════════════════════════════════════════════════════════
  // Styles injected into PCC page
  // ═══════════════════════════════════════════════════════════════

  const style = document.createElement("style");
  style.textContent = `
    /* Row highlights */
    .snf-hl-critical { background: rgba(239, 68, 68, 0.08) !important; border-left: 3px solid #ef4444 !important; }
    .snf-hl-high { background: rgba(245, 158, 11, 0.08) !important; border-left: 3px solid #f59e0b !important; }
    .snf-hl-medium { background: rgba(59, 130, 246, 0.06) !important; border-left: 3px solid #3b82f6 !important; }
    .snf-hl-llm { background: rgba(167, 139, 250, 0.08) !important; border-left: 3px solid #a78bfa !important; }

    /* Category badges */
    .snf-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.03em;
      margin-left: 6px;
      vertical-align: middle;
      line-height: 1.6;
    }
    .snf-badge-cognitive { background: #fef3c7; color: #92400e; }
    .snf-badge-mood { background: #ede9fe; color: #5b21b6; }
    .snf-badge-skin { background: #fee2e2; color: #991b1b; }
    .snf-badge-nutrition { background: #d1fae5; color: #065f46; }
    .snf-badge-safety { background: #dbeafe; color: #1e40af; }
    .snf-badge-admission { background: #e0e7ff; color: #3730a3; }
    .snf-badge-skilled { background: #f1f5f9; color: #475569; }
    .snf-badge-llm { background: #f3e8ff; color: #7c3aed; }
    .snf-badge-hcc { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }

    /* HCC diagnosis highlights */
    .snf-dx-hcc { position: relative; }
    .snf-dx-hcc::after {
      content: attr(data-hcc);
      display: inline-block;
      margin-left: 6px;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #6ee7b7;
      vertical-align: middle;
      font-family: monospace;
    }

    /* Code status banner enhancement */
    .snf-code-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99998;
      padding: 4px 16px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.05em;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .snf-code-banner.full-code { background: #d1fae5; color: #065f46; }
    .snf-code-banner.dnr { background: #fee2e2; color: #991b1b; }
    .snf-code-banner.comfort { background: #fef3c7; color: #92400e; }
    .snf-code-banner.unknown { background: #f1f5f9; color: #64748b; }

    /* Summary badge in corner */
    .snf-summary-pill {
      position: fixed;
      top: 32px;
      right: 20px;
      z-index: 99998;
      display: flex;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .snf-pill {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .snf-pill-hcc { background: #10b981; color: white; }
    .snf-pill-suspect { background: #f59e0b; color: white; }
    .snf-pill-gap { background: #ef4444; color: white; }

    /* Pulsing dot for LLM-detected items */
    .snf-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 4px;
      animation: snf-pulse 2s ease-in-out infinite;
    }
    .snf-dot-red { background: #ef4444; }
    .snf-dot-amber { background: #f59e0b; }
    .snf-dot-purple { background: #a78bfa; }
    @keyframes snf-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
  `;
  document.head.appendChild(style);

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Instant regex-based highlighting
  // ═══════════════════════════════════════════════════════════════

  const NOTE_PATTERNS = [
    { re: /bims|brief\s*interview\s*mental/i, cat: "cognitive", pri: 1, label: "BIMS" },
    { re: /phq[\s-]*[29]|patient\s*health\s*quest/i, cat: "mood", pri: 1, label: "PHQ" },
    { re: /csc[\s-]*.*(?:phq|bims)/i, cat: "cognitive", pri: 1, label: "Screen" },
    { re: /skin\s*(?:and|&)?\s*wound/i, cat: "skin", pri: 1, label: "Skin/Wound" },
    { re: /braden/i, cat: "skin", pri: 2, label: "Braden" },
    { re: /fall\s*risk|morse\s*fall/i, cat: "safety", pri: 2, label: "Fall Risk" },
    { re: /admission\s*(?:eval|assess|nurs)/i, cat: "admission", pri: 1, label: "Admission" },
    { re: /cam\b|confusion\s*assess|delirium/i, cat: "cognitive", pri: 1, label: "CAM" },
    { re: /nutrition|dietitian|dietary\s*(?:eval|note)/i, cat: "nutrition", pri: 2, label: "Nutrition" },
    { re: /daily\s*skilled/i, cat: "skilled", pri: 3, label: "Skilled" },
    { re: /pain\s*(?:assess|eval|manage)/i, cat: "safety", pri: 3, label: "Pain" },
    { re: /wound\s*care|pressure|ulcer|decub/i, cat: "skin", pri: 1, label: "Wound" },
    { re: /psych|behav|mental\s*health/i, cat: "mood", pri: 2, label: "Psych" },
    { re: /therapy\s*(?:eval|note)|PT\s+eval|OT\s+eval|speech/i, cat: "admission", pri: 2, label: "Therapy" },
  ];

  // Known HCC-bearing ICD-10 prefixes for quick diagnosis highlighting
  // (Lightweight — just the high-value families. Full enrichment happens backend.)
  const HCC_CODE_PREFIXES = {
    "E11": "DM", "E10": "DM", "F03": "Dementia", "F01": "Dementia", "F02": "Dementia",
    "G30": "Alzheimer", "I50": "CHF", "J44": "COPD", "N18": "CKD", "I48": "AFib",
    "F33": "Depression", "F32": "Depression", "F20": "Schizo", "C": "Cancer",
    "I63": "CVA", "I69": "CVA Late", "G82": "Paralysis", "G81": "Hemiplegia",
    "G20": "Parkinson", "B20": "HIV", "E43": "Malnutrition", "E44": "Malnutrition",
    "L89": "Pressure Ulcer", "I73": "PVD", "G35": "MS", "F31": "Bipolar",
    "G40": "Seizure", "K74": "Cirrhosis", "J96": "Resp Failure",
  };

  function highlightProgressNotes() {
    let notesContainer = null;
    let highlightCount = 0;

    for (const el of document.querySelectorAll("h2,h3,h4,.sectionHeader,td,span,div")) {
      if (/progress\s*notes/i.test(el.textContent) && el.textContent.length < 80) {
        notesContainer =
          el.closest("table") || el.closest(".panel") ||
          el.closest("section") || el.closest("div");
        break;
      }
    }
    if (!notesContainer) return 0;

    for (const row of notesContainer.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) continue;
      const rowText = cells.map((c) => c.textContent.trim()).join(" ");

      for (const np of NOTE_PATTERNS) {
        if (np.pattern ? np.pattern.test(rowText) : np.re.test(rowText)) {
          // Highlight the row
          const hlClass =
            np.pri <= 1 ? "snf-hl-critical" : np.pri <= 2 ? "snf-hl-high" : "snf-hl-medium";
          row.classList.add(hlClass);

          // Inject badge into first cell
          const firstCell = cells[0] || row;
          if (!firstCell.querySelector(".snf-badge")) {
            const badge = document.createElement("span");
            badge.className = `snf-badge snf-badge-${np.cat}`;
            badge.innerHTML = `<span class="snf-dot snf-dot-${np.pri <= 1 ? "red" : "amber"}"></span>${np.label}`;
            firstCell.appendChild(badge);
          }
          highlightCount++;
          break;
        }
      }
    }

    console.log(`[PCC Highlight] ${highlightCount} progress notes highlighted`);
    return highlightCount;
  }

  function highlightDiagnoses() {
    let hccCount = 0;

    // Find diagnosis section
    for (const h of document.querySelectorAll("h2,h3,h4,.sectionHeader,.panel-heading,th,legend,td,span")) {
      if (!/active\s*diagnos|problem\s*list/i.test(h.textContent)) continue;
      if (h.textContent.length > 80) continue;

      const container =
        h.closest("table") || h.closest(".panel") || h.closest("section") ||
        h.parentElement?.parentElement;
      if (!container) continue;

      for (const row of container.querySelectorAll("tr, li")) {
        const text = row.textContent.trim();
        const codeMatch = text.match(/([A-Z]\d[\d.]{1,6})/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        const prefix = code.substring(0, 3);

        // Check if this code prefix is a known HCC family
        let hccLabel = HCC_CODE_PREFIXES[prefix];
        if (!hccLabel && code.startsWith("C")) hccLabel = "Cancer"; // All C codes

        if (hccLabel) {
          row.classList.add("snf-hl-high");

          // Add HCC badge near the code
          const codeEl = findElementContaining(row, code);
          if (codeEl && !codeEl.querySelector(".snf-badge")) {
            const badge = document.createElement("span");
            badge.className = "snf-badge snf-badge-hcc";
            badge.textContent = `HCC · ${hccLabel}`;
            codeEl.appendChild(badge);
          }
          hccCount++;
        }
      }
    }

    console.log(`[PCC Highlight] ${hccCount} HCC diagnoses highlighted`);
    return hccCount;
  }

  function highlightCodeStatus() {
    const patterns = [
      { re: /\bfull\s*code\b/i, cls: "full-code", text: "FULL CODE" },
      { re: /\bDNR\s*\/?\s*DNI\b/i, cls: "dnr", text: "⚠ DNR/DNI" },
      { re: /\bDNR\b/i, cls: "dnr", text: "⚠ DNR" },
      { re: /\bcomfort\s*(?:care|measures)\b/i, cls: "comfort", text: "⚠ COMFORT CARE" },
      { re: /\bhospice\b/i, cls: "comfort", text: "⚠ HOSPICE" },
    ];

    // Check top of page
    for (const el of document.querySelectorAll("td, span, div, .badge")) {
      if (el.getBoundingClientRect().top > 350) continue;
      const t = el.textContent.trim();
      if (t.length > 200) continue;
      for (const p of patterns) {
        if (p.re.test(t)) {
          // Inject banner
          const banner = document.createElement("div");
          banner.className = `snf-code-banner ${p.cls}`;
          banner.textContent = `CODE STATUS: ${p.text}`;
          document.body.prepend(banner);
          document.body.style.marginTop = "28px";
          return p.text;
        }
      }
    }
    return null;
  }

  function findElementContaining(parent, text) {
    for (const el of parent.querySelectorAll("td, span, a")) {
      if (el.textContent.includes(text) && el.children.length === 0) return el;
    }
    return parent.querySelector("td") || parent;
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: LLM triage pass
  // ═══════════════════════════════════════════════════════════════

  async function llmTriageNotes() {
    /**
     * Collects all progress note snippets visible on the dashboard
     * and sends them to the backend for a fast LLM classification.
     *
     * The LLM identifies clinical significance that regex can't:
     * - "Resident receiving ABT PO for PNA" → pneumonia treatment, HCC-relevant
     * - "patient confused and agitated" → possible delirium
     * - "wound care to sacral area" → pressure ulcer suspect
     * - "albumin 2.1" → malnutrition indicator
     * - "new admission: alert, oriented" → baseline cognitive status
     */
    const snippets = [];

    // Collect note preview texts from the progress notes table
    let container = null;
    for (const el of document.querySelectorAll("h2,h3,h4,.sectionHeader,td,span,div")) {
      if (/progress\s*notes/i.test(el.textContent) && el.textContent.length < 80) {
        container = el.closest("table") || el.closest("div");
        break;
      }
    }

    if (!container) return;

    for (const row of container.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) continue;
      const rowText = cells.map((c) => c.textContent.trim()).join(" | ");
      if (rowText.length > 10 && !/^type\s*\|?\s*date/i.test(rowText)) {
        snippets.push({
          text: rowText.substring(0, 300),
          rowIndex: Array.from(container.querySelectorAll("tr")).indexOf(row),
          element: row,
        });
      }
    }

    // Also grab any visible text from diagnosis and medication sections
    // that might contain clinical hints
    const dashboardText = [];
    for (const h of document.querySelectorAll("h2,h3,h4,.sectionHeader,td,span")) {
      if (/active\s*diagnos|medication|allerg|vital/i.test(h.textContent) && h.textContent.length < 60) {
        const c = h.closest("table") || h.closest("section") || h.parentElement;
        if (c) dashboardText.push(c.textContent.trim().substring(0, 500));
      }
    }

    if (snippets.length === 0) return;

    console.log(`[PCC Highlight] Sending ${snippets.length} note snippets for LLM triage...`);

    try {
      const cfg = await new Promise((r) =>
        chrome.storage.local.get(["snfAssistUrl"], (res) => r(res.snfAssistUrl || BACKEND_URL))
      );

      const resp = await fetch(`${cfg}/api/llm-triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_snippets: snippets.map((s) => s.text),
          dashboard_context: dashboardText.join("\n---\n").substring(0, 2000),
        }),
      });

      if (!resp.ok) return;
      const result = await resp.json();

      // Apply LLM classifications to the page
      applyLLMHighlights(snippets, result.classifications);
    } catch (err) {
      console.warn("[PCC Highlight] LLM triage failed (non-critical):", err.message);
    }
  }

  function applyLLMHighlights(snippets, classifications) {
    /**
     * classifications is an array matching snippets, each with:
     * { relevant: bool, reason: str, category: str, hcc_hint: str|null, priority: 1-3 }
     */
    if (!classifications || !Array.isArray(classifications)) return;

    let llmHighlightCount = 0;

    for (let i = 0; i < classifications.length && i < snippets.length; i++) {
      const cls = classifications[i];
      const snippet = snippets[i];

      if (!cls.relevant) continue;

      // Only highlight if regex didn't already catch it
      if (snippet.element.classList.contains("snf-hl-critical") ||
          snippet.element.classList.contains("snf-hl-high")) continue;

      snippet.element.classList.add("snf-hl-llm");

      // Inject LLM-detected badge
      const firstCell = snippet.element.querySelector("td") || snippet.element;
      if (!firstCell.querySelector(".snf-badge-llm")) {
        const badge = document.createElement("span");
        badge.className = "snf-badge snf-badge-llm";
        badge.innerHTML = `<span class="snf-dot snf-dot-purple"></span>${cls.reason || cls.category || "Review"}`;
        badge.title = cls.hcc_hint
          ? `LLM: ${cls.reason} — Possible ${cls.hcc_hint}`
          : `LLM: ${cls.reason}`;
        firstCell.appendChild(badge);
      }

      llmHighlightCount++;
    }

    if (llmHighlightCount > 0) {
      console.log(`[PCC Highlight] LLM detected ${llmHighlightCount} additional important items`);
      // Update summary pill
      updateSummaryPill();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary pill (top-right corner)
  // ═══════════════════════════════════════════════════════════════

  function injectSummaryPill(noteCount, hccCount) {
    const existing = document.querySelector(".snf-summary-pill");
    if (existing) existing.remove();

    if (noteCount === 0 && hccCount === 0) return;

    const pill = document.createElement("div");
    pill.className = "snf-summary-pill";
    if (hccCount > 0) {
      pill.innerHTML += `<span class="snf-pill snf-pill-hcc">${hccCount} HCC Dx</span>`;
    }
    if (noteCount > 0) {
      pill.innerHTML += `<span class="snf-pill snf-pill-suspect">${noteCount} Important Notes</span>`;
    }
    document.body.appendChild(pill);
  }

  function updateSummaryPill() {
    const noteCount = document.querySelectorAll(".snf-hl-critical, .snf-hl-high, .snf-hl-llm").length;
    const hccCount = document.querySelectorAll(".snf-badge-hcc").length;
    injectSummaryPill(noteCount, hccCount);
  }

  // ═══════════════════════════════════════════════════════════════
  // Initialize — runs automatically on page load
  // ═══════════════════════════════════════════════════════════════

  // Phase 1: instant highlighting
  const noteHighlights = highlightProgressNotes();
  const hccHighlights = highlightDiagnoses();
  const codeStatus = highlightCodeStatus();
  injectSummaryPill(noteHighlights, hccHighlights);

  console.log(`[PCC Highlight] Phase 1 complete: ${noteHighlights} notes, ${hccHighlights} HCC dx, code status: ${codeStatus || "not found"}`);

  // Phase 2: async LLM triage (runs in background, non-blocking)
  setTimeout(() => llmTriageNotes(), 1000);
})();
