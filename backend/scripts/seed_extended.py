"""
Extended seed script for AQSoft Health Platform.

Seeds ALL remaining module data into the demo_mso schema so that
every page in the UI has realistic content to display.

Run from the backend directory:  python -m scripts.seed_extended

Uses synchronous psycopg2 (same pattern as the original seed.py).
"""

import json
import os
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)

SCHEMA = "demo_mso"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _today() -> date:
    return date(2026, 3, 25)


def _months_ago(n: int) -> date:
    """Return the 1st of the month N months ago from today."""
    t = _today()
    month = t.month - n
    year = t.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _random_recent_datetime(days_back: int = 90) -> datetime:
    t = _today()
    offset = random.randint(0, days_back)
    d = t - timedelta(days=offset)
    return datetime(d.year, d.month, d.day,
                    random.randint(6, 22), random.randint(0, 59), 0)


def _random_recent_date(days_back: int = 180) -> date:
    return _today() - timedelta(days=random.randint(0, days_back))


# ---------------------------------------------------------------------------
# Check helpers (idempotent)
# ---------------------------------------------------------------------------


def _count(cur, table: str) -> int:
    cur.execute(f"SELECT count(*) FROM {table}")
    return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# 1. Insights
# ---------------------------------------------------------------------------

INSIGHTS = [
    {
        "category": "revenue",
        "title": "42 recapture suspects expiring within 60 days",
        "description": "There are 42 HCC recapture suspects across ISG Tampa and FMG St. Pete whose annual visit window closes in the next 60 days. If captured, estimated revenue impact is $187,000 in annualized RAF value.",
        "dollar_impact": 187000.00,
        "recommended_action": "Prioritize scheduling annual wellness visits for these members. Focus on the 12 complex-tier members first ($94K of the total impact).",
        "confidence": 91,
        "status": "active",
        "source_modules": ["hcc_suspects", "members"],
    },
    {
        "category": "revenue",
        "title": "Provider Dr. Chen has 18% lower capture rate than peers",
        "description": "Dr. James Chen's HCC capture rate is 52% vs. the group average of 70%. His panel of 45 members has an estimated $63K in uncaptured RAF value this payment year.",
        "dollar_impact": 63000.00,
        "recommended_action": "Schedule a provider education session with Dr. Chen focusing on suspect documentation workflows. Consider pairing with a coder for the next 2 weeks.",
        "confidence": 87,
        "status": "active",
        "source_modules": ["providers", "hcc_suspects"],
    },
    {
        "category": "cost",
        "title": "ER utilization spike in 33602 zip code",
        "description": "Members in zip 33602 had a 34% increase in ED visits over the last 30 days compared to the prior quarter. 8 of 12 visits were for ambulatory-sensitive conditions that could have been managed in primary care.",
        "dollar_impact": 48000.00,
        "recommended_action": "Deploy care coordinator outreach to the 8 members with avoidable ED visits. Evaluate whether after-hours access is adequate for ISG Tampa panel.",
        "confidence": 84,
        "status": "active",
        "source_modules": ["claims", "adt_events"],
    },
    {
        "category": "cost",
        "title": "3 members account for 28% of total spend",
        "description": "Members #5, #12, and #22 have combined claims of $312K in the last 6 months, representing 28% of total plan spend. Two have unmanaged CHF and one has recurrent SNF admissions.",
        "dollar_impact": 312000.00,
        "recommended_action": "Enroll all three in intensive care management. Member #22 should be evaluated for home health to reduce SNF readmissions.",
        "confidence": 95,
        "status": "bookmarked",
        "source_modules": ["claims", "members"],
    },
    {
        "category": "quality",
        "title": "Breast Cancer Screening gap closure behind target",
        "description": "BCS measure is at 62% closure vs. 75% target with 3 months remaining in the measurement year. 18 eligible members have not yet completed screening.",
        "dollar_impact": 22000.00,
        "recommended_action": "Send targeted outreach to the 18 members. Partner with Tampa Imaging Center for a bulk scheduling campaign.",
        "confidence": 88,
        "status": "active",
        "source_modules": ["care_gaps", "members"],
    },
    {
        "category": "quality",
        "title": "Medication Reconciliation post-discharge at 41%",
        "description": "MRP measure is significantly below the 60% target. Of 22 eligible discharges in the last 90 days, only 9 had documented medication reconciliation within 30 days.",
        "dollar_impact": 15000.00,
        "recommended_action": "Implement automated ADT-triggered workflow to schedule pharmacist reconciliation within 48 hours of discharge notification.",
        "confidence": 92,
        "status": "active",
        "source_modules": ["care_gaps", "adt_events"],
    },
    {
        "category": "provider",
        "title": "FMG Clearwater coding specificity opportunities",
        "description": "FMG Clearwater providers are using unspecified diabetes codes (E11.9) in 67% of encounters vs. best practice of <30%. This is leaving an estimated $41K in RAF value on the table.",
        "dollar_impact": 41000.00,
        "recommended_action": "Conduct coding education session focused on diabetes specificity. Provide quick-reference cards for common E11.xx specificity codes.",
        "confidence": 89,
        "status": "active",
        "source_modules": ["claims", "providers", "hcc_suspects"],
    },
    {
        "category": "provider",
        "title": "Dr. Rodriguez outperforming on Stars measures",
        "description": "Dr. Maria Rodriguez has achieved 92% gap closure rate across all weighted Stars measures, the highest in the network. Her documentation and follow-up workflows could serve as a model.",
        "dollar_impact": 0.00,
        "recommended_action": "Document Dr. Rodriguez's workflow and share as best practice across all groups. Consider a provider spotlight in next quarterly meeting.",
        "confidence": 96,
        "status": "active",
        "source_modules": ["care_gaps", "providers"],
    },
    {
        "category": "cross_module",
        "title": "ADT-Claims correlation: 5 admits without matching claims",
        "description": "Five inpatient ADT admit events from the last 45 days have no corresponding institutional claims. These may represent claims lag, denied claims, or out-of-network admissions requiring investigation.",
        "dollar_impact": 85000.00,
        "recommended_action": "Investigate the 5 unmatched admissions. Contact facilities for claim status. If out-of-network, initiate single case agreements.",
        "confidence": 78,
        "status": "active",
        "source_modules": ["adt_events", "claims"],
    },
    {
        "category": "cross_module",
        "title": "Rising-risk cohort trending toward complex tier",
        "description": "7 members currently in the rising-risk tier show RAF trajectory increases averaging +0.4 over 3 months. Without intervention, projected reclassification to complex tier within 60 days.",
        "dollar_impact": 156000.00,
        "recommended_action": "Activate proactive care management for these 7 members. Schedule PCP visits and address open HCC suspects to ensure accurate risk capture before tier transition.",
        "confidence": 82,
        "status": "active",
        "source_modules": ["members", "hcc_suspects", "claims"],
    },
]


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------


