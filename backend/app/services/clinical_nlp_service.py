"""
Clinical NLP Service — extracts structured FHIR data from unstructured clinical notes.

Uses Claude API to parse clinical notes (discharge summaries, H&P, progress notes)
and extract:
- Diagnosis codes (ICD-10) with supporting evidence quotes
- Medications with dosages
- Lab values mentioned in text
- Procedures performed
- Social history / risk factors

The extracted data is converted to FHIR R4 resources and fed back into the
pipeline for HCC analysis — surfacing diagnoses that exist in notes but
weren't coded in claims.

Architecture:
  eCW DocumentReference → clinical note text
  → Claude API (NLP extraction)
  → Structured FHIR Condition/Observation/MedicationRequest
  → FHIR ingest service → PostgreSQL (signal-tier)
  → Tuva pipeline → HCC suspects from clinical evidence

This is the autonomous clinical parsing capability:
  "Chart note says 'chronic systolic heart failure, EF 35%'"
  → Condition: I50.22 (Chronic systolic heart failure)
  → HCC 226 (CHF), RAF 0.360
  → Evidence: "Progress note 2025-09-21, provider Dr. Smith"
"""

import json
import logging
from datetime import date
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# LOINC codes for common lab values mentioned in notes
_LAB_LOINC_MAP = {
    "egfr": "33914-3",
    "gfr": "33914-3",
    "a1c": "4548-4",
    "hba1c": "4548-4",
    "hemoglobin a1c": "4548-4",
    "creatinine": "2160-0",
    "bmi": "39156-5",
    "ejection fraction": "10230-1",
    "ef": "10230-1",
    "ldl": "2089-1",
    "hdl": "2085-9",
    "total cholesterol": "2093-3",
    "triglycerides": "2571-8",
    "bnp": "42637-9",
    "potassium": "2823-3",
    "sodium": "2951-2",
    "inr": "6301-6",
}

# System prompt for clinical note extraction
_EXTRACTION_PROMPT = """\
You are a clinical coding expert. Extract structured medical information from the
following clinical note. Return ONLY valid JSON with no other text.

Extract:
1. **conditions**: Active diagnoses with the most specific ICD-10-CM code possible
2. **medications**: Current medications with dosage if mentioned
3. **lab_values**: Any lab results or vital signs mentioned with numeric values
4. **procedures**: Any procedures mentioned

For each condition, include:
- icd10_code: The most specific ICD-10-CM code (e.g., I50.22 not I50.9)
- description: Condition name
- evidence_quote: The exact text from the note that supports this diagnosis
- clinical_status: active, recurrence, remission, or resolved

For each lab value, include:
- name: Test name
- loinc_code: LOINC code if known
- value: Numeric value
- unit: Unit of measure
- date: Date if mentioned

Return JSON in this exact format:
{
  "conditions": [{"icd10_code": "...", "description": "...", "evidence_quote": "...", "clinical_status": "active"}],
  "medications": [{"name": "...", "dosage": "...", "frequency": "..."}],
  "lab_values": [{"name": "...", "loinc_code": "...", "value": 0.0, "unit": "...", "date": null}],
  "procedures": [{"code": "...", "description": "...", "date": null}]
}
"""


async def extract_from_clinical_note(
    note_text: str,
    note_date: date | None = None,
    note_type: str = "progress_note",
    provider_name: str | None = None,
) -> dict[str, Any]:
    """Extract structured clinical data from an unstructured note using Claude.

    Returns a dict with conditions, medications, lab_values, and procedures
    extracted from the note text. Each item includes evidence quotes from
    the source text for audit trail.
    """
    if not note_text or len(note_text.strip()) < 20:
        return {"conditions": [], "medications": [], "lab_values": [], "procedures": []}

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=_EXTRACTION_PROMPT,
            messages=[
                {"role": "user", "content": f"Clinical note ({note_type}, date: {note_date or 'unknown'}, provider: {provider_name or 'unknown'}):\n\n{note_text}"}
            ],
        )

        # Parse the JSON response
        response_text = response.content[0].text.strip()
        # Handle markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        extracted = json.loads(response_text)

        # Enrich lab values with LOINC codes if missing
        for lab in extracted.get("lab_values", []):
            if not lab.get("loinc_code"):
                name_lower = lab.get("name", "").lower()
                for keyword, loinc in _LAB_LOINC_MAP.items():
                    if keyword in name_lower:
                        lab["loinc_code"] = loinc
                        break

        # Add source metadata
        extracted["source"] = {
            "type": "clinical_nlp",
            "note_type": note_type,
            "note_date": note_date.isoformat() if note_date else None,
            "provider": provider_name,
            "extraction_model": "claude-sonnet-4-20250514",
        }

        logger.info(
            "Extracted from clinical note: %d conditions, %d medications, %d labs, %d procedures",
            len(extracted.get("conditions", [])),
            len(extracted.get("medications", [])),
            len(extracted.get("lab_values", [])),
            len(extracted.get("procedures", [])),
        )

        return extracted

    except json.JSONDecodeError as e:
        logger.warning("Failed to parse NLP extraction response: %s", e)
        return {"conditions": [], "medications": [], "lab_values": [], "procedures": [], "error": str(e)}
    except Exception as e:
        logger.error("Clinical NLP extraction failed: %s", e)
        return {"conditions": [], "medications": [], "lab_values": [], "procedures": [], "error": str(e)}


async def process_document_reference(
    doc_ref: dict,
    member_id: str,
) -> dict[str, Any]:
    """Process an eCW DocumentReference through NLP extraction.

    Takes a parsed DocumentReference dict (from ecw.py) and extracts
    structured clinical data from the document content.

    Returns extracted conditions, medications, labs with evidence trail
    linking back to the specific document.
    """
    content_text = doc_ref.get("content_text") or doc_ref.get("extra", {}).get("content_text")
    if not content_text:
        return {"conditions": [], "medications": [], "lab_values": [], "procedures": []}

    note_date_str = doc_ref.get("date") or doc_ref.get("extra", {}).get("date")
    note_date = None
    if note_date_str:
        try:
            from datetime import datetime
            note_date = datetime.fromisoformat(note_date_str).date()
        except (ValueError, TypeError):
            pass

    note_type = doc_ref.get("type_display") or doc_ref.get("extra", {}).get("type_display", "clinical_note")
    provider = doc_ref.get("extra", {}).get("author_name")

    result = await extract_from_clinical_note(
        note_text=content_text,
        note_date=note_date,
        note_type=note_type,
        provider_name=provider,
    )

    # Add document reference metadata
    result["document_ref"] = {
        "fhir_id": doc_ref.get("fhir_id"),
        "member_id": member_id,
        "document_type": note_type,
        "document_date": note_date.isoformat() if note_date else None,
    }

    return result
