"""
ADT (Admit-Discharge-Transfer) Ingestion and Care Alerting Service.

Handles real-time ADT event processing, patient matching, alert generation,
live census computation, and source configuration.
"""

import csv
import io
import logging
import re
from datetime import datetime, timedelta, date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HCC suspect codes that may represent capture opportunities
# ---------------------------------------------------------------------------
HCC_SUSPECT_DIAGNOSES = {
    "E11": "Diabetes",
    "I50": "Heart Failure",
    "J44": "COPD",
    "N18": "Chronic Kidney Disease",
    "I25": "Ischemic Heart Disease",
    "F33": "Major Depression",
    "E66": "Obesity",
    "G20": "Parkinson's",
    "C50": "Breast Cancer",
}

# Estimated daily cost by patient class
DAILY_COST_ESTIMATES = {
    "inpatient": 3200,
    "emergency": 1800,
    "observation": 2100,
    "snf": 850,
    "rehab": 1100,
}

# Typical LOS by patient class (days)
TYPICAL_LOS = {
    "inpatient": 5,
    "emergency": 1,
    "observation": 2,
    "snf": 21,
    "rehab": 14,
}


# ---------------------------------------------------------------------------
# Core ADT Processing
# ---------------------------------------------------------------------------

async def process_adt_event(
    db: AsyncSession, event_data: dict, source_id: int
) -> dict:
    """
    Normalize incoming event (from any source format) to canonical ADTEvent model,
    match patient to existing member, create ADTEvent record, trigger alert generation.
    """
    # Normalize event type
    raw_type = (event_data.get("event_type") or "").lower().strip()
    event_type = _normalize_event_type(raw_type)

    # Extract patient info
    patient_name = event_data.get("patient_name")
    patient_dob = event_data.get("patient_dob")
    patient_mrn = event_data.get("patient_mrn")
    external_member_id = event_data.get("external_member_id") or event_data.get("plan_member_id")

    # Attempt patient matching
    member_id, match_confidence = await _match_patient(
        db, patient_name, patient_dob, patient_mrn, external_member_id
    )

    # Parse dates
    event_timestamp = _parse_datetime(event_data.get("event_timestamp")) or datetime.utcnow()
    admit_date = _parse_datetime(event_data.get("admit_date"))
    discharge_date = _parse_datetime(event_data.get("discharge_date"))

    # Insert ADT event
    result = await db.execute(
        text("""
            INSERT INTO adt_events (
                source_id, event_type, event_timestamp, raw_message_id,
                member_id, patient_name, patient_dob, patient_mrn,
                external_member_id, match_confidence,
                patient_class, admit_date, discharge_date,
                admit_source, discharge_disposition, diagnosis_codes,
                facility_name, facility_npi, facility_type,
                attending_provider, attending_npi, pcp_name, pcp_npi,
                plan_name, plan_member_id, is_processed
            ) VALUES (
                :source_id, :event_type, :event_timestamp, :raw_message_id,
                :member_id, :patient_name, :patient_dob, :patient_mrn,
                :external_member_id, :match_confidence,
                :patient_class, :admit_date, :discharge_date,
                :admit_source, :discharge_disposition, :diagnosis_codes::jsonb,
                :facility_name, :facility_npi, :facility_type,
                :attending_provider, :attending_npi, :pcp_name, :pcp_npi,
                :plan_name, :plan_member_id, false
            ) RETURNING id
        """),
        {
            "source_id": source_id,
            "event_type": event_type,
            "event_timestamp": event_timestamp,
            "raw_message_id": event_data.get("raw_message_id"),
            "member_id": member_id,
            "patient_name": patient_name,
            "patient_dob": patient_dob,
            "patient_mrn": patient_mrn,
            "external_member_id": external_member_id,
            "match_confidence": match_confidence,
            "patient_class": event_data.get("patient_class"),
            "admit_date": admit_date,
            "discharge_date": discharge_date,
            "admit_source": event_data.get("admit_source"),
            "discharge_disposition": event_data.get("discharge_disposition"),
            "diagnosis_codes": str(event_data.get("diagnosis_codes", "[]")).replace("'", '"'),
            "facility_name": event_data.get("facility_name"),
            "facility_npi": event_data.get("facility_npi"),
            "facility_type": event_data.get("facility_type"),
            "attending_provider": event_data.get("attending_provider"),
            "attending_npi": event_data.get("attending_npi"),
            "pcp_name": event_data.get("pcp_name"),
            "pcp_npi": event_data.get("pcp_npi"),
            "plan_name": event_data.get("plan_name"),
            "plan_member_id": event_data.get("plan_member_id"),
        },
    )
    event_id = result.scalar_one()

    # Update source event count
    await db.execute(
        text("UPDATE adt_sources SET events_received = events_received + 1, last_sync = NOW() WHERE id = :sid"),
        {"sid": source_id},
    )

    await db.commit()

    # Build event dict for alert generation
    event = {
        "id": event_id,
        "source_id": source_id,
        "event_type": event_type,
        "event_timestamp": event_timestamp,
        "member_id": member_id,
        "patient_name": patient_name,
        "patient_class": event_data.get("patient_class"),
        "admit_date": admit_date,
        "discharge_date": discharge_date,
        "discharge_disposition": event_data.get("discharge_disposition"),
        "diagnosis_codes": event_data.get("diagnosis_codes", []),
        "facility_name": event_data.get("facility_name"),
        "facility_type": event_data.get("facility_type"),
        "match_confidence": match_confidence,
    }

    # Generate alerts
    alerts = await generate_alerts(db, event)

    # Mark event as processed
    alert_ids = [a["id"] for a in alerts]
    await db.execute(
        text("UPDATE adt_events SET is_processed = true, alerts_sent = :alerts::jsonb WHERE id = :eid"),
        {"eid": event_id, "alerts": str(alert_ids).replace("'", '"')},
    )
    await db.commit()

    return {**event, "alerts": alerts}