def seed() -> None:
    random.seed(99)  # reproducible but different from original seed

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute(f"SET search_path TO {SCHEMA}, public")

        # 1. Insights
        _seed_insights(cur)

        # 2. Learning metrics
        _seed_learning_metrics(cur)

        # 3. Prediction outcomes
        _seed_prediction_outcomes(cur)

        # 4. User interactions
        _seed_user_interactions(cur)

        # 5. ADT sources
        _seed_adt_sources(cur)

        # 6. ADT events
        _seed_adt_events(cur)

        # 7. Care alerts
        _seed_care_alerts(cur)

        # 8. Annotations
        _seed_annotations(cur)

        # 9. Watchlist items
        _seed_watchlist_items(cur)

        # 10. Action items
        _seed_action_items(cur)

        # 11. Report templates
        _seed_report_templates(cur)

        # 12. Generated reports
        _seed_generated_reports(cur)

        # 13. Saved filters
        _seed_saved_filters(cur)

        # 14. RAF history
        _seed_raf_history(cur)

        conn.commit()
        print()
        print("=" * 60)
        print("  Extended seed complete!")
        print("=" * 60)

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------


def _seed_insights(cur) -> None:
    count = _count(cur, "insights")
    if count > 0:
        print(f"  Insights already seeded ({count})")
        return

    for ins in INSIGHTS:
        cur.execute(
            """INSERT INTO insights
               (category, title, description, dollar_impact, recommended_action,
                confidence, status, source_modules, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                ins["category"],
                ins["title"],
                ins["description"],
                ins["dollar_impact"],
                ins["recommended_action"],
                ins["confidence"],
                ins["status"],
                json.dumps(ins["source_modules"]),
                _random_recent_datetime(30),
            ),
        )
    print(f"  Created {len(INSIGHTS)} insights")


def _seed_learning_metrics(cur) -> None:
    count = _count(cur, "learning_metrics")
    if count > 0:
        print(f"  Learning metrics already seeded ({count})")
        return

    prediction_types = ["hcc_suspect", "cost_estimate", "gap_closure"]
    # 6 months of improving accuracy
    base_accuracies = {
        "hcc_suspect": 84.5,
        "cost_estimate": 72.0,
        "gap_closure": 78.0,
    }
    rows = 0
    for i in range(6):
        metric_date = _months_ago(6 - i)
        for ptype in prediction_types:
            base = base_accuracies[ptype]
            # Gradual improvement each month
            accuracy = round(base + i * random.uniform(0.8, 1.5), 2)
            total = random.randint(80, 150)
            confirmed = int(total * accuracy / 100)
            rejected = total - confirmed - random.randint(2, 8)
            if rejected < 0:
                rejected = 0
            pending = total - confirmed - rejected

            cur.execute(
                """INSERT INTO learning_metrics
                   (metric_date, prediction_type, total_predictions, confirmed,
                    rejected, pending, accuracy_rate, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    metric_date,
                    ptype,
                    total,
                    confirmed,
                    rejected,
                    pending,
                    accuracy,
                    datetime(metric_date.year, metric_date.month, 1, 8, 0, 0),
                ),
            )
            rows += 1
    print(f"  Created {rows} learning metrics rows")


