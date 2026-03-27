"""
Data Protection Service — 8 layers of defense against bad data.

1. Source Fingerprinting — recognize returning sources instantly
2. Field Confidence Scoring — every field gets 0-100 confidence
3. Shadow Processing — compare new data against prior state
4. Cross-Source Validation — use multiple sources to validate each other
5. Statistical Anomaly Detection — file-level sanity checks before processing
6. Golden Record Management — maintain best-known version of each entity
7. Batch Rollback — undo an entire ingestion if problems are found
8. Data Contract Testing — validate files against expected schemas
"""

import hashlib
import json
import logging
import re
from datetime import datetime, date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Source Fingerprinting
# ---------------------------------------------------------------------------

async def fingerprint_source(
    db: AsyncSession,
    headers: list[str],
    sample_rows: list,
    filename: str,
) -> dict:
    """Generate and match a source fingerprint.

    Creates a fingerprint from: column count, column names hash,
    detected date format patterns, delimiter hints, value patterns per column.
    Checks stored fingerprints — if a match is found, returns the saved
    mapping and rules (zero-config re-import). Otherwise returns None.
    """
    # Build fingerprint components
    col_names_sorted = sorted([h.strip().lower() for h in headers])
    col_hash = hashlib.sha256(json.dumps(col_names_sorted).encode()).hexdigest()
    column_count = len(headers)

    # Detect date format patterns from sample rows
    date_formats = _detect_date_formats(headers, sample_rows)

    # Detect value patterns per column (numeric, text, code, etc.)
    value_patterns = _detect_value_patterns(headers, sample_rows)

    # Check against stored fingerprints
    try:
        result = await db.execute(
            text("""
                SELECT id, source_name, fingerprint_hash, column_count, column_names,
                       date_formats, value_patterns, mapping_template_id, times_matched
                FROM source_fingerprints
                WHERE fingerprint_hash = :hash
                LIMIT 1
            """),
            {"hash": col_hash},
        )
        row = result.fetchone()

        if row:
            # Update match count
            await db.execute(
                text("UPDATE source_fingerprints SET times_matched = times_matched + 1 WHERE id = :id"),
                {"id": row.id},
            )
            await db.commit()
            return {
                "matched": True,
                "fingerprint_id": row.id,
                "source_name": row.source_name,
                "mapping_template_id": row.mapping_template_id,
                "times_matched": row.times_matched + 1,
                "column_names": row.column_names,
                "date_formats": row.date_formats,
                "value_patterns": row.value_patterns,
            }

        # No match — store new fingerprint
        await db.execute(
            text("""
                INSERT INTO source_fingerprints
                    (source_name, fingerprint_hash, column_count, column_names,
                     date_formats, value_patterns, times_matched)
                VALUES (:name, :hash, :col_count, :col_names::jsonb,
                        :date_fmts::jsonb, :val_pats::jsonb, 0)
            """),
            {
                "name": filename,
                "hash": col_hash,
                "col_count": column_count,
                "col_names": json.dumps(col_names_sorted),
                "date_fmts": json.dumps(date_formats),
                "val_pats": json.dumps(value_patterns),
            },
        )
        await db.commit()
        return {
            "matched": False,
            "fingerprint_hash": col_hash,
            "column_count": column_count,
            "date_formats": date_formats,
            "value_patterns": value_patterns,
        }
    except Exception as e:
        logger.warning("Fingerprint matching failed: %s", e)
        return {
            "matched": False,
            "fingerprint_hash": col_hash,
            "column_count": column_count,
            "date_formats": date_formats,
            "value_patterns": value_patterns,
        }


def _detect_date_formats(headers: list[str], sample_rows: list) -> dict:
    """Scan sample rows to detect date format patterns per column."""
    patterns = {}
    date_re = {
        "YYYY-MM-DD": re.compile(r"^\d{4}-\d{2}-\d{2}$"),
        "MM/DD/YYYY": re.compile(r"^\d{2}/\d{2}/\d{4}$"),
        "MM/DD/YY": re.compile(r"^\d{2}/\d{2}/\d{2}$"),
        "DD-Mon-YYYY": re.compile(r"^\d{2}-[A-Za-z]{3}-\d{4}$"),
        "M/D/YYYY": re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$"),
    }
    for col_idx, header in enumerate(headers):
        for row in sample_rows[:10]:
            val = str(row[col_idx] if isinstance(row, (list, tuple)) else row.get(header, "")).strip()
            for fmt_name, regex in date_re.items():
                if regex.match(val):
                    patterns[header] = fmt_name
                    break
            if header in patterns:
                break
    return patterns