async def generate_alerts(db: AsyncSession, event: dict) -> list[dict]:
    """
    Based on event type, generate appropriate care management alerts.
    """
    alerts: list[dict] = []
    event_type = event.get("event_type", "")
    member_id = event.get("member_id")
    event_id = event["id"]

    # Check member risk tier if matched
    risk_tier = None
    if member_id:
        r = await db.execute(
            text("SELECT risk_tier FROM members WHERE id = :mid"),
            {"mid": member_id},
        )
        row = r.first()
        if row:
            risk_tier = row[0]

    # --- Admission alert ---
    if event_type == "admit":
        priority = "high"
        if risk_tier in ("high", "complex"):
            priority = "critical"

        alert = await _create_alert(
            db,
            adt_event_id=event_id,
            member_id=member_id,
            alert_type="admission",
            priority=priority,
            title=f"Member admitted to {event.get('facility_name', 'unknown facility')}",
            description=f"Patient class: {event.get('patient_class', 'unknown')}. "
                        f"Diagnoses: {', '.join(event.get('diagnosis_codes') or [])}.",
            recommended_action="Contact facility for care coordination. Review discharge planning needs.",
        )
        alerts.append(alert)

        # Check for readmission (admit within 30 days of prior discharge)
        readmission = await _check_readmission(db, member_id, event.get("admit_date"))
        if readmission:
            alert = await _create_alert(
                db,
                adt_event_id=event_id,
                member_id=member_id,
                alert_type="readmission_risk",
                priority="critical",
                title=f"Readmission within {readmission['days']} days of prior discharge",
                description=f"Prior discharge from {readmission['prior_facility']} on "
                            f"{readmission['prior_discharge']}. Current admission to "
                            f"{event.get('facility_name', 'unknown')}.",
                recommended_action="Immediate care manager outreach. Review root cause of readmission. "
                                   "Assess medication adherence and follow-up compliance.",
            )
            alerts.append(alert)

    # --- ER Visit alert ---
    elif event_type == "ed_visit":
        priority = "high"
        if risk_tier in ("high", "complex"):
            priority = "critical"

        alert = await _create_alert(
            db,
            adt_event_id=event_id,
            member_id=member_id,
            alert_type="er_visit",
            priority=priority,
            title=f"ER visit at {event.get('facility_name', 'unknown facility')}",
            description=f"Diagnoses: {', '.join(event.get('diagnosis_codes') or [])}.",
            recommended_action="Evaluate if visit was avoidable. Consider PCP follow-up within 72 hours.",
        )
        alerts.append(alert)

    # --- Discharge alerts ---
    elif event_type == "discharge":
        disposition = (event.get("discharge_disposition") or "").lower()

        if disposition == "snf":
            alert = await _create_alert(
                db,
                adt_event_id=event_id,
                member_id=member_id,
                alert_type="snf_placement",
                priority="high",
                title=f"Member discharged to SNF from {event.get('facility_name', 'unknown')}",
                description=f"Disposition: SNF. Diagnoses: {', '.join(event.get('diagnosis_codes') or [])}.",
                recommended_action="Trigger SNF Admit Assist workflow. Verify SNF is in-network. "
                                   "Coordinate with SNF care team for transition plan.",
            )
            alerts.append(alert)
        else:
            alert = await _create_alert(
                db,
                adt_event_id=event_id,
                member_id=member_id,
                alert_type="discharge_planning",
                priority="medium",
                title=f"Member discharged from {event.get('facility_name', 'unknown')}",
                description=f"Disposition: {disposition or 'home'}. "
                            f"Diagnoses: {', '.join(event.get('diagnosis_codes') or [])}.",
                recommended_action="Schedule 7-day post-discharge follow-up. "
                                   "Verify medication reconciliation. Check for home health needs.",
            )
            alerts.append(alert)

    # --- HCC capture opportunity check ---
    diagnoses = event.get("diagnosis_codes") or []
    hcc_opportunities = []
    for code in diagnoses:
        for prefix, label in HCC_SUSPECT_DIAGNOSES.items():
            if str(code).startswith(prefix):
                hcc_opportunities.append(f"{code} ({label})")

    if hcc_opportunities and member_id:
        alert = await _create_alert(
            db,
            adt_event_id=event_id,
            member_id=member_id,
            alert_type="hcc_opportunity",
            priority="low",
            title=f"HCC capture opportunity: {len(hcc_opportunities)} suspect codes",
            description=f"Diagnosis codes with HCC potential: {', '.join(hcc_opportunities)}.",
            recommended_action="Review encounter documentation for HCC coding specificity. "
                               "Ensure conditions are captured at the appropriate severity level.",
        )
        alerts.append(alert)

    return alerts