def _seed_prediction_outcomes(cur) -> None:
    count = _count(cur, "prediction_outcomes")
    if count > 0:
        print(f"  Prediction outcomes already seeded ({count})")
        return

    prediction_types = [
        "hcc_suspect", "hcc_suspect", "hcc_suspect",
        "cost_recommendation", "cost_recommendation",
        "gap_closure", "gap_closure",
        "readmission_risk", "readmission_risk",
        "raf_trajectory",
    ]
    outcomes = ["confirmed", "confirmed", "confirmed", "rejected", "partial"]
    lessons = [
        "Historical dx pattern is strong predictor for recapture",
        "Pharmacy data alone insufficient for HCC confirmation",
        "Cost estimates within 15% for professional claims",
        "Institutional cost estimates need facility-type adjustment",
        "Gap closure predictions improve with outreach history data",
        "Readmission model underweights social determinants",
        "RAF trajectory accurate when 3+ months of claims available",
        None,
        None,
        None,
    ]

    rows = 0
    for i in range(50):
        ptype = random.choice(prediction_types)
        outcome = random.choice(outcomes)
        was_correct = outcome == "confirmed"
        confidence = random.randint(55, 98)

        if ptype == "hcc_suspect":
            predicted_value = f"HCC {random.choice([19, 85, 108, 111, 18, 22, 96, 59])}"
            actual_value = predicted_value if was_correct else "Not confirmed"
        elif ptype == "cost_recommendation":
            val = random.randint(2000, 25000)
            predicted_value = f"${val}"
            actual_value = f"${int(val * random.uniform(0.7, 1.3))}" if outcome != "rejected" else "N/A"
        elif ptype == "gap_closure":
            predicted_value = random.choice(["Will close", "At risk"])
            actual_value = "Closed" if was_correct else "Still open"
        elif ptype == "readmission_risk":
            predicted_value = random.choice(["High risk", "Medium risk", "Low risk"])
            actual_value = "Readmitted" if was_correct else "No readmission"
        else:
            predicted_value = f"RAF +{round(random.uniform(0.1, 0.8), 2)}"
            actual_value = f"RAF +{round(random.uniform(0.05, 0.9), 2)}"

        cur.execute(
            """INSERT INTO prediction_outcomes
               (prediction_type, prediction_id, predicted_value, confidence,
                outcome, actual_value, was_correct, lesson_learned, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                ptype,
                random.randint(1, 200),
                predicted_value,
                confidence,
                outcome,
                actual_value,
                was_correct,
                random.choice(lessons),
                _random_recent_datetime(120),
            ),
        )
        rows += 1
    print(f"  Created {rows} prediction outcomes")


def _seed_user_interactions(cur) -> None:
    count = _count(cur, "user_interactions")
    if count > 0:
        print(f"  User interactions already seeded ({count})")
        return

    interaction_types = ["view", "view", "view", "bookmark", "dismiss", "capture", "drill_down", "export"]
    target_types = ["insight", "insight", "member", "member", "provider", "hcc_suspect", "care_gap", "report"]
    page_contexts = [
        "dashboard", "dashboard", "members_list", "member_detail",
        "providers_list", "provider_detail", "hcc_suspects", "care_gaps",
        "insights", "reports", "adt_events",
    ]

    rows = 0
    for i in range(30):
        cur.execute(
            """INSERT INTO user_interactions
               (user_id, interaction_type, target_type, target_id,
                page_context, created_at)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                random.choice([1, 2]),  # admin or demo user
                random.choice(interaction_types),
                random.choice(target_types),
                random.randint(1, 30),
                random.choice(page_contexts),
                _random_recent_datetime(60),
            ),
        )
        rows += 1
    print(f"  Created {rows} user interactions")


def _seed_adt_sources(cur) -> None:
    count = _count(cur, "adt_sources")
    if count > 0:
        print(f"  ADT sources already seeded ({count})")
        return

    sources = [
        {
            "name": "Bamboo Health ADT Feed",
            "source_type": "webhook",
            "config": {
                "endpoint": "https://api.bamboohealth.com/v2/adt",
                "auth_type": "api_key",
                "format": "HL7v2",
                "event_types": ["A01", "A02", "A03", "A04", "A08"],
                "facility_filter": ["Tampa General", "St. Joseph's Hospital", "AdventHealth Tampa"],
            },
            "is_active": True,
            "events_received": 847,
        },
        {
            "name": "Humana Claims ADT Extract",
            "source_type": "sftp",
            "config": {
                "host": "sftp.humana.com",
                "path": "/outbound/adt/",
                "schedule": "every_6_hours",
                "format": "CSV",
                "delimiter": "|",
            },
            "is_active": True,
            "events_received": 1253,
        },
    ]

    for s in sources:
        cur.execute(
            """INSERT INTO adt_sources
               (name, source_type, config, is_active, last_sync, events_received, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                s["name"],
                s["source_type"],
                json.dumps(s["config"]),
                s["is_active"],
                _random_recent_datetime(1),
                s["events_received"],
                datetime(2025, 9, 15, 10, 0, 0),
            ),
        )
    print(f"  Created {len(sources)} ADT sources")


def _seed_adt_events(cur) -> None:
    count = _count(cur, "adt_events")
    if count > 0:
        print(f"  ADT events already seeded ({count})")
        return

    # Get source IDs
    cur.execute("SELECT id FROM adt_sources ORDER BY id")
    source_ids = [r[0] for r in cur.fetchall()]
    if not source_ids:
        print("  WARNING: No ADT sources found, skipping ADT events")
        return

    facilities = [
        ("Tampa General Hospital", "1234500001", "acute_care"),
        ("St. Joseph's Hospital", "1234500002", "acute_care"),
        ("AdventHealth Tampa", "1234500003", "acute_care"),
        ("BayCare Urgent Care", "1234500004", "urgent_care"),
    ]
    event_types = [
        "admit", "admit", "admit", "admit",
        "discharge", "discharge", "discharge", "discharge",
        "er_visit", "er_visit", "er_visit",
        "transfer",
    ]
    dx_sets = [
        ["I50.9", "I10"],           # CHF + HTN
        ["J44.1", "J96.00"],        # COPD exacerbation
        ["N17.9"],                   # AKI
        ["E11.65", "E11.9"],        # Diabetes with complications
        ["I63.9"],                   # Stroke
        ["K92.1"],                   # GI bleed
        ["S72.001A"],               # Hip fracture
        ["J18.9"],                   # Pneumonia
        ["I48.91", "I50.9"],        # AFib + CHF
        ["R55"],                     # Syncope
    ]

    rows = 0
    for i in range(20):
        member_id = random.randint(1, 30)
        source_id = random.choice(source_ids)
        event_type = random.choice(event_types)
        facility = random.choice(facilities)
        dx = random.choice(dx_sets)
        event_ts = _random_recent_datetime(60)
        admit_dt = event_ts if event_type in ("admit", "er_visit") else event_ts - timedelta(days=random.randint(1, 7))
        discharge_dt = event_ts if event_type == "discharge" else (
            event_ts + timedelta(days=random.randint(1, 5)) if event_type == "admit" else
            event_ts + timedelta(hours=random.randint(2, 8)) if event_type == "er_visit" else None
        )

        cur.execute(
            """INSERT INTO adt_events
               (source_id, event_type, event_timestamp, member_id,
                match_confidence, patient_class, admit_date, discharge_date,
                diagnosis_codes, facility_name, facility_npi, facility_type,
                is_processed, estimated_total_cost, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                source_id,
                event_type,
                event_ts,
                member_id,
                random.randint(85, 100),
                "inpatient" if event_type in ("admit", "discharge", "transfer") else "emergency",
                admit_dt,
                discharge_dt,
                json.dumps(dx),
                facility[0],
                facility[1],
                facility[2],
                random.choice([True, True, True, False]),
                round(random.uniform(3000, 45000), 2),
                event_ts,
            ),
        )
        rows += 1
    print(f"  Created {rows} ADT events")


