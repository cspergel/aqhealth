/**
 * PCC Dashboard Scraper v2 — Smart Note Scanner
 *
 * Two modes:
 *   Quick Scan: scrapes dashboard (dx, meds, vitals, code status, allergies)
 *   Deep Scan:  + identifies high-value notes in progress notes table
 *               + clicks "view" on BIMS, PHQ, skin/wound notes
 *               + extracts screening scores from note content
 *               + closes modal and moves to next note
 *
 * Injects floating "Chart Prep" button on PCC patient chart pages.
 */

(function () {
  "use strict";

  const nameBar = document.querySelector("span#name") ||
    document.querySelector("td.residentNameBarName span");
  if (!nameBar) return;
  // Skip Document Manager pages (handled by content.js)
  const docTable = document.querySelector("table");
  if (docTable && docTable.querySelector("tr")?.textContent.includes("Document Name")) return;

  console.log("[PCC Scraper v2] Patient chart detected");

  const SNF_ASSIST_URL = "http://localhost:8000";
  let scrapedData = null;

  // ═══════════════════════════════════════════════════════════════════
  // HIGH-VALUE NOTE PATTERNS — what to click into during Deep Scan
  // ═══════════════════════════════════════════════════════════════════
  const NOTE_PATTERNS = [
    { pattern: /bims|brief\s*interview\s*mental/i, cat: "cognitive", pri: 1, label: "BIMS" },
    { pattern: /phq[\s-]*[29]|patient\s*health\s*quest/i, cat: "mood", pri: 1, label: "PHQ" },
    { pattern: /csc[\s-]*.*(?:phq|bims)/i, cat: "screening", pri: 1, label: "CSC Screen" },
    { pattern: /skin\s*(?:and|&)?\s*wound/i, cat: "skin", pri: 1, label: "Skin/Wound" },
    { pattern: /braden/i, cat: "skin", pri: 2, label: "Braden" },
    { pattern: /fall\s*risk|morse/i, cat: "safety", pri: 2, label: "Fall Risk" },
    { pattern: /admission\s*(?:eval|assess|nurs)/i, cat: "admission", pri: 1, label: "Admission Eval" },
    { pattern: /cam\b|confusion\s*assess|delirium/i, cat: "cognitive", pri: 1, label: "CAM" },
    { pattern: /nutrition|dietitian/i, cat: "nutrition", pri: 2, label: "Nutrition" },
    { pattern: /daily\s*skilled/i, cat: "skilled", pri: 3, label: "Skilled Note" },
    { pattern: /pain\s*(?:assess|eval)/i, cat: "pain", pri: 3, label: "Pain Assess" },
  ];

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD SCRAPERS (Phase 1 — instant)
  // ═══════════════════════════════════════════════════════════════════

  function extractPatientInfo() {
    const info = { name: "Unknown", mrn: "", dob: "", age: "", sex: "", facility: "" };
    const el = document.querySelector("span#name") || document.querySelector("td.residentNameBarName span");
    if (el) {
      const raw = el.textContent.trim();
      const m = raw.match(/\((\d+)\)\s*$/);
      if (m) { info.mrn = m[1]; info.name = raw.replace(/\s*\(\d+\)\s*$/, "").trim(); }
      else info.name = raw;
    }
    const ps = document.querySelectorAll("td.residentProfileDetails p, .residentDetails p");
    for (const p of ps) {
      const t = p.textContent;
      const d = t.match(/DOB:\s*([\d\/]+)/); if (d) info.dob = d[1];
      const a = t.match(/Age:\s*(\d+)/); if (a) info.age = a[1];
      const g = t.match(/Gender:\s*(\w+)/); if (g) info.sex = g[1];
    }
    const f = document.querySelector("#pccFacLink"); if (f) info.facility = f.textContent.trim();
    return info;
  }

  function scrapeCodeStatus() {
    const patterns = [
      { re: /\bfull\s*code\b/i, s: "Full Code" }, { re: /\bDNR\s*\/?\s*DNI\b/i, s: "DNR/DNI" },
      { re: /\bDNR\b(?!\s*\/?\s*DNI)/i, s: "DNR" }, { re: /\bcomfort\s*(?:care|measures)\b/i, s: "Comfort Care" },
      { re: /\bhospice\b/i, s: "Hospice" },
    ];
    // Check top of page first (code status is typically in header/banner)
    for (const el of document.querySelectorAll("td, span, div, .badge")) {
      if (el.getBoundingClientRect().top > 350) continue;
      const t = el.textContent.trim();
      if (t.length > 200) continue;
      for (const p of patterns) { if (p.re.test(t)) return { status: p.s, raw: t.substring(0, 150) }; }
    }
    // Fallback: full page
    for (const p of patterns) { if (p.re.test(document.body.innerText)) return { status: p.s, raw: "" }; }
    return { status: null, raw: "" };
  }

  function scrapeSectionByHeader(headerRegex, skipHeaderRegex) {
    const items = [], seen = new Set();
    for (const h of document.querySelectorAll("h2,h3,h4,.sectionHeader,.panel-heading,th,legend,td,span")) {
      if (!headerRegex.test(h.textContent) || h.textContent.length > 100) continue;
      const c = h.closest("table") || h.closest(".panel") || h.closest("section") || h.parentElement?.parentElement;
      if (!c) continue;
      for (const row of c.querySelectorAll("tr, li")) {
        const t = row.textContent.trim();
        if (t.length < 3 || t.length > 500) continue;
        if (skipHeaderRegex && skipHeaderRegex.test(t)) continue;
        const key = t.toLowerCase().substring(0, 80);
        if (!seen.has(key)) { seen.add(key); items.push(t); }
      }
    }
    return items;
  }

  function scrapeDiagnoses() {
    const raw = scrapeSectionByHeader(/active\s*diagnos|problem\s*list|active\s*dx/i, /^type\s*date|^description/i);
    return raw.map(t => {
      const m = t.match(/([A-Z]\d[\d.]{1,6})/);
      return { code: m ? m[1] : null, description: m ? t.replace(m[1], "").trim() : t, raw_text: t };
    });
  }

  function scrapeMedications() {
    const raw = scrapeSectionByHeader(/medication|med\s*list|active\s*med/i, /^medication|^drug|^name.*dose/i);
    return raw.map(t => {
      const m = t.match(/^(.+?)\s+(\d+[\d.,]*\s*(?:mg|mcg|ml|units?|g|%|mEq))/i);
      return m ? { name: m[1].trim(), dose: m[2].trim(), full_text: t } : { name: t, dose: "", full_text: t };
    });
  }

  function scrapeAllergies() {
    const raw = scrapeSectionByHeader(/allerg/i, null);
    if (raw.some(t => /no\s*known|nkda|nka/i.test(t))) return [{ allergen: "NKDA" }];
    return raw.map(t => ({ allergen: t }));
  }

  function scrapeVitals() {
    const v = {}, t = document.body.innerText;
    const ps = [["bp",/BP[:\s]*([\d]+\/[\d]+)/i],["hr",/(?:HR|Pulse)[:\s]*([\d]+)/i],
      ["temp",/Temp[:\s]*([\d.]+)/i],["spo2",/(?:SpO2|O2\s*Sat)[:\s]*([\d.]+)/i],
      ["weight",/Weight[:\s]*([\d.]+)/i],["bmi",/BMI[:\s]*([\d.]+)/i]];
    for (const [k,r] of ps) { const m = t.match(r); if (m) v[k] = m[1]; }
    return v;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROGRESS NOTES TABLE SCANNER
  // ═══════════════════════════════════════════════════════════════════

  function scanProgressNotesTable() {
    const notes = [];
    let container = null;

    // Find "Progress Notes" section
    for (const el of document.querySelectorAll("h2,h3,h4,.sectionHeader,td,span,div")) {
      if (/progress\s*notes/i.test(el.textContent) && el.textContent.length < 80) {
        container = el.closest("table") || el.closest(".panel") || el.closest("section") || el.closest("div");
        break;
      }
    }
    if (!container) return notes;

    for (const row of container.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) continue;
      const rowText = cells.map(c => c.textContent.trim()).join(" ");
      if (/^type\s*date|^display/i.test(rowText)) continue; // header row

      // Find the "view" link
      let viewEl = null;
      for (const a of row.querySelectorAll("a")) {
        const t = a.textContent.trim().toLowerCase();
        if (t === "view" || a.getAttribute("onclick")?.includes("view") || a.getAttribute("href")?.includes("view")) {
          viewEl = a;
          break;
        }
      }

      // Extract date
      let date = "";
      for (const c of cells) {
        const m = c.textContent.trim().match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/);
        if (m) { date = m[0]; break; }
      }

      // Match against high-value patterns
      let importance = "low", cat = null, label = null, pri = 99;
      for (const np of NOTE_PATTERNS) {
        if (np.pattern.test(rowText)) {
          importance = np.pri <= 1 ? "critical" : np.pri <= 2 ? "high" : "medium";
          cat = np.cat; label = np.label; pri = np.pri;
          break;
        }
      }

      notes.push({ type: cells[0]?.textContent.trim() || "", date, description: rowText.substring(0, 200), viewEl, importance, category: cat, label, priority: pri });
    }

    notes.sort((a, b) => a.priority - b.priority);
    console.log(`[PCC Scraper] ${notes.length} notes found, ${notes.filter(n => n.importance !== "low").length} high-value`);
    return notes;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEEP SCAN — click into notes and extract content
  // ═══════════════════════════════════════════════════════════════════

  async function deepScanNotes(notes) {
    const results = [];
    const targets = notes.filter(n => n.importance !== "low" && n.viewEl);

    for (let i = 0; i < targets.length; i++) {
      const note = targets[i];
      updateStatus(`Reading ${i + 1}/${targets.length}: ${note.label || note.type}...`);

      try {
        const beforeLen = document.body.innerText.length;
        const beforeModals = document.querySelectorAll(".modal,.dialog,[role='dialog'],.ui-dialog,.fancybox-wrap").length;

        // Click view
        note.viewEl.click();

        // Wait for content
        const content = await waitForContent(beforeLen, beforeModals, 5000);

        if (content && content.length > 30) {
          const scores = extractScores(content);
          results.push({
            type: note.type, date: note.date, label: note.label,
            category: note.category, importance: note.importance,
            content_length: content.length,
            full_content: content.substring(0, 5000), // Cap at 5K chars
            extracted_scores: scores,
          });
          console.log(`[PCC Scraper] "${note.label}": ${content.length} chars, scores:`, scores);
        }

        // Close modal
        await sleep(200);
        closeModal();
        await sleep(300);
      } catch (err) {
        console.warn(`[PCC Scraper] Failed: ${note.label}`, err);
      }
    }
    return results;
  }

  async function waitForContent(beforeLen, beforeModals, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(200);

      // Check for new modals/dialogs
      const modals = document.querySelectorAll(
        ".modal.show,.modal.in,.dialog:not([style*='display: none']),[role='dialog']:not([style*='display: none']),.ui-dialog,.fancybox-wrap,.note-content,.note-detail,.progress-note-view,.modal-body"
      );
      if (modals.length > beforeModals) {
        await sleep(300);
        return modals[modals.length - 1].innerText;
      }

      // Check iframes
      for (const f of document.querySelectorAll("iframe")) {
        try { const d = f.contentDocument?.body?.innerText; if (d && d.length > 50) return d; } catch (e) {}
      }

      // Check inline expansion
      if (document.body.innerText.length - beforeLen > 200) {
        const expanded = document.querySelector(".note-expanded,.note-body,.note-content,.expanded-content,.detail-view");
        if (expanded) return expanded.innerText;
      }
    }
    return null;
  }

  function closeModal() {
    for (const btn of document.querySelectorAll(".modal .close,.btn-close,[role='dialog'] .close,.ui-dialog-titlebar-close,.fancybox-close,button[aria-label='Close']")) {
      if (btn.offsetParent !== null) { btn.click(); return; }
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
  }

  // ═══════════════════════════════════════════════════════════════════
  // SCORE EXTRACTION from note text
  // ═══════════════════════════════════════════════════════════════════

  function extractScores(text) {
    const s = {};
    if (!text) return s;

    // BIMS (0-15)
    for (const r of [/BIMS\s*(?:Total\s*)?(?:Score)?[:\s=]*(\d{1,2})/i, /Brief\s*Interview.*?Mental\s*Status[:\s=]*(\d{1,2})/i, /Summary\s*Score[:\s=]*(\d{1,2})\s*(?:\/\s*15)?/i]) {
      const m = text.match(r); if (m && parseInt(m[1]) <= 15) { s.bims = parseInt(m[1]); break; }
    }

    // PHQ-9 (0-27)
    for (const r of [/PHQ[\s-]*9\s*(?:Total\s*)?(?:Score)?[:\s=]*(\d{1,2})/i, /Total\s*Severity\s*Score[:\s=]*(\d{1,2})/i]) {
      const m = text.match(r); if (m && parseInt(m[1]) <= 27) { s.phq9 = parseInt(m[1]); break; }
    }

    // PHQ-9 from individual items (if total not found)
    if (!s.phq9) {
      const items = [];
      for (const r of [/little\s*interest[:\s]*(\d)/i, /feeling\s*down[:\s]*(\d)/i, /trouble.*sleep[:\s]*(\d)/i, /feeling\s*tired[:\s]*(\d)/i, /poor\s*appetite[:\s]*(\d)/i, /feeling\s*bad[:\s]*(\d)/i, /trouble\s*concentrat[:\s]*(\d)/i, /moving.*slowly[:\s]*(\d)/i, /thoughts.*dead[:\s]*(\d)/i]) {
        const m = text.match(r); if (m) items.push(parseInt(m[1]));
      }
      if (items.length >= 7) { s.phq9 = items.reduce((a, b) => a + b, 0); s._phq9_calculated = true; }
    }

    // PHQ-2
    const phq2 = text.match(/PHQ[\s-]*2\s*(?:Score)?[:\s=]*(\d)/i);
    if (phq2) s.phq2 = parseInt(phq2[1]);

    // CAM
    const cam = text.match(/CAM[:\s]*(positive|negative|pos|neg)/i);
    if (cam) s.cam = cam[1].toLowerCase().startsWith("pos") ? "positive" : "negative";

    // Braden (6-23)
    const braden = text.match(/Braden\s*(?:Scale\s*)?(?:Score|Total)?[:\s=]*(\d{1,2})/i);
    if (braden) s.braden = parseInt(braden[1]);

    // Fall risk
    const fall = text.match(/(?:Morse|fall)\s*(?:Fall\s*)?(?:Risk\s*)?Score[:\s=]*(\d{1,3})/i);
    if (fall) s.fall_risk = parseInt(fall[1]);

    // Pain (0-10)
    const pain = text.match(/pain\s*(?:scale|score|level)[:\s=]*(\d{1,2})\s*(?:\/10)?/i);
    if (pain && parseInt(pain[1]) <= 10) s.pain_scale = parseInt(pain[1]);

    // Labs in notes
    const gfr = text.match(/(?:eGFR|GFR)[:\s=]*([\d.]+)/i); if (gfr) s.egfr = parseFloat(gfr[1]);
    const a1c = text.match(/(?:HbA1c|A1C)[:\s=]*([\d.]+)/i); if (a1c) s.hba1c = parseFloat(a1c[1]);
    const alb = text.match(/Albumin[:\s=]*([\d.]+)/i); if (alb) s.albumin = parseFloat(alb[1]);

    // Pressure ulcer
    const pu = text.match(/(?:pressure\s*(?:ulcer|injury)|stage)\s*(?:stage\s*)?(\d|unstageable)/i);
    if (pu) s.pressure_ulcer_stage = pu[1];

    return s;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════

  async function scrapeAll(deep = false) {
    const data = {
      patient: extractPatientInfo(), diagnoses: scrapeDiagnoses(),
      medications: scrapeMedications(), vitals: scrapeVitals(),
      code_status: scrapeCodeStatus(), allergies: scrapeAllergies(),
      clinical_scores: {}, progress_notes: [], note_contents: [],
      scraped_at: new Date().toISOString(), source_url: window.location.href, deep_scan: deep,
    };

    // Scan progress notes table
    const notes = scanProgressNotesTable();
    data.progress_notes = notes.map(n => ({
      type: n.type, date: n.date, label: n.label,
      category: n.category, importance: n.importance,
      description: n.description,
    }));

    if (deep) {
      // Phase 2: click into high-value notes
      data.note_contents = await deepScanNotes(notes);
      // Merge scores from all notes (latest wins)
      const merged = {};
      for (const nc of data.note_contents) Object.assign(merged, nc.extracted_scores);
      data.clinical_scores = merged;
    } else {
      // Quick: regex the visible page
      data.clinical_scores = extractScores(document.body.innerText);
    }

    scrapedData = data;
    return data;
  }

  async function sendToBackend(data) {
    const cfg = await new Promise(r => chrome.storage.local.get(["snfAssistUrl"], res => r(res.snfAssistUrl || SNF_ASSIST_URL)));
    const resp = await fetch(`${cfg}/api/chart-prep`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  // ═══════════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════════

  function updateStatus(msg) { const el = document.getElementById("snf-status"); if (el) el.textContent = msg; }

  function renderStats(data) {
    const el = document.getElementById("snf-stats");
    const sc = data.clinical_scores || {};
    const hvn = (data.progress_notes || []).filter(n => n.importance !== "low");

    let h = `<div class="sr"><span class="sl">Patient</span><span class="sv">${data.patient.name}</span></div>`;
    h += `<div class="sr"><span class="sl">Code Status</span><span class="sv ${data.code_status?.status === "Full Code" ? "g" : "w"}">${data.code_status?.status || "?"}</span></div>`;
    h += `<div class="sr"><span class="sl">Diagnoses</span><span class="sv g">${data.diagnoses.length}</span></div>`;
    h += `<div class="sr"><span class="sl">Medications</span><span class="sv">${data.medications.length}</span></div>`;
    h += `<div class="sr"><span class="sl">Allergies</span><span class="sv">${data.allergies.map(a => a.allergen).join(", ") || "—"}</span></div>`;

    if (hvn.length) {
      h += `<div class="sh">Important Notes Found</div><div style="margin-bottom:6px">`;
      for (const n of hvn) h += `<span class="nt ${n.importance}">${n.label || n.type}</span>`;
      h += `</div>`;
    }
    if (data.note_contents?.length) h += `<div class="sr"><span class="sl">Notes read (deep)</span><span class="sv g">${data.note_contents.length}</span></div>`;

    if (Object.keys(sc).length) {
      h += `<div class="sh">Clinical Scores</div>`;
      if (sc.bims != null) h += `<div class="sr"><span class="sl">BIMS</span><span class="sv ${sc.bims <= 12 ? "w" : ""}">${sc.bims}/15 ${sc.bims <= 7 ? "⚠ severe" : sc.bims <= 12 ? "⚠ moderate" : "✓"}</span></div>`;
      if (sc.phq9 != null) h += `<div class="sr"><span class="sl">PHQ-9</span><span class="sv ${sc.phq9 >= 10 ? "w" : ""}">${sc.phq9}/27 ${sc.phq9 >= 20 ? "⚠ severe" : sc.phq9 >= 15 ? "⚠ mod-sev" : sc.phq9 >= 10 ? "⚠ moderate" : "✓"}</span></div>`;
      if (sc.cam) h += `<div class="sr"><span class="sl">CAM</span><span class="sv ${sc.cam === "positive" ? "w" : "g"}">${sc.cam}</span></div>`;
      if (sc.braden != null) h += `<div class="sr"><span class="sl">Braden</span><span class="sv ${sc.braden <= 18 ? "w" : ""}">${sc.braden} ${sc.braden <= 12 ? "⚠ high risk" : sc.braden <= 18 ? "⚠ risk" : "✓"}</span></div>`;
      if (sc.egfr != null) h += `<div class="sr"><span class="sl">eGFR</span><span class="sv ${sc.egfr < 60 ? "w" : ""}">${sc.egfr}</span></div>`;
      if (sc.hba1c != null) h += `<div class="sr"><span class="sl">HbA1c</span><span class="sv ${sc.hba1c >= 6.5 ? "w" : ""}">${sc.hba1c}%</span></div>`;
      if (sc.albumin != null) h += `<div class="sr"><span class="sl">Albumin</span><span class="sv ${sc.albumin < 3.5 ? "w" : ""}">${sc.albumin}</span></div>`;
      if (sc.pressure_ulcer_stage) h += `<div class="sr"><span class="sl">Press. Ulcer</span><span class="sv w">Stage ${sc.pressure_ulcer_stage}</span></div>`;
    }
    el.innerHTML = h;
  }

  function injectUI() {
    const existing = document.getElementById("snf-fab"); if (existing) existing.remove();
    const d = document.createElement("div"); d.id = "snf-fab";
    d.innerHTML = `
    <style>
      #snf-fab{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      #snf-fab .fb{background:linear-gradient(135deg,#10b981,#3b82f6);color:#fff;border:none;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(16,185,129,.4);display:flex;align-items:center;gap:8px;transition:all .2s}
      #snf-fab .fb:hover{transform:translateY(-2px);box-shadow:0 6px 25px rgba(16,185,129,.5)}
      #snf-fab .fp{display:none;position:absolute;bottom:56px;right:0;width:360px;background:#111827;border:1px solid #1e293b;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:16px;color:#e2e8f0;max-height:80vh;overflow-y:auto}
      #snf-fab .fp.open{display:block}
      #snf-fab .pt{font-weight:700;font-size:14px;margin-bottom:12px;color:#10b981}
      #snf-fab .sr{display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #1e293b}
      #snf-fab .sl{color:#8899b0} #snf-fab .sv{color:#e2e8f0;font-weight:600}
      #snf-fab .sv.g{color:#10b981} #snf-fab .sv.w{color:#f59e0b}
      #snf-fab .sh{font-size:11px;color:#f59e0b;font-weight:700;margin-top:10px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid #1e293b;padding-top:8px}
      #snf-fab .nt{display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;margin:2px}
      #snf-fab .nt.critical{background:rgba(239,68,68,.15);color:#ef4444}
      #snf-fab .nt.high{background:rgba(245,158,11,.15);color:#f59e0b}
      #snf-fab .nt.medium{background:rgba(59,130,246,.15);color:#3b82f6}
      #snf-fab .br{display:flex;gap:6px;margin-top:12px}
      #snf-fab .ab{flex:1;padding:10px;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer}
      #snf-fab .bq{background:#1e293b;color:#8899b0;border:1px solid #2d3a4f} #snf-fab .bq:hover{background:#2d3a4f;color:#e2e8f0}
      #snf-fab .bd{background:#10b981;color:#000} #snf-fab .bd:hover{background:#059669}
      #snf-fab .bs{width:100%;margin-top:8px;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:none}
      #snf-fab .bs:hover{background:#2563eb}
      #snf-fab .st{font-size:11px;color:#10b981;text-align:center;margin-top:8px;min-height:16px}
    </style>
    <div class="fp" id="snf-panel">
      <div class="pt">◉ Chart Prep — SNF Admit Assist</div>
      <div id="snf-stats">Click Quick or Deep Scan to analyze this chart.</div>
      <div class="br">
        <button class="ab bq" id="snf-quick">⚡ Quick Scan</button>
        <button class="ab bd" id="snf-deep">◉ Deep Scan</button>
      </div>
      <button class="bs" id="snf-send">Send to SNF Admit Assist →</button>
      <div class="st" id="snf-status"></div>
    </div>
    <button class="fb" id="snf-toggle"><span style="font-size:16px">◉</span> Chart Prep</button>`;
    document.body.appendChild(d);

    let open = false;
    document.getElementById("snf-toggle").addEventListener("click", () => {
      open = !open; document.getElementById("snf-panel").classList.toggle("open", open);
    });

    document.getElementById("snf-quick").addEventListener("click", async () => {
      const b = document.getElementById("snf-quick"); b.disabled = true; b.textContent = "Scanning...";
      updateStatus("Scanning dashboard...");
      const data = await scrapeAll(false);
      renderStats(data); b.textContent = "⚡ Quick Scan"; b.disabled = false;
      document.getElementById("snf-send").style.display = "block";
      updateStatus(`${data.diagnoses.length} dx, ${Object.keys(data.clinical_scores).length} scores found`);
    });

    document.getElementById("snf-deep").addEventListener("click", async () => {
      const b = document.getElementById("snf-deep"); const bq = document.getElementById("snf-quick");
      b.disabled = true; bq.disabled = true; b.textContent = "Reading notes...";
      try {
        const data = await scrapeAll(true);
        renderStats(data);
        document.getElementById("snf-send").style.display = "block";
        updateStatus(`${data.note_contents.length} notes read, ${Object.keys(data.clinical_scores).length} scores`);
      } catch (e) { updateStatus(`Error: ${e.message}`); }
      b.textContent = "◉ Deep Scan"; b.disabled = false; bq.disabled = false;
    });

    document.getElementById("snf-send").addEventListener("click", async () => {
      const b = document.getElementById("snf-send"); b.disabled = true; b.textContent = "Sending...";
      try {
        const data = scrapedData || await scrapeAll(false);
        const r = await sendToBackend(data);
        updateStatus(`✓ ${r.hcc_count} HCCs, ${r.suspect_count} suspects (${r.raf_delta > 0 ? "+" : ""}${r.raf_delta} RAF, ~$${r.annualized_impact})`);
        b.textContent = "Sent ✓"; setTimeout(() => { b.textContent = "Send to SNF Admit Assist →"; b.disabled = false; }, 3000);
      } catch (e) { updateStatus(`✕ ${e.message}`); b.textContent = "Retry →"; b.disabled = false; }
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  injectUI();
  console.log("[PCC Scraper v2] Ready. Quick=dashboard, Deep=opens BIMS/PHQ/skin notes.");
})();