# ---------------------------------------------------------------------------
# Live Census
# ---------------------------------------------------------------------------

async def get_live_census(db: AsyncSession) -> dict:
    """
    Current census: members currently admitted (no discharge event yet).
    Grouped by facility, patient class. Includes LOS, estimated daily cost.
    """
    result = await db.execute(
        text("""
            SELECT
                e.id, e.member_id, e.patient_name, e.patient_class,
                e.admit_date, e.facility_name, e.facility_type,
                e.attending_provider, e.diagnosis_codes,
                e.event_timestamp,
                EXTRACT(DAY FROM NOW() - e.admit_date) AS los_days
            FROM adt_events e
            WHERE e.event_type IN ('admit', 'observation')
              AND e.discharge_date IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM adt_events d
                  WHERE d.event_type = 'discharge'
                    AND d.member_id = e.member_id
                    AND d.admit_date = e.admit_date
              )
            ORDER BY e.admit_date ASC
        """)
    )
    rows = result.mappings().all()

    census_items = []
    for r in rows:
        los = int(r.get("los_days") or 0)
        patient_class = r.get("patient_class") or "inpatient"
        typical_los = TYPICAL_LOS.get(patient_class, 5)
        daily_cost = DAILY_COST_ESTIMATES.get(patient_class, 2000)

        census_items.append({
            "event_id": r["id"],
            "member_id": r["member_id"],
            "patient_name": r["patient_name"],
            "patient_class": patient_class,
            "admit_date": str(r["admit_date"]) if r["admit_date"] else None,
            "los_days": los,
            "facility_name": r["facility_name"],
            "facility_type": r["facility_type"],
            "attending_provider": r["attending_provider"],
            "diagnosis_codes": r["diagnosis_codes"] or [],
            "estimated_daily_cost": daily_cost,
            "total_accrued_cost": daily_cost * max(los, 1),
            "typical_los": typical_los,
            "projected_discharge": str(
                (r["admit_date"] + timedelta(days=typical_los)) if r["admit_date"] else None
            ),
            "los_status": (
                "normal" if los <= typical_los
                else "extended" if los <= typical_los * 2
                else "critical"
            ),
        })

    return {
        "total_census": len(census_items),
        "items": census_items,
    }