def _seed_care_alerts(cur) -> None:
    count = _count(cur, "care_alerts")
    if count > 0:
        print(f"  Care alerts already seeded ({count})")
        return

    # Get ADT event IDs
    cur.execute("SELECT id, member_id, event_type FROM adt_events ORDER BY id LIMIT 20")
    adt_rows = cur.fetchall()
    if not adt_rows:
        print("  WARNING: No ADT events found, skipping care alerts")
        return

    alert_defs = [
        # (alert_type, priority, title_template, description_template, recommended_action)
        ("readmission_risk", "critical",
         "High readmission risk: {facility} discharge",
         "Member was discharged from {facility} and has 2+ admissions in 90 days. Readmission risk score: 82%.",
         "Initiate transitional care management within 24 hours. Schedule follow-up with PCP within 7 days."),
        ("readmission_risk", "critical",
         "30-day readmission alert",
         "Member readmitted within 18 days of prior discharge. Prior diagnosis: CHF. Current: CHF exacerbation.",
         "Activate intensive care management. Review medication adherence and home health needs."),
        ("admission_notification", "high",
         "Inpatient admission: {facility}",
         "Member admitted to {facility} for acute care. Diagnosis: {dx}. Estimated stay: 3-5 days.",
         "Notify PCP and care manager. Begin discharge planning and post-acute coordination."),
        ("admission_notification", "high",
         "ER visit with admission: {facility}",
         "Member presented to ER and was admitted. Primary complaint consistent with chronic condition exacerbation.",
         "Review member's care plan. Consider whether admission was avoidable with better outpatient management."),
        ("admission_notification", "high",
         "Observation stay: {facility}",
         "Member placed in observation status. Monitor for conversion to inpatient and ensure appropriate billing.",
         "Track observation hours. If approaching 2-midnight threshold, coordinate with facility UR team."),
        ("discharge_planning", "medium",
         "Discharge pending: needs medication reconciliation",
         "Member expected to discharge within 24-48 hours. Has 8+ medications and no pharmacist reconciliation scheduled.",
         "Schedule medication reconciliation. Arrange pharmacy consultation before discharge."),
        ("discharge_planning", "medium",
         "Post-acute placement needed",
         "Member requires SNF placement post-discharge. Current authorization expires in 3 days.",
         "Coordinate SNF bed availability. Submit authorization extension if clinically indicated."),
        ("discharge_planning", "medium",
         "Home health services needed post-discharge",
         "Member being discharged with new DME and wound care needs. Home health referral not yet initiated.",
         "Order home health evaluation. Ensure DME delivery coordinated with discharge date."),
        ("follow_up_needed", "low",
         "7-day PCP follow-up due",
         "Member was discharged 5 days ago and has not yet scheduled PCP follow-up visit within the 7-day window.",
         "Contact member to schedule PCP appointment. If unable to reach, attempt home visit."),
        ("follow_up_needed", "low",
         "Post-discharge check-in overdue",
         "Automated 48-hour post-discharge call was not completed. Member has not responded to 2 outreach attempts.",
         "Escalate to care manager for direct outreach. Consider wellness check if no response by day 5."),
    ]

    rows = 0
    for i, alert_def in enumerate(alert_defs):
        adt = adt_rows[i % len(adt_rows)]
        adt_event_id = adt[0]
        member_id = adt[1]

        statuses = ["open", "open", "open", "acknowledged", "acknowledged", "in_progress",
                     "in_progress", "resolved", "resolved", "resolved"]

        cur.execute(
            """INSERT INTO care_alerts
               (adt_event_id, member_id, alert_type, priority, title, description,
                recommended_action, status, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                adt_event_id,
                member_id,
                alert_def[0],
                alert_def[1],
                alert_def[2].replace("{facility}", "Tampa General Hospital").replace("{dx}", "CHF"),
                alert_def[3].replace("{facility}", "Tampa General Hospital").replace("{dx}", "I50.9"),
                alert_def[4],
                statuses[i],
                _random_recent_datetime(30),
            ),
        )
        rows += 1
    print(f"  Created {rows} care alerts")


def _seed_annotations(cur) -> None:
    count = _count(cur, "annotations")
    if count > 0:
        print(f"  Annotations already seeded ({count})")
        return

    annotations = [
        ("member", 3, "call_log", "Called member to schedule annual wellness visit. Member confirmed appointment for 3/28. Will bring medication list.",
         False, None, "Demo MSO Admin"),
        ("member", 7, "clinical", "Member reports increased shortness of breath over past 2 weeks. PCP visit scheduled. May need cardiology referral.",
         True, _today() + timedelta(days=5), "Demo MSO Admin"),
        ("member", 12, "care_plan", "Initiated intensive care management program. Goals: reduce ER visits, improve medication adherence, close 3 open HCC suspects.",
         False, None, "Demo MSO Admin"),
        ("member", 1, "outreach", "Left voicemail regarding overdue colorectal screening. This is the 3rd attempt. Will try alternate contact number next.",
         True, _today() + timedelta(days=3), "Demo MSO Admin"),
        ("member", 15, "clinical", "Pharmacy data shows member filled insulin prescription after 45-day gap. May indicate adherence issues. Flagged for care manager review.",
         True, _today() + timedelta(days=7), "AQSoft Admin"),
        ("member", 22, "call_log", "Spoke with member's daughter (authorized representative). Confirmed member is at home, not in SNF. Updated living situation in records.",
         False, None, "Demo MSO Admin"),
        ("member", 5, "care_plan", "Transitioned from rising-risk to complex tier. Added CHF monitoring protocol. Weekly weight check calls initiated.",
         False, None, "Demo MSO Admin"),
        ("member", 18, "outreach", "Member declined breast cancer screening. Documented refusal. Will re-approach at next PCP visit per member preference.",
         False, None, "AQSoft Admin"),
        ("member", 9, "clinical", "New HbA1c result: 8.2% (down from 9.1%). Diabetes management plan showing progress. Continue current regimen.",
         False, None, "Demo MSO Admin"),
        ("member", 25, "general", "Member relocated to 33609 zip code. Updated address and reassigned PCP to Dr. Patel at FMG St. Pete per member request.",
         False, None, "Demo MSO Admin"),
    ]

    rows = 0
    for ann in annotations:
        cur.execute(
            """INSERT INTO annotations
               (entity_type, entity_id, note_type, content,
                requires_follow_up, follow_up_date, author_id, author_name, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                ann[0],
                ann[1],
                ann[2],
                ann[3],
                ann[4],
                ann[5],
                1 if ann[6] == "AQSoft Admin" else 2,
                ann[6],
                _random_recent_datetime(45),
            ),
        )
        rows += 1
    print(f"  Created {rows} annotations")


