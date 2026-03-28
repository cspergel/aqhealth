"""
AI Data Intelligence Loop — auto-learn transformation rules from human corrections.

This service closes the feedback loop: when humans correct data, the system
learns patterns and auto-creates TransformationRules so the same corrections
never need to be made twice.

Flow:
  1. Human corrects a value (log_correction)
  2. After upload completes, analyze_correction_patterns finds recurring fixes
  3. auto_create_transformation_rule turns patterns into TransformationRules
  4. apply_learned_rules applies active rules to future uploads automatically
"""

import logging
import re
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_quality import DataCorrection
from app.models.transformation_rule import TransformationRule

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Log a human correction
# ---------------------------------------------------------------------------

async def log_correction(
    db: AsyncSession,
    correction_type: str,
    source_context: dict[str, Any] | None,
    field: str,
    original_value: str | None,
    corrected_value: str | None,
) -> DataCorrection:
    """
    Record a human correction for later pattern analysis.

    Args:
        db: Async database session.
        correction_type: Category of fix — "value_fix", "format_fix", "code_correction".
        source_context: Optional dict with source_name, data_type, row_number, etc.
        field: The field name that was corrected (e.g. "gender", "date_of_birth").
        original_value: The value before correction.
        corrected_value: The value after correction.

    Returns:
        The persisted DataCorrection record.
    """
    source_name = (source_context or {}).get("source_name")
    data_type = (source_context or {}).get("data_type")

    correction = DataCorrection(
        correction_type=correction_type,
        source_name=source_name,
        data_type=data_type,
        field=field,
        original_value=original_value,
        corrected_value=corrected_value,
        context=source_context,
        rule_created=False,
    )
    db.add(correction)
    await db.flush()

    logger.info(
        "Logged correction: field=%s, %r -> %r (type=%s)",
        field, original_value, corrected_value, correction_type,
    )
    return correction


# ---------------------------------------------------------------------------
# 2. Analyze patterns in accumulated corrections
# ---------------------------------------------------------------------------