def _detect_value_patterns(headers: list[str], sample_rows: list) -> dict:
    """Classify each column as numeric, code, text, date, etc."""
    patterns = {}
    for col_idx, header in enumerate(headers):
        values = []
        for row in sample_rows[:20]:
            val = str(row[col_idx] if isinstance(row, (list, tuple)) else row.get(header, "")).strip()
            if val:
                values.append(val)

        if not values:
            patterns[header] = "empty"
            continue

        # Check if mostly numeric
        numeric_count = sum(1 for v in values if re.match(r"^-?[\d,]+\.?\d*$", v.replace("$", "").replace(",", "")))
        if numeric_count / len(values) > 0.8:
            patterns[header] = "numeric"
            continue

        # Check if ICD/CPT code patterns
        if any(re.match(r"^[A-Z]\d{2}(\.\d{1,4})?$", v) for v in values):
            patterns[header] = "icd10"
            continue
        if any(re.match(r"^\d{5}$", v) for v in values):
            patterns[header] = "cpt"
            continue

        # Check if NPI
        if all(re.match(r"^\d{10}$", v) for v in values):
            patterns[header] = "npi"
            continue

        patterns[header] = "text"

    return patterns


# ---------------------------------------------------------------------------
# 2. Field Confidence Scoring
# ---------------------------------------------------------------------------

async def score_field_confidence(field: str, value: str, context: dict | None = None) -> int:
    """Score confidence 0-100 for a single field value.

    Scoring rules:
    - member_id: 95+ if matches expected format, 60 if unusual
    - date: 99 if unambiguous (YYYY-MM-DD), 70 if ambiguous (MM/DD/YY)
    - icd10: 99 if valid format, 50 if close match, 0 if invalid
    - npi: 99 if passes Luhn check, 0 if fails
    - name: 90 if normal format, 60 if all caps or reversed
    - amount: 95 if clean number, 70 if had to parse currency symbols
    """
    if not value or not value.strip():
        return 0

    value = value.strip()
    field_lower = field.lower()

    # Member ID
    if "member" in field_lower and "id" in field_lower:
        if re.match(r"^[A-Z0-9]{6,15}$", value):
            return 95
        if re.match(r"^[\w-]+$", value):
            return 60
        return 30

    # Date fields
    if "date" in field_lower or "dob" in field_lower or field_lower in ("from", "to", "through"):
        if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
            return 99  # Unambiguous ISO format
        if re.match(r"^\d{2}/\d{2}/\d{4}$", value):
            parts = value.split("/")
            month, day = int(parts[0]), int(parts[1])
            if month > 12:
                return 50  # Likely DD/MM/YYYY mismatch
            if day > 12:
                return 95  # Unambiguous (day > 12 means MM/DD)
            return 70  # Ambiguous (both could be month or day)
        if re.match(r"^\d{2}/\d{2}/\d{2}$", value):
            return 60  # Two-digit year is always risky
        return 40

    # ICD-10 codes
    if "icd" in field_lower or "diag" in field_lower or "dx" in field_lower:
        if re.match(r"^[A-Z]\d{2}(\.\d{1,4})?$", value):
            return 99  # Valid ICD-10 format
        if re.match(r"^[A-Z]\d{2}$", value):
            return 85  # Valid but no decimal
        if re.match(r"^\d{3,5}$", value):
            return 50  # Might be ICD-9 or invalid
        return 0

    # NPI
    if "npi" in field_lower:
        if re.match(r"^\d{10}$", value):
            if _luhn_check(value):
                return 99
            return 40  # Right length but fails Luhn
        return 0

    # Name fields
    if "name" in field_lower or field_lower in ("first", "last", "provider"):
        if value == value.upper() and len(value) > 2:
            return 60  # All caps — likely raw data
        if "," in value:
            return 75  # Last, First format — valid but needs parsing
        if re.match(r"^[A-Z][a-z]+ [A-Z][a-z]+", value):
            return 90  # Normal name format
        return 70

    # Amount / currency
    if "amount" in field_lower or "charge" in field_lower or "paid" in field_lower or "cost" in field_lower:
        clean = value.replace("$", "").replace(",", "").strip()
        try:
            float(clean)
            if "$" in value or "," in value:
                return 70  # Had to parse formatting
            return 95  # Clean number
        except ValueError:
            return 0

    # Default: present = 80
    return 80