def _seed_watchlist_items(cur) -> None:
    count = _count(cur, "watchlist_items")
    if count > 0:
        print(f"  Watchlist items already seeded ({count})")
        return

    items = [
        {
            "user_id": 2,
            "entity_type": "member",
            "entity_id": 5,
            "entity_name": "Charles Jones",
            "reason": "Complex tier, multiple ER visits. Monitoring for care management effectiveness.",
            "watch_for": ["raf_change", "new_claims", "adt_events"],
            "last_snapshot": {"raf": 3.21, "open_suspects": 4, "er_visits_30d": 2},
            "changes_detected": {"raf": {"old": 3.05, "new": 3.21}, "er_visits_30d": {"old": 1, "new": 2}},
            "has_changes": True,
        },
        {
            "user_id": 2,
            "entity_type": "member",
            "entity_id": 12,
            "entity_name": "Linda Williams",
            "reason": "High cost member, SNF utilization pattern. Watching for readmission.",
            "watch_for": ["adt_events", "new_claims", "cost_change"],
            "last_snapshot": {"raf": 2.87, "total_spend_90d": 48200, "snf_days": 22},
            "changes_detected": None,
            "has_changes": False,
        },
        {
            "user_id": 2,
            "entity_type": "member",
            "entity_id": 22,
            "entity_name": "Martha Moore",
            "reason": "Rising risk trajectory. 3 new suspects identified this quarter.",
            "watch_for": ["raf_change", "new_suspects", "gap_closures"],
            "last_snapshot": {"raf": 1.98, "open_suspects": 3, "open_gaps": 2},
            "changes_detected": {"open_suspects": {"old": 2, "new": 3}},
            "has_changes": True,
        },
        {
            "user_id": 2,
            "entity_type": "provider",
            "entity_id": 2,
            "entity_name": "Dr. James Chen",
            "reason": "Below-average capture rate. Monitoring after education session.",
            "watch_for": ["capture_rate_change", "panel_raf_change"],
            "last_snapshot": {"capture_rate": 52.0, "panel_size": 45, "avg_raf": 1.85},
            "changes_detected": None,
            "has_changes": False,
        },
        {
            "user_id": 2,
            "entity_type": "group",
            "entity_id": 1,
            "entity_name": "ISG Tampa",
            "reason": "Largest group, driving overall metrics. Weekly performance check.",
            "watch_for": ["gap_closure_rate", "capture_rate", "pmpm_change"],
            "last_snapshot": {"gap_closure_rate": 71.5, "capture_rate": 68.0, "pmpm": 1245.00},
            "changes_detected": {"gap_closure_rate": {"old": 69.2, "new": 71.5}},
            "has_changes": True,
        },
    ]

    rows = 0
    for item in items:
        cur.execute(
            """INSERT INTO watchlist_items
               (user_id, entity_type, entity_id, entity_name, reason,
                watch_for, last_snapshot, changes_detected, last_checked,
                has_changes, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                item["user_id"],
                item["entity_type"],
                item["entity_id"],
                item["entity_name"],
                item["reason"],
                json.dumps(item["watch_for"]),
                json.dumps(item["last_snapshot"]),
                json.dumps(item["changes_detected"]) if item["changes_detected"] else None,
                _random_recent_datetime(2),
                item["has_changes"],
                _random_recent_datetime(60),
            ),
        )
        rows += 1
    print(f"  Created {rows} watchlist items")


def _seed_action_items(cur) -> None:
    count = _count(cur, "action_items")
    if count > 0:
        print(f"  Action items already seeded ({count})")
        return

    actions = [
        # 3 open
        {
            "source_type": "insight", "source_id": 1,
            "title": "Schedule annual wellness visits for 42 expiring recapture suspects",
            "description": "Prioritize the 12 complex-tier members first. Coordinate with ISG Tampa and FMG St. Pete schedulers.",
            "action_type": "outreach_campaign", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "high", "status": "open", "due_date": _today() + timedelta(days=14),
            "member_id": None, "provider_id": None, "group_id": 1,
            "expected_impact": "$187K annualized RAF value recovery",
        },
        {
            "source_type": "care_alert", "source_id": 1,
            "title": "Transitional care management for Member #7 post-discharge",
            "description": "Schedule PCP follow-up within 7 days. Medication reconciliation needed. Home health evaluation pending.",
            "action_type": "care_coordination", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "critical", "status": "open", "due_date": _today() + timedelta(days=3),
            "member_id": 7, "provider_id": 3, "group_id": None,
            "expected_impact": "Prevent 30-day readmission ($18K estimated avoided cost)",
        },
        {
            "source_type": "insight", "source_id": 5,
            "title": "BCS outreach campaign for 18 members needing screening",
            "description": "Partner with Tampa Imaging Center for bulk scheduling. Send member communications with available dates.",
            "action_type": "quality_initiative", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "medium", "status": "open", "due_date": _today() + timedelta(days=30),
            "member_id": None, "provider_id": None, "group_id": None,
            "expected_impact": "Improve BCS measure from 62% to 75% target",
        },
        # 2 in_progress
        {
            "source_type": "insight", "source_id": 2,
            "title": "Provider education session with Dr. Chen on HCC documentation",
            "description": "Focus on suspect documentation workflows and coding specificity. Pair with coder for 2-week shadowing.",
            "action_type": "provider_education", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "high", "status": "in_progress", "due_date": _today() + timedelta(days=7),
            "member_id": None, "provider_id": 2, "group_id": 1,
            "expected_impact": "Improve capture rate from 52% to peer average of 70% ($63K impact)",
        },
        {
            "source_type": "insight", "source_id": 4,
            "title": "Intensive care management enrollment for high-cost members",
            "description": "Enroll members #5, #12, #22 in ICM program. Member #22 home health evaluation in progress.",
            "action_type": "care_management", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "high", "status": "in_progress", "due_date": _today() + timedelta(days=10),
            "member_id": None, "provider_id": None, "group_id": None,
            "expected_impact": "Reduce combined spend by 20% ($62K savings)",
        },
        # 2 completed
        {
            "source_type": "manual", "source_id": None,
            "title": "Q4 2025 provider scorecards distributed",
            "description": "Generated and distributed provider performance scorecards to all 10 providers across 5 groups.",
            "action_type": "reporting", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "medium", "status": "completed", "due_date": _today() - timedelta(days=20),
            "member_id": None, "provider_id": None, "group_id": None,
            "expected_impact": "Improve provider awareness of performance metrics",
            "completed_date": _today() - timedelta(days=22),
            "actual_outcome": "All scorecards delivered. 3 providers requested follow-up meetings.",
        },
        {
            "source_type": "insight", "source_id": 7,
            "title": "Coding education for FMG Clearwater diabetes specificity",
            "description": "Conducted training on E11.xx specificity codes. Distributed quick-reference cards.",
            "action_type": "provider_education", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "medium", "status": "completed", "due_date": _today() - timedelta(days=30),
            "member_id": None, "provider_id": None, "group_id": 4,
            "expected_impact": "Reduce unspecified diabetes coding from 67% to <30%",
            "completed_date": _today() - timedelta(days=28),
            "actual_outcome": "Training completed. Early data shows unspecified rate dropped to 45% in first 2 weeks.",
        },
        # 1 cancelled
        {
            "source_type": "manual", "source_id": None,
            "title": "Pilot telehealth program for rural members",
            "description": "Was planned to address access issues for members in outlying zip codes.",
            "action_type": "program_initiative", "assigned_to": 2, "assigned_to_name": "Demo MSO Admin",
            "priority": "low", "status": "cancelled", "due_date": _today() - timedelta(days=10),
            "member_id": None, "provider_id": None, "group_id": None,
            "expected_impact": "Improve access metrics for 15 rural members",
            "resolution_notes": "Cancelled: vendor contract fell through. Will re-evaluate in Q2.",
        },
    ]

    rows = 0
    for act in actions:
        completed_date = act.get("completed_date")
        actual_outcome = act.get("actual_outcome")
        resolution_notes = act.get("resolution_notes")

        cur.execute(
            """INSERT INTO action_items
               (source_type, source_id, title, description, action_type,
                assigned_to, assigned_to_name, priority, status, due_date,
                completed_date, member_id, provider_id, group_id,
                expected_impact, actual_outcome, resolution_notes, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                act["source_type"],
                act["source_id"],
                act["title"],
                act["description"],
                act["action_type"],
                act["assigned_to"],
                act["assigned_to_name"],
                act["priority"],
                act["status"],
                act["due_date"],
                completed_date,
                act["member_id"],
                act["provider_id"],
                act["group_id"],
                act["expected_impact"],
                actual_outcome,
                resolution_notes,
                _random_recent_datetime(45),
            ),
        )
        rows += 1
    print(f"  Created {rows} action items")