async def get_census_summary(db: AsyncSession) -> dict:
    """
    Aggregate stats: total currently admitted, in ED, in SNF.
    By facility breakdown. Today's admits/discharges. 7-day trend.
    """
    # Current census counts by patient class
    census_result = await db.execute(
        text("""
            SELECT
                COALESCE(patient_class, 'unknown') AS patient_class,
                COUNT(*) AS cnt
            FROM adt_events
            WHERE event_type IN ('admit', 'observation', 'ed_visit')
              AND discharge_date IS NULL
            GROUP BY patient_class
        """)
    )
    by_class = {r["patient_class"]: r["cnt"] for r in census_result.mappings().all()}

    # By facility
    facility_result = await db.execute(
        text("""
            SELECT facility_name, COUNT(*) AS cnt
            FROM adt_events
            WHERE event_type IN ('admit', 'observation', 'ed_visit')
              AND discharge_date IS NULL
            GROUP BY facility_name
            ORDER BY cnt DESC
        """)
    )
    by_facility = [
        {"facility": r["facility_name"], "count": r["cnt"]}
        for r in facility_result.mappings().all()
    ]

    # Today's admits
    today_admits_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM adt_events
            WHERE event_type IN ('admit', 'ed_visit')
              AND DATE(event_timestamp) = CURRENT_DATE
        """)
    )
    today_admits = today_admits_result.scalar_one()

    # Today's discharges
    today_discharges_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM adt_events
            WHERE event_type = 'discharge'
              AND DATE(event_timestamp) = CURRENT_DATE
        """)
    )
    today_discharges = today_discharges_result.scalar_one()

    # 7-day trend
    trend_result = await db.execute(
        text("""
            SELECT
                DATE(event_timestamp) AS day,
                SUM(CASE WHEN event_type IN ('admit', 'ed_visit') THEN 1 ELSE 0 END) AS admits,
                SUM(CASE WHEN event_type = 'discharge' THEN 1 ELSE 0 END) AS discharges
            FROM adt_events
            WHERE event_timestamp >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(event_timestamp)
            ORDER BY day
        """)
    )
    trend = [
        {"date": str(r["day"]), "admits": r["admits"], "discharges": r["discharges"]}
        for r in trend_result.mappings().all()
    ]

    return {
        "currently_admitted": by_class.get("inpatient", 0),
        "in_ed": by_class.get("emergency", 0),
        "in_observation": by_class.get("observation", 0),
        "in_snf": by_class.get("snf", 0),
        "total_census": sum(by_class.values()),
        "today_admits": today_admits,
        "today_discharges": today_discharges,
        "by_facility": by_facility,
        "trend_7d": trend,
    }


# ---------------------------------------------------------------------------
# Care Alerts
# ---------------------------------------------------------------------------