async def analyze_correction_patterns(db: AsyncSession) -> list[dict[str, Any]]:
    """
    Find recurring correction patterns (same field + same original->corrected
    appearing 2+ times) that haven't already produced a rule.

    Returns:
        List of pattern dicts:
        [
            {
                "field": "gender",
                "original_value": "1",
                "corrected_value": "M",
                "count": 7,
                "source_name": "Humana 837 Feed" or None,
                "data_type": "claims" or None,
                "correction_type": "value_fix",
            },
            ...
        ]
    """
    # Group corrections by (field, original_value, corrected_value) where
    # no rule has been created yet.
    stmt = (
        select(
            DataCorrection.field,
            DataCorrection.original_value,
            DataCorrection.corrected_value,
            DataCorrection.source_name,
            DataCorrection.data_type,
            DataCorrection.correction_type,
            func.count().label("cnt"),
        )
        .where(DataCorrection.rule_created == False)  # noqa: E712
        .group_by(
            DataCorrection.field,
            DataCorrection.original_value,
            DataCorrection.corrected_value,
            DataCorrection.source_name,
            DataCorrection.data_type,
            DataCorrection.correction_type,
        )
        .having(func.count() >= 2)
        .order_by(func.count().desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    patterns: list[dict[str, Any]] = []
    for row in rows:
        patterns.append({
            "field": row.field,
            "original_value": row.original_value,
            "corrected_value": row.corrected_value,
            "source_name": row.source_name,
            "data_type": row.data_type,
            "correction_type": row.correction_type,
            "count": row.cnt,
        })

    if patterns:
        logger.info("Found %d correction patterns ready for rule creation", len(patterns))

        # Auto-create rules for each discovered pattern
        rules_created = 0
        for pattern in patterns:
            try:
                rule = await auto_create_transformation_rule(db, pattern)
                if rule:
                    rules_created += 1
            except Exception as e:
                logger.warning("Failed to auto-create rule for pattern %s: %s", pattern, e)

        if rules_created:
            await db.commit()
            logger.info("Auto-created %d transformation rules from patterns", rules_created)

    return patterns


# ---------------------------------------------------------------------------
# 3. Auto-create a TransformationRule from a discovered pattern
# ---------------------------------------------------------------------------

async def auto_create_transformation_rule(
    db: AsyncSession,
    pattern: dict[str, Any],
) -> TransformationRule | None:
    """
    Create a TransformationRule from a recurring correction pattern.

    Activation policy:
        - 2-4 occurrences: is_active=False (needs human approval)
        - 5+ occurrences: is_active=True (auto-apply)

    Args:
        pattern: Dict from analyze_correction_patterns with field, original_value,
                 corrected_value, count, source_name, data_type, correction_type.

    Returns:
        The created TransformationRule, or None if a duplicate already exists.
    """
    field = pattern["field"]
    original = pattern["original_value"]
    corrected = pattern["corrected_value"]
    count = pattern["count"]

    # Check for existing duplicate rule
    existing = await db.execute(
        select(TransformationRule).where(
            TransformationRule.field == field,
            TransformationRule.condition == {"value": original},
            TransformationRule.transformation == {"to": corrected},
        )
    )
    if existing.scalars().first():
        logger.debug("Rule already exists for %s: %r -> %r, skipping", field, original, corrected)
        return None

    # Determine rule_type from correction_type
    rule_type_map = {
        "value_fix": "value_map",
        "format_fix": "format_convert",
        "code_correction": "code_correction",
    }
    rule_type = rule_type_map.get(pattern.get("correction_type", ""), "value_map")

    # Activation threshold: 5+ auto-activates, under 5 needs approval
    is_active = count >= 5

    rule = TransformationRule(
        source_name=pattern.get("source_name"),
        data_type=pattern.get("data_type"),
        field=field,
        rule_type=rule_type,
        condition={"value": original},
        transformation={"to": corrected},
        created_from="pattern",
        times_applied=0,
        times_overridden=0,
        is_active=is_active,
    )
    db.add(rule)
    await db.flush()

    # Mark the source corrections as rule_created=True
    await db.execute(
        update(DataCorrection)
        .where(
            DataCorrection.field == field,
            DataCorrection.original_value == original,
            DataCorrection.corrected_value == corrected,
            DataCorrection.rule_created == False,  # noqa: E712
        )
        .values(rule_created=True)
    )

    status = "ACTIVE" if is_active else "PENDING APPROVAL"
    logger.info(
        "Created transformation rule [%s]: %s %r -> %r (%d occurrences, %s)",
        rule_type, field, original, corrected, count, status,
    )

    # Cross-loop event: notify other learning loops
    try:
        from app.services.learning_events import publish_event
        await publish_event(db, "rule_auto_created", {
            "field": field,
            "rule_type": rule_type,
            "original": original,
            "corrected": corrected,
            "count": count,
            "is_active": is_active,
        })
    except Exception:
        pass  # non-fatal

    return rule


# ---------------------------------------------------------------------------
# 4. Apply learned rules to a batch of rows
# ---------------------------------------------------------------------------

async def apply_learned_rules(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    source_name: str | None = None,
    data_type: str | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Apply all active TransformationRules to a batch of data rows.

    Rules are matched by:
        - field name (required)
        - source_name (if rule specifies one, it must match; None = universal)
        - data_type (if rule specifies one, it must match; None = universal)

    Args:
        db: Async database session.
        rows: List of row dicts to transform.
        source_name: The source/filename being processed.
        data_type: The data type (claims, roster, etc.).

    Returns:
        (transformed_rows, applied_rules_log)
        where applied_rules_log is a list of dicts documenting each transformation.
    """
    if not rows:
        return rows, []

    # Load all active rules (filtered by source/data_type compatibility)
    stmt = select(TransformationRule).where(TransformationRule.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    all_rules = result.scalars().all()

    if not all_rules:
        return rows, []

    # Index rules by field for fast lookup
    rules_by_field: dict[str, list[TransformationRule]] = defaultdict(list)
    for rule in all_rules:
        # Filter: rule's source_name/data_type must match or be universal (None)
        if rule.source_name and rule.source_name != source_name:
            continue
        if rule.data_type and rule.data_type != data_type:
            continue
        rules_by_field[rule.field].append(rule)

    if not rules_by_field:
        return rows, []

    applied_log: list[dict[str, Any]] = []
    rule_apply_counts: dict[int, int] = defaultdict(int)

    for row in rows:
        for field, rules in rules_by_field.items():
            if field not in row:
                continue

            current_value = row[field]
            if current_value is None:
                continue

            current_str = str(current_value).strip()

            for rule in rules:
                condition = rule.condition or {}
                transformation = rule.transformation or {}

                matched = False

                if rule.rule_type == "value_map":
                    # Exact value match
                    if condition.get("value") is not None and str(condition["value"]) == current_str:
                        matched = True

                elif rule.rule_type == "format_convert":
                    # Pattern-based match
                    pattern = condition.get("pattern")
                    if pattern:
                        try:
                            if re.match(pattern, current_str):
                                matched = True
                        except re.error:
                            pass
                    elif condition.get("value") is not None and str(condition["value"]) == current_str:
                        matched = True

                elif rule.rule_type in ("code_correction", "default_fill", "regex_transform"):
                    # Exact value match for code corrections / default fill
                    if condition.get("value") is not None and str(condition["value"]) == current_str:
                        matched = True

                if matched:
                    new_value = transformation.get("to", current_str)
                    if new_value != current_str:
                        applied_log.append({
                            "rule_id": rule.id,
                            "field": field,
                            "original": current_str,
                            "transformed": new_value,
                            "rule_type": rule.rule_type,
                        })
                        row[field] = new_value
                        rule_apply_counts[rule.id] = rule_apply_counts.get(rule.id, 0) + 1
                        break  # first matching rule wins per field

    # Bulk-update times_applied counters
    for rule_id, apply_count in rule_apply_counts.items():
        await db.execute(
            update(TransformationRule)
            .where(TransformationRule.id == rule_id)
            .values(times_applied=TransformationRule.times_applied + apply_count)
        )

    if applied_log:
        logger.info(
            "Applied %d learned transformations across %d rules to %d rows",
            len(applied_log), len(rule_apply_counts), len(rows),
        )

    return rows, applied_log