def _seed_report_templates(cur) -> None:
    count = _count(cur, "report_templates")
    if count > 0:
        print(f"  Report templates already seeded ({count})")
        return

    templates = [
        {
            "name": "Monthly Plan Performance Report",
            "description": "Comprehensive monthly overview of plan performance including RAF, Stars, cost, and utilization metrics.",
            "report_type": "monthly",
            "sections": [
                {"key": "executive_summary", "title": "Executive Summary", "type": "narrative"},
                {"key": "raf_overview", "title": "RAF & Revenue Performance", "type": "metrics_table"},
                {"key": "stars_measures", "title": "Stars Measure Progress", "type": "gap_analysis"},
                {"key": "cost_utilization", "title": "Cost & Utilization", "type": "metrics_table"},
                {"key": "provider_performance", "title": "Provider Performance", "type": "ranked_table"},
                {"key": "action_items", "title": "Action Items & Next Steps", "type": "checklist"},
            ],
            "schedule": "monthly",
            "is_system": True,
        },
        {
            "name": "Quarterly Board Report",
            "description": "High-level quarterly summary for board presentation with trends and strategic recommendations.",
            "report_type": "quarterly",
            "sections": [
                {"key": "highlights", "title": "Quarter Highlights", "type": "narrative"},
                {"key": "financial_summary", "title": "Financial Performance", "type": "metrics_table"},
                {"key": "quality_scorecard", "title": "Quality Scorecard", "type": "scorecard"},
                {"key": "network_status", "title": "Network & Provider Status", "type": "summary"},
                {"key": "strategic_initiatives", "title": "Strategic Initiatives", "type": "narrative"},
            ],
            "schedule": "quarterly",
            "is_system": True,
        },
        {
            "name": "Provider Performance Summary",
            "description": "Individual provider scorecard with panel metrics, capture rates, and gap closure performance.",
            "report_type": "provider_scorecard",
            "sections": [
                {"key": "provider_header", "title": "Provider Information", "type": "header"},
                {"key": "panel_overview", "title": "Panel Overview", "type": "metrics_table"},
                {"key": "raf_performance", "title": "RAF & Capture Performance", "type": "comparison"},
                {"key": "gap_closures", "title": "Care Gap Closure Rates", "type": "gap_analysis"},
                {"key": "peer_comparison", "title": "Peer Comparison", "type": "ranked_table"},
            ],
            "schedule": "monthly",
            "is_system": True,
        },
        {
            "name": "RADV Audit Preparation",
            "description": "Risk Adjustment Data Validation audit preparation report with documentation status and risk areas.",
            "report_type": "audit",
            "sections": [
                {"key": "audit_summary", "title": "Audit Readiness Summary", "type": "scorecard"},
                {"key": "sample_members", "title": "Sampled Members", "type": "member_list"},
                {"key": "documentation_status", "title": "Documentation Status", "type": "status_table"},
                {"key": "risk_areas", "title": "Risk Areas", "type": "narrative"},
                {"key": "remediation_plan", "title": "Remediation Plan", "type": "checklist"},
            ],
            "schedule": None,
            "is_system": True,
        },
    ]

    rows = 0
    for t in templates:
        cur.execute(
            """INSERT INTO report_templates
               (name, description, report_type, sections, schedule, is_system, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                t["name"],
                t["description"],
                t["report_type"],
                json.dumps(t["sections"]),
                t["schedule"],
                t["is_system"],
                datetime(2025, 10, 1, 9, 0, 0),
            ),
        )
        rows += 1
    print(f"  Created {rows} report templates")


def _seed_generated_reports(cur) -> None:
    count = _count(cur, "generated_reports")
    if count > 0:
        print(f"  Generated reports already seeded ({count})")
        return

    # Get first template ID
    cur.execute("SELECT id FROM report_templates ORDER BY id LIMIT 1")
    row = cur.fetchone()
    if not row:
        print("  WARNING: No report templates found, skipping generated reports")
        return
    template_id = row[0]

    content = {
        "generated_at": "2026-03-01T08:00:00Z",
        "period": "February 2026",
        "sections": {
            "executive_summary": {
                "narrative": "February showed continued improvement in RAF capture and Stars measure closure. Total plan RAF increased 2.1% MoM. Three critical action items remain from January."
            },
            "raf_overview": {
                "avg_raf": 1.82,
                "projected_raf": 1.95,
                "raf_gap": 0.13,
                "total_members": 30,
                "open_suspects": 47,
                "captured_this_month": 12,
                "capture_rate": 68.5,
            },
            "stars_measures": {
                "overall_star_rating": 3.8,
                "measures_at_target": 8,
                "measures_below_target": 5,
                "biggest_gap": "MRP at 41% vs 60% target",
            },
            "cost_utilization": {
                "total_pmpm": 1187.50,
                "ip_admits_per_1000": 245,
                "er_visits_per_1000": 412,
                "readmission_rate": 14.2,
                "avg_los": 4.1,
            },
        },
    }

    cur.execute(
        """INSERT INTO generated_reports
           (template_id, title, period, status, content,
            ai_narrative, generated_by, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            template_id,
            "Monthly Plan Performance Report - February 2026",
            "February 2026",
            "completed",
            json.dumps(content),
            "February 2026 saw positive momentum across key metrics. RAF capture rate improved to 68.5%, driven by focused outreach to ISG Tampa providers. Stars measures are trending toward a projected 4.0 rating, though MRP and BCS remain below target and require immediate attention. Cost metrics are favorable with PMPM declining 3% from January, though ER utilization in the 33602 zip code warrants investigation. Three priority action items for March: (1) complete annual wellness visit scheduling for expiring suspects, (2) implement post-discharge medication reconciliation workflow, and (3) launch BCS screening campaign.",
            2,  # demo user
            datetime(2026, 3, 1, 8, 30, 0),
        ),
    )
    print(f"  Created 1 generated report")