async def get_alerts(
    db: AsyncSession,
    status: str | None = "open",
    assigned_to: int | None = None,
    priority: str | None = None,
    alert_type: str | None = None,
) -> list[dict]:
    """List care alerts, filterable by status, assignee, priority, type."""
    conditions = []
    params: dict[str, Any] = {}

    if status:
        conditions.append("ca.status = :status")
        params["status"] = status
    if assigned_to:
        conditions.append("ca.assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to
    if priority:
        conditions.append("ca.priority = :priority")
        params["priority"] = priority
    if alert_type:
        conditions.append("ca.alert_type = :alert_type")
        params["alert_type"] = alert_type

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    result = await db.execute(
        text(f"""
            SELECT ca.*, e.patient_name, e.facility_name, e.event_type, e.event_timestamp
            FROM care_alerts ca
            LEFT JOIN adt_events e ON ca.adt_event_id = e.id
            {where}
            ORDER BY
                CASE ca.priority
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                END,
                ca.created_at DESC
        """),
        params,
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


async def acknowledge_alert(
    db: AsyncSession, alert_id: int, user_id: int
) -> dict:
    """Mark an alert as acknowledged."""
    await db.execute(
        text("""
            UPDATE care_alerts
            SET status = 'acknowledged', assigned_to = :uid, updated_at = NOW()
            WHERE id = :aid
        """),
        {"aid": alert_id, "uid": user_id},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT * FROM care_alerts WHERE id = :aid"), {"aid": alert_id}
    )
    return dict(result.mappings().first())


async def resolve_alert(
    db: AsyncSession, alert_id: int, user_id: int, notes: str | None = None
) -> dict:
    """Mark an alert as resolved with optional notes."""
    await db.execute(
        text("""
            UPDATE care_alerts
            SET status = 'resolved', resolved_at = NOW(), resolution_notes = :notes,
                assigned_to = :uid, updated_at = NOW()
            WHERE id = :aid
        """),
        {"aid": alert_id, "uid": user_id, "notes": notes},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT * FROM care_alerts WHERE id = :aid"), {"aid": alert_id}
    )
    return dict(result.mappings().first())


async def assign_alert(
    db: AsyncSession, alert_id: int, assigned_to: int
) -> dict:
    """Assign an alert to a care manager."""
    await db.execute(
        text("""
            UPDATE care_alerts
            SET assigned_to = :assigned_to, status = 'in_progress', updated_at = NOW()
            WHERE id = :aid
        """),
        {"aid": alert_id, "assigned_to": assigned_to},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT * FROM care_alerts WHERE id = :aid"), {"aid": alert_id}
    )
    return dict(result.mappings().first())


# ---------------------------------------------------------------------------
# ADT Source Configuration
# ---------------------------------------------------------------------------

async def configure_source(db: AsyncSession, source_data: dict) -> dict:
    """Create or update an ADT source configuration."""
    source_id = source_data.get("id")

    if source_id:
        await db.execute(
            text("""
                UPDATE adt_sources
                SET name = :name, source_type = :source_type, config = :config::jsonb,
                    is_active = :is_active, updated_at = NOW()
                WHERE id = :id
            """),
            {
                "id": source_id,
                "name": source_data["name"],
                "source_type": source_data["source_type"],
                "config": str(source_data.get("config", {})).replace("'", '"'),
                "is_active": source_data.get("is_active", True),
            },
        )
    else:
        result = await db.execute(
            text("""
                INSERT INTO adt_sources (name, source_type, config, is_active, events_received)
                VALUES (:name, :source_type, :config::jsonb, :is_active, 0)
                RETURNING id
            """),
            {
                "name": source_data["name"],
                "source_type": source_data["source_type"],
                "config": str(source_data.get("config", {})).replace("'", '"'),
                "is_active": source_data.get("is_active", True),
            },
        )
        source_id = result.scalar_one()

    await db.commit()

    result = await db.execute(
        text("SELECT * FROM adt_sources WHERE id = :sid"), {"sid": source_id}
    )
    return dict(result.mappings().first())


async def get_sources(db: AsyncSession) -> list[dict]:
    """List all configured ADT sources."""
    result = await db.execute(
        text("SELECT * FROM adt_sources ORDER BY name")
    )
    return [dict(r) for r in result.mappings().all()]


async def get_events(
    db: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """List recent ADT events for review."""
    result = await db.execute(
        text("""
            SELECT e.*, s.name AS source_name
            FROM adt_events e
            LEFT JOIN adt_sources s ON e.source_id = s.id
            ORDER BY e.event_timestamp DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    )
    return [dict(r) for r in result.mappings().all()]


# ---------------------------------------------------------------------------
# HL7 Message Processing
# ---------------------------------------------------------------------------

async def process_hl7_message(raw_message: str) -> dict:
    """
    Parse HL7v2 ADT message (A01, A02, A03, A04).
    Extract: event type, patient demographics, visit info, facility, diagnosis, insurance.
    """
    segments = raw_message.strip().split("\r")
    if not segments:
        segments = raw_message.strip().split("\n")

    parsed: dict[str, Any] = {}

    for segment in segments:
        fields = segment.split("|")
        seg_type = fields[0] if fields else ""

        if seg_type == "MSH":
            parsed["raw_message_id"] = fields[9] if len(fields) > 9 else None

        elif seg_type == "EVN":
            event_code = fields[1] if len(fields) > 1 else ""
            parsed["event_type"] = _hl7_event_to_type(event_code)
            parsed["event_timestamp"] = _parse_hl7_datetime(fields[2]) if len(fields) > 2 else None

        elif seg_type == "PID":
            # PID-3: Patient ID
            if len(fields) > 3:
                parsed["patient_mrn"] = fields[3].split("^")[0] if fields[3] else None
            # PID-5: Patient Name
            if len(fields) > 5:
                name_parts = fields[5].split("^")
                last = name_parts[0] if len(name_parts) > 0 else ""
                first = name_parts[1] if len(name_parts) > 1 else ""
                parsed["patient_name"] = f"{first} {last}".strip()
            # PID-7: DOB
            if len(fields) > 7 and fields[7]:
                try:
                    parsed["patient_dob"] = datetime.strptime(fields[7][:8], "%Y%m%d").date().isoformat()
                except (ValueError, IndexError):
                    pass

        elif seg_type == "PV1":
            # PV1-2: Patient Class
            if len(fields) > 2:
                parsed["patient_class"] = _normalize_patient_class(fields[2])
            # PV1-7: Attending Doctor
            if len(fields) > 7:
                doc_parts = fields[7].split("^")
                npi = doc_parts[0] if len(doc_parts) > 0 else None
                last = doc_parts[1] if len(doc_parts) > 1 else ""
                first = doc_parts[2] if len(doc_parts) > 2 else ""
                parsed["attending_provider"] = f"{first} {last}".strip()
                parsed["attending_npi"] = npi
            # PV1-3: Assigned Location (Facility)
            if len(fields) > 3:
                parsed["facility_name"] = fields[3].split("^")[0] if fields[3] else None
            # PV1-14: Admit Source
            if len(fields) > 14:
                parsed["admit_source"] = fields[14] if fields[14] else None
            # PV1-36: Discharge Disposition
            if len(fields) > 36:
                parsed["discharge_disposition"] = fields[36] if fields[36] else None
            # PV1-44: Admit Date
            if len(fields) > 44:
                parsed["admit_date"] = _parse_hl7_datetime(fields[44])
            # PV1-45: Discharge Date
            if len(fields) > 45:
                parsed["discharge_date"] = _parse_hl7_datetime(fields[45])

        elif seg_type == "DG1":
            # DG1-3: Diagnosis Code
            if len(fields) > 3:
                code = fields[3].split("^")[0] if fields[3] else None
                if code:
                    parsed.setdefault("diagnosis_codes", []).append(code)

        elif seg_type == "IN1":
            # IN1-4: Plan Name
            if len(fields) > 4:
                parsed["plan_name"] = fields[4].split("^")[0] if fields[4] else None
            # IN1-36: Plan Member ID
            if len(fields) > 36:
                parsed["plan_member_id"] = fields[36] if fields[36] else None
                parsed["external_member_id"] = parsed["plan_member_id"]

    return parsed


# ---------------------------------------------------------------------------
# CSV Batch Processing
# ---------------------------------------------------------------------------

async def process_csv_batch(
    db: AsyncSession, file_content: str, source_id: int
) -> dict:
    """
    Parse CSV/flat file ADT batch (from SFTP).
    Process each row as an event.
    """
    reader = csv.DictReader(io.StringIO(file_content))
    processed = 0
    matched = 0
    unmatched = 0
    alerts_generated = 0

    for row in reader:
        try:
            result = await process_adt_event(db, dict(row), source_id)
            processed += 1
            if result.get("member_id"):
                matched += 1
            else:
                unmatched += 1
            alerts_generated += len(result.get("alerts", []))
        except Exception as e:
            logger.error(f"Error processing CSV row: {e}")

    return {
        "processed": processed,
        "matched": matched,
        "unmatched": unmatched,
        "alerts_generated": alerts_generated,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _match_patient(
    db: AsyncSession,
    patient_name: str | None,
    patient_dob: str | date | None,
    patient_mrn: str | None,
    external_member_id: str | None,
) -> tuple[int | None, int | None]:
    """Attempt to match ADT patient to existing member. Returns (member_id, confidence)."""

    # Try exact match on external member ID first
    if external_member_id:
        result = await db.execute(
            text("SELECT id FROM members WHERE member_id = :eid LIMIT 1"),
            {"eid": external_member_id},
        )
        row = result.first()
        if row:
            return row[0], 100

    # Try name + DOB match
    if patient_name and patient_dob:
        name_parts = patient_name.strip().split()
        if len(name_parts) >= 2:
            first = name_parts[0]
            last = name_parts[-1]
            dob_val = patient_dob if isinstance(patient_dob, date) else patient_dob
            result = await db.execute(
                text("""
                    SELECT id FROM members
                    WHERE LOWER(first_name) = LOWER(:first)
                      AND LOWER(last_name) = LOWER(:last)
                      AND date_of_birth = :dob
                    LIMIT 1
                """),
                {"first": first, "last": last, "dob": dob_val},
            )
            row = result.first()
            if row:
                return row[0], 90

    # Fuzzy name match (partial)
    if patient_name:
        name_parts = patient_name.strip().split()
        if len(name_parts) >= 2:
            last = name_parts[-1]
            result = await db.execute(
                text("""
                    SELECT id FROM members
                    WHERE LOWER(last_name) = LOWER(:last)
                    LIMIT 1
                """),
                {"last": last},
            )
            row = result.first()
            if row:
                return row[0], 60

    return None, None


async def _check_readmission(
    db: AsyncSession, member_id: int | None, admit_date: datetime | None
) -> dict | None:
    """Check if this admission is a readmission (within 30 days of prior discharge)."""
    if not member_id or not admit_date:
        return None

    result = await db.execute(
        text("""
            SELECT discharge_date, facility_name
            FROM adt_events
            WHERE member_id = :mid
              AND event_type = 'discharge'
              AND discharge_date >= :cutoff
              AND discharge_date < :admit
            ORDER BY discharge_date DESC
            LIMIT 1
        """),
        {
            "mid": member_id,
            "cutoff": admit_date - timedelta(days=30),
            "admit": admit_date,
        },
    )
    row = result.mappings().first()
    if row:
        days = (admit_date - row["discharge_date"]).days if row["discharge_date"] else 0
        return {
            "days": days,
            "prior_facility": row["facility_name"],
            "prior_discharge": str(row["discharge_date"]),
        }
    return None


async def _create_alert(
    db: AsyncSession,
    adt_event_id: int,
    member_id: int | None,
    alert_type: str,
    priority: str,
    title: str,
    description: str | None = None,
    recommended_action: str | None = None,
) -> dict:
    """Insert a care alert and return it."""
    result = await db.execute(
        text("""
            INSERT INTO care_alerts (
                adt_event_id, member_id, alert_type, priority,
                title, description, recommended_action, status
            ) VALUES (
                :adt_event_id, :member_id, :alert_type, :priority,
                :title, :description, :recommended_action, 'open'
            ) RETURNING id
        """),
        {
            "adt_event_id": adt_event_id,
            "member_id": member_id,
            "alert_type": alert_type,
            "priority": priority,
            "title": title,
            "description": description,
            "recommended_action": recommended_action,
        },
    )
    alert_id = result.scalar_one()
    await db.commit()

    return {
        "id": alert_id,
        "adt_event_id": adt_event_id,
        "member_id": member_id,
        "alert_type": alert_type,
        "priority": priority,
        "title": title,
        "description": description,
        "recommended_action": recommended_action,
        "status": "open",
    }


def _normalize_event_type(raw: str) -> str:
    """Normalize event type string to canonical form."""
    mapping = {
        "a01": "admit", "admit": "admit", "admission": "admit",
        "a02": "transfer", "transfer": "transfer",
        "a03": "discharge", "discharge": "discharge",
        "a04": "ed_visit", "ed_visit": "ed_visit", "er_visit": "ed_visit",
        "emergency": "ed_visit", "ed": "ed_visit",
        "observation": "observation", "obs": "observation",
    }
    return mapping.get(raw.lower(), raw.lower())


def _normalize_patient_class(raw: str) -> str:
    """Normalize patient class."""
    mapping = {
        "I": "inpatient", "inpatient": "inpatient",
        "E": "emergency", "emergency": "emergency",
        "O": "observation", "observation": "observation",
        "R": "rehab", "rehab": "rehab",
    }
    return mapping.get(raw, raw.lower())


def _hl7_event_to_type(code: str) -> str:
    """Map HL7 event code to canonical event type."""
    return _normalize_event_type(code)


def _parse_hl7_datetime(val: str | None) -> datetime | None:
    """Parse HL7 datetime format (YYYYMMDDHHmmss)."""
    if not val:
        return None
    try:
        if len(val) >= 14:
            return datetime.strptime(val[:14], "%Y%m%d%H%M%S")
        elif len(val) >= 8:
            return datetime.strptime(val[:8], "%Y%m%d")
    except ValueError:
        pass
    return None


def _parse_datetime(val: Any) -> datetime | None:
    """Try to parse a datetime from various formats."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
    return None