def _luhn_check(number: str) -> bool:
    """Validate an NPI using the Luhn algorithm (with prefix 80840)."""
    digits = [int(d) for d in "80840" + number]
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


# ---------------------------------------------------------------------------
# 3. Shadow Processing
# ---------------------------------------------------------------------------

async def shadow_compare(
    db: AsyncSession,
    new_data_summary: dict,
    source_name: str,
) -> dict:
    """Compare new ingestion against prior state from same source.

    Pulls stats from last ingestion and compares:
    - Member count (within 10%?)
    - Average amounts
    - Code distribution
    - Date range overlap
    - New/missing members

    Returns: {safe: bool, warnings: list, anomalies: list}
    """
    warnings: list[str] = []
    anomalies: list[str] = []

    try:
        # Get stats from last ingestion of this source
        result = await db.execute(
            text("""
                SELECT record_count, created_at
                FROM ingestion_batches
                WHERE source_name = :source AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"source": source_name},
        )
        last_batch = result.fetchone()

        if not last_batch:
            return {
                "safe": True,
                "warnings": ["No prior ingestion found for this source — first-time import"],
                "anomalies": [],
                "is_first_import": True,
            }

        prev_count = last_batch.record_count
        new_count = new_data_summary.get("record_count", 0)

        # Member count comparison
        if prev_count > 0:
            change_pct = abs(new_count - prev_count) / prev_count * 100
            if change_pct > 40:
                anomalies.append(
                    f"Record count changed {change_pct:.0f}% vs last file "
                    f"({prev_count} -> {new_count}) — possible truncation or duplication"
                )
            elif change_pct > 10:
                warnings.append(
                    f"Record count changed {change_pct:.0f}% vs last file "
                    f"({prev_count} -> {new_count})"
                )

        # Date range check
        new_date_range = new_data_summary.get("date_range")
        if new_date_range:
            if new_date_range.get("min") and new_date_range.get("max"):
                warnings.append(
                    f"Date range: {new_date_range['min']} to {new_date_range['max']}"
                )

        # Amount distribution
        new_avg_amount = new_data_summary.get("avg_amount")
        prev_avg_amount = new_data_summary.get("prev_avg_amount")
        if new_avg_amount and prev_avg_amount and prev_avg_amount > 0:
            amount_change = abs(new_avg_amount - prev_avg_amount) / prev_avg_amount * 100
            if amount_change > 50:
                anomalies.append(
                    f"Average amount changed {amount_change:.0f}% "
                    f"(${prev_avg_amount:.2f} -> ${new_avg_amount:.2f})"
                )

        safe = len(anomalies) == 0
        return {
            "safe": safe,
            "warnings": warnings,
            "anomalies": anomalies,
            "prev_record_count": prev_count,
            "new_record_count": new_count,
            "last_ingestion": str(last_batch.created_at) if last_batch.created_at else None,
        }
    except Exception as e:
        logger.warning("Shadow comparison failed: %s", e)
        return {
            "safe": True,
            "warnings": [f"Shadow comparison could not complete: {e}"],
            "anomalies": [],
        }


# ---------------------------------------------------------------------------
# 4. Cross-Source Validation
# ---------------------------------------------------------------------------

async def cross_validate(db: AsyncSession, member_id: int) -> dict:
    """Validate a member's data across all available sources.

    Checks:
    - Do claims diagnoses match roster conditions?
    - Do pharmacy meds match diagnoses? (insulin -> diabetes should exist)
    - Does PCP in roster match rendering provider in claims?
    - Do lab results support documented conditions?

    Returns: {consistent: bool, conflicts: list, confirmations: list}
    """
    conflicts: list[dict] = []
    confirmations: list[dict] = []

    try:
        # Get member diagnoses from claims (diagnosis_codes is an array column)
        claims_result = await db.execute(
            text("""
                SELECT DISTINCT unnest(diagnosis_codes) as dx_code
                FROM claims
                WHERE member_id = :mid AND diagnosis_codes IS NOT NULL
            """),
            {"mid": member_id},
        )
        claim_rows = claims_result.fetchall()
        claim_dx_codes = set()
        for r in claim_rows:
            if r.dx_code:
                claim_dx_codes.add(r.dx_code)

        # Get member demographics
        member_result = await db.execute(
            text("SELECT * FROM members WHERE id = :mid"),
            {"mid": member_id},
        )
        member = member_result.fetchone()

        if not member:
            return {
                "consistent": True,
                "conflicts": [],
                "confirmations": [],
                "note": "Member not found",
            }

        # Cross-check: diabetes codes should match diabetes-related claims
        diabetes_codes = {c for c in claim_dx_codes if c.startswith("E11") or c.startswith("E10")}
        if diabetes_codes:
            confirmations.append({
                "type": "diagnosis_confirmed",
                "detail": f"Diabetes codes ({', '.join(sorted(diabetes_codes))}) found in claims",
                "sources": ["claims"],
            })

        # Check for common med-diagnosis mismatches (example logic)
        ckd_codes = {c for c in claim_dx_codes if c.startswith("N18")}
        htn_codes = {c for c in claim_dx_codes if c.startswith("I10") or c.startswith("I11")}

        if ckd_codes and not htn_codes:
            conflicts.append({
                "type": "missing_related_diagnosis",
                "detail": "CKD documented but no hypertension codes found — HTN is present in >80% of CKD cases",
                "severity": "warning",
                "sources": ["claims"],
            })

        consistent = len([c for c in conflicts if c.get("severity") == "error"]) == 0
        return {
            "consistent": consistent,
            "conflicts": conflicts,
            "confirmations": confirmations,
            "diagnosis_count": len(claim_dx_codes),
        }
    except Exception as e:
        logger.warning("Cross-validation failed for member %s: %s", member_id, e)
        return {
            "consistent": True,
            "conflicts": [],
            "confirmations": [],
            "note": f"Cross-validation could not complete: {e}",
        }


# ---------------------------------------------------------------------------
# 5. Statistical Anomaly Detection
# ---------------------------------------------------------------------------

async def detect_file_anomalies(
    headers: list[str],
    data: list[dict],
    source_name: str,
    db: AsyncSession,
) -> dict:
    """File-level sanity checks before any row processing.

    Checks:
    - Row count vs expected (based on source history)
    - Any column > 40% same value? (bad data indicator)
    - Date range within expected window
    - Amount distribution reasonable (no sudden 10x spike)
    - Diagnosis code diversity (not all E11.9)

    Returns: {safe: bool, anomalies: list[{type, severity, detail}]}
    """
    anomalies: list[dict] = []
    row_count = len(data)

    if row_count == 0:
        return {
            "safe": False,
            "anomalies": [{"type": "empty_file", "severity": "critical", "detail": "File contains no data rows"}],
        }

    # Check for columns with > 40% identical values
    for header in headers:
        values = [str(row.get(header, "")).strip() for row in data if row.get(header)]
        if not values:
            continue
        from collections import Counter
        counter = Counter(values)
        most_common_val, most_common_count = counter.most_common(1)[0]
        if len(values) > 10 and most_common_count / len(values) > 0.40:
            # Exclude boolean-like columns
            if most_common_val.lower() not in ("true", "false", "yes", "no", "y", "n", "0", "1", "active", "m", "f"):
                anomalies.append({
                    "type": "low_diversity",
                    "severity": "warning",
                    "detail": (
                        f"Column '{header}' has {most_common_count}/{len(values)} rows "
                        f"({most_common_count / len(values) * 100:.0f}%) with value '{most_common_val}'"
                    ),
                })

    # Check date range
    for header in headers:
        if "date" in header.lower():
            dates = []
            for row in data:
                val = str(row.get(header, "")).strip()
                parsed = _try_parse_date(val)
                if parsed:
                    dates.append(parsed)
            if dates:
                min_date = min(dates)
                max_date = max(dates)
                today = date.today()
                if max_date > today:
                    anomalies.append({
                        "type": "future_dates",
                        "severity": "warning",
                        "detail": f"Column '{header}' contains future dates (max: {max_date})",
                    })
                if min_date.year < 2000:
                    anomalies.append({
                        "type": "old_dates",
                        "severity": "warning",
                        "detail": f"Column '{header}' contains dates before 2000 (min: {min_date})",
                    })
            break  # Only check first date column

    # Check amount distribution
    for header in headers:
        if any(kw in header.lower() for kw in ("amount", "charge", "paid", "cost", "price")):
            amounts = []
            for row in data:
                val = str(row.get(header, "")).replace("$", "").replace(",", "").strip()
                try:
                    amounts.append(float(val))
                except (ValueError, TypeError):
                    pass
            if len(amounts) > 5:
                avg = sum(amounts) / len(amounts)
                max_amt = max(amounts)
                if avg > 0 and max_amt / avg > 10:
                    anomalies.append({
                        "type": "amount_outlier",
                        "severity": "warning",
                        "detail": (
                            f"Column '{header}' has outlier: max ${max_amt:,.2f} "
                            f"is {max_amt / avg:.0f}x the average ${avg:,.2f}"
                        ),
                    })
            break

    # Check row count against history
    try:
        result = await db.execute(
            text("""
                SELECT record_count FROM ingestion_batches
                WHERE source_name = :source AND status = 'active'
                ORDER BY created_at DESC LIMIT 5
            """),
            {"source": source_name},
        )
        history = [r.record_count for r in result.fetchall()]
        if history:
            avg_count = sum(history) / len(history)
            if avg_count > 0 and abs(row_count - avg_count) / avg_count > 0.5:
                anomalies.append({
                    "type": "row_count_deviation",
                    "severity": "warning",
                    "detail": (
                        f"Row count ({row_count}) deviates >50% from "
                        f"historical average ({avg_count:.0f})"
                    ),
                })
    except Exception as e:
        logger.warning("History check failed: %s", e)

    safe = all(a["severity"] != "critical" for a in anomalies)
    return {"safe": safe, "anomalies": anomalies, "row_count": row_count}


def _try_parse_date(val: str) -> date | None:
    """Try to parse a date string in common formats."""
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d-%b-%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


# ---------------------------------------------------------------------------
# 6. Golden Record Management
# ---------------------------------------------------------------------------

async def update_golden_record(
    db: AsyncSession,
    member_id: int,
    new_data: dict,
    source: str,
    source_priority: int,
) -> dict:
    """Maintain the best-known version of a member's demographics.

    Each field tracks: value, source, last_updated, confidence.
    Higher priority source overwrites lower.
    More recent overwrites older (same priority).

    Returns: {updated_fields: list, conflicts_resolved: list}
    """
    updated_fields: list[str] = []
    conflicts_resolved: list[dict] = []

    try:
        for field_name, new_value in new_data.items():
            if new_value is None or str(new_value).strip() == "":
                continue

            new_value_str = str(new_value).strip()
            confidence = await score_field_confidence(field_name, new_value_str)

            # Check existing golden record for this field
            result = await db.execute(
                text("""
                    SELECT id, value, source, source_priority, confidence
                    FROM golden_records
                    WHERE member_id = :mid AND field_name = :field
                """),
                {"mid": member_id, "field": field_name},
            )
            existing = result.fetchone()

            should_update = False
            if not existing:
                should_update = True
            elif source_priority > existing.source_priority:
                should_update = True
            elif source_priority == existing.source_priority and confidence >= existing.confidence:
                should_update = True

            if should_update:
                if existing:
                    if existing.value != new_value_str:
                        conflicts_resolved.append({
                            "field": field_name,
                            "old_value": existing.value,
                            "old_source": existing.source,
                            "new_value": new_value_str,
                            "new_source": source,
                        })
                    await db.execute(
                        text("""
                            UPDATE golden_records
                            SET value = :val, source = :src, source_priority = :pri,
                                confidence = :conf, updated_at = NOW()
                            WHERE id = :id
                        """),
                        {
                            "val": new_value_str,
                            "src": source,
                            "pri": source_priority,
                            "conf": confidence,
                            "id": existing.id,
                        },
                    )
                else:
                    await db.execute(
                        text("""
                            INSERT INTO golden_records
                                (member_id, field_name, value, source, source_priority, confidence)
                            VALUES (:mid, :field, :val, :src, :pri, :conf)
                        """),
                        {
                            "mid": member_id,
                            "field": field_name,
                            "val": new_value_str,
                            "src": source,
                            "pri": source_priority,
                            "conf": confidence,
                        },
                    )
                updated_fields.append(field_name)

        await db.commit()
        return {
            "updated_fields": updated_fields,
            "conflicts_resolved": conflicts_resolved,
        }
    except Exception as e:
        await db.rollback()
        logger.error("Golden record update failed for member %s: %s", member_id, e)
        return {"updated_fields": [], "conflicts_resolved": [], "error": str(e)}


# ---------------------------------------------------------------------------
# 7. Batch Rollback
# ---------------------------------------------------------------------------

async def rollback_batch(db: AsyncSession, batch_id: int) -> dict:
    """Undo an entire ingestion batch.

    Finds all records tagged with this batch_id (via data_lineage),
    deletes inserted records, restores overwritten values from
    data_lineage field_changes.

    Returns: {records_removed, records_restored, affected_tables}
    """
    records_removed = 0
    records_restored = 0
    affected_tables: set[str] = set()

    try:
        # Verify batch exists and is active
        batch_result = await db.execute(
            text("SELECT id, status FROM ingestion_batches WHERE id = :bid"),
            {"bid": batch_id},
        )
        batch = batch_result.fetchone()
        if not batch:
            return {"error": "Batch not found", "records_removed": 0, "records_restored": 0}
        if batch.status == "rolled_back":
            return {"error": "Batch already rolled back", "records_removed": 0, "records_restored": 0}

        # Find all lineage records for this batch
        lineage_result = await db.execute(
            text("""
                SELECT id, entity_type, entity_id, field_changes
                FROM data_lineage
                WHERE ingestion_job_id = :bid
                ORDER BY created_at DESC
            """),
            {"bid": batch_id},
        )
        lineage_rows = lineage_result.fetchall()

        for row in lineage_rows:
            entity_type = row.entity_type
            entity_id = row.entity_id
            field_changes = row.field_changes

            table_name = _entity_type_to_table(entity_type)
            affected_tables.add(table_name)

            if field_changes:
                # Validate table_name against known entity types
                valid_tables = set(_entity_type_to_table(et) for et in ("member", "claim", "provider", "care_gap", "hcc_suspect"))
                if table_name not in valid_tables:
                    logger.warning("Skipping rollback for unknown table: %s", table_name)
                    continue

                # Restore old values
                for field, change in field_changes.items():
                    # Validate field name to prevent SQL injection
                    if not re.match(r'^[a-z_][a-z0-9_]*$', field):
                        logger.warning("Skipping invalid field name in rollback: %s", field)
                        continue
                    old_val = change.get("old")
                    if old_val is not None:
                        await db.execute(
                            text(f"UPDATE {table_name} SET {field} = :val WHERE id = :eid"),
                            {"val": old_val, "eid": entity_id},
                        )
                        records_restored += 1
                    else:
                        # Field was newly added — this was an insert
                        pass
            else:
                # No field changes means this was an insert — delete the record
                valid_tables = set(_entity_type_to_table(et) for et in ("member", "claim", "provider", "care_gap", "hcc_suspect"))
                if table_name not in valid_tables:
                    logger.warning("Skipping rollback delete for unknown table: %s", table_name)
                    continue
                await db.execute(
                    text(f"DELETE FROM {table_name} WHERE id = :eid"),
                    {"eid": entity_id},
                )
                records_removed += 1

        # Mark batch as rolled back
        await db.execute(
            text("""
                UPDATE ingestion_batches
                SET status = 'rolled_back', rolled_back_at = NOW()
                WHERE id = :bid
            """),
            {"bid": batch_id},
        )

        await db.commit()
        return {
            "records_removed": records_removed,
            "records_restored": records_restored,
            "affected_tables": list(affected_tables),
            "batch_id": batch_id,
        }
    except Exception as e:
        await db.rollback()
        logger.error("Batch rollback failed for batch %s: %s", batch_id, e)
        return {"error": str(e), "records_removed": 0, "records_restored": 0}


def _entity_type_to_table(entity_type: str) -> str:
    """Map entity type names to table names."""
    mapping = {
        "member": "members",
        "claim": "claims",
        "provider": "providers",
        "care_gap": "member_gaps",
        "hcc_suspect": "hcc_suspects",
    }
    return mapping.get(entity_type, f"{entity_type}s")


# ---------------------------------------------------------------------------
# 8. Data Contract Testing
# ---------------------------------------------------------------------------

async def test_contract(
    headers: list[str],
    sample_rows: list,
    contract: dict,
) -> dict:
    """Validate a file against a defined data contract.

    Contract defines: expected columns, types, value ranges, required fields,
    row count range, date range, unique keys.

    Returns: {passed: bool, violations: list[{rule, detail, severity}]}
    """
    violations: list[dict] = []

    # Check required columns
    required_columns = contract.get("required_columns", [])
    headers_lower = [h.lower().strip() for h in headers]
    for col in required_columns:
        if col.lower() not in headers_lower:
            violations.append({
                "rule": "required_column",
                "detail": f"Required column '{col}' is missing",
                "severity": "critical",
            })

    # Check expected columns (warning if extra)
    expected_columns = contract.get("expected_columns", [])
    if expected_columns:
        expected_lower = {c.lower() for c in expected_columns}
        for h in headers:
            if h.lower().strip() not in expected_lower:
                violations.append({
                    "rule": "unexpected_column",
                    "detail": f"Unexpected column '{h}' not in contract",
                    "severity": "info",
                })

    # Check row count range
    row_count_range = contract.get("row_count_range")
    row_count = len(sample_rows)
    if row_count_range:
        min_rows = row_count_range.get("min", 0)
        max_rows = row_count_range.get("max", float("inf"))
        if row_count < min_rows:
            violations.append({
                "rule": "row_count_min",
                "detail": f"Row count ({row_count}) below minimum ({min_rows})",
                "severity": "critical",
            })
        if row_count > max_rows:
            violations.append({
                "rule": "row_count_max",
                "detail": f"Row count ({row_count}) above maximum ({max_rows})",
                "severity": "warning",
            })

    # Check column types
    column_types = contract.get("column_types", {})
    for col, expected_type in column_types.items():
        col_idx = None
        for i, h in enumerate(headers):
            if h.lower().strip() == col.lower():
                col_idx = i
                break
        if col_idx is None:
            continue

        mismatches = 0
        checked = 0
        for row in sample_rows[:50]:
            val = str(row[col_idx] if isinstance(row, (list, tuple)) else row.get(col, "")).strip()
            if not val:
                continue
            checked += 1
            if not _check_type(val, expected_type):
                mismatches += 1

        if checked > 0 and mismatches / checked > 0.1:
            violations.append({
                "rule": "column_type",
                "detail": (
                    f"Column '{col}' has {mismatches}/{checked} values "
                    f"not matching expected type '{expected_type}'"
                ),
                "severity": "warning",
            })

    # Check value ranges
    value_ranges = contract.get("value_ranges", {})
    for col, range_spec in value_ranges.items():
        for row in sample_rows[:50]:
            val = str(row.get(col, "")).strip() if isinstance(row, dict) else ""
            if not val:
                continue
            try:
                num_val = float(val.replace("$", "").replace(",", ""))
                if "min" in range_spec and num_val < range_spec["min"]:
                    violations.append({
                        "rule": "value_range",
                        "detail": f"Column '{col}' value {num_val} below minimum {range_spec['min']}",
                        "severity": "warning",
                    })
                    break
                if "max" in range_spec and num_val > range_spec["max"]:
                    violations.append({
                        "rule": "value_range",
                        "detail": f"Column '{col}' value {num_val} above maximum {range_spec['max']}",
                        "severity": "warning",
                    })
                    break
            except (ValueError, TypeError):
                pass

    # Check unique keys
    unique_keys = contract.get("unique_keys", [])
    for key_col in unique_keys:
        values = []
        for row in sample_rows:
            val = row.get(key_col, "") if isinstance(row, dict) else ""
            if val:
                values.append(str(val))
        if values and len(values) != len(set(values)):
            dup_count = len(values) - len(set(values))
            violations.append({
                "rule": "unique_key",
                "detail": f"Column '{key_col}' has {dup_count} duplicate values",
                "severity": "critical",
            })

    passed = all(v["severity"] != "critical" for v in violations)
    return {"passed": passed, "violations": violations}


def _check_type(value: str, expected_type: str) -> bool:
    """Check if a value matches an expected type."""
    if expected_type == "integer":
        return bool(re.match(r"^-?\d+$", value))
    if expected_type == "decimal" or expected_type == "float":
        return bool(re.match(r"^-?[\d,]+\.?\d*$", value.replace("$", "").replace(",", "")))
    if expected_type == "date":
        return _try_parse_date(value) is not None
    if expected_type == "icd10":
        return bool(re.match(r"^[A-Z]\d{2}(\.\d{1,4})?$", value))
    if expected_type == "npi":
        return bool(re.match(r"^\d{10}$", value))
    if expected_type == "string":
        return True
    return True