def _seed_saved_filters(cur) -> None:
    count = _count(cur, "saved_filters")
    if count > 0:
        print(f"  Saved filters already seeded ({count})")
        return

    filters = [
        {
            "name": "High Risk Members",
            "description": "Members in high or complex risk tiers requiring active management",
            "page_context": "members",
            "conditions": {"risk_tier": ["high", "complex"]},
            "is_shared": True,
            "is_system": True,
        },
        {
            "name": "Open HCC Suspects",
            "description": "Members with open HCC suspects that need provider review",
            "page_context": "members",
            "conditions": {"has_open_suspects": True, "suspect_status": "open"},
            "is_shared": True,
            "is_system": True,
        },
        {
            "name": "Care Gap Priority",
            "description": "Members with 3+ open care gaps needing immediate outreach",
            "page_context": "members",
            "conditions": {"min_open_gaps": 3, "gap_status": "open"},
            "is_shared": True,
            "is_system": True,
        },
        {
            "name": "Recent ER Visitors",
            "description": "Members with ER visits in the last 30 days for follow-up coordination",
            "page_context": "members",
            "conditions": {"recent_er_visit": True, "days_back": 30},
            "is_shared": True,
            "is_system": True,
        },
        {
            "name": "RAF Opportunity",
            "description": "Members where projected RAF exceeds current RAF by 0.5+, indicating capture opportunity",
            "page_context": "members",
            "conditions": {"min_raf_gap": 0.5, "sort_by": "raf_gap_desc"},
            "is_shared": True,
            "is_system": True,
        },
    ]

    rows = 0
    for f in filters:
        cur.execute(
            """INSERT INTO saved_filters
               (name, description, page_context, conditions,
                created_by, is_shared, is_system, use_count, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                f["name"],
                f["description"],
                f["page_context"],
                json.dumps(f["conditions"]),
                2,  # demo user
                f["is_shared"],
                f["is_system"],
                random.randint(5, 40),
                datetime(2025, 10, 15, 10, 0, 0),
            ),
        )
        rows += 1
    print(f"  Created {rows} saved filters")


def _seed_raf_history(cur) -> None:
    count = _count(cur, "raf_history")
    if count > 0:
        print(f"  RAF history already seeded ({count})")
        return

    rows = 0
    for member_id in range(1, 11):  # 10 members
        # Base values per member (some variation)
        base_demo = round(random.uniform(0.25, 0.55), 3)
        base_disease = round(random.uniform(0.3, 2.5), 3)
        base_interaction = round(random.uniform(0.0, 0.4), 3)

        for month_offset in range(6):
            calc_date = _months_ago(6 - month_offset)

            # Simulate gradual RAF changes over time
            demo_raf = base_demo  # demographic stays stable
            disease_raf = round(base_disease + month_offset * random.uniform(-0.05, 0.12), 3)
            interaction_raf = round(base_interaction + month_offset * random.uniform(-0.02, 0.05), 3)
            if interaction_raf < 0:
                interaction_raf = 0.0
            total_raf = round(demo_raf + disease_raf + interaction_raf, 3)

            hcc_count = random.randint(1, 8)
            suspect_count = random.randint(0, 5)

            cur.execute(
                """INSERT INTO raf_history
                   (member_id, calculation_date, payment_year, demographic_raf,
                    disease_raf, interaction_raf, total_raf, hcc_count, suspect_count,
                    created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    member_id,
                    calc_date,
                    2026,
                    demo_raf,
                    disease_raf,
                    interaction_raf,
                    total_raf,
                    hcc_count,
                    suspect_count,
                    datetime(calc_date.year, calc_date.month, calc_date.day, 6, 0, 0),
                ),
            )
            rows += 1
    print(f"  Created {rows} RAF history rows (10 members x 6 months)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  AQSoft Health Platform - Extended Seed")
    print("=" * 60)
    print()
    seed()
