"""Initial schema — platform tables + tenant table helper.

Revision ID: 001_initial
Revises: (none)
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, ARRAY

# revision identifiers
revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Enum types shared across tables
# ---------------------------------------------------------------------------

tenant_status_enum = sa.Enum("active", "onboarding", "suspended", name="tenantstatus", schema="platform")
user_role_enum = sa.Enum("superadmin", "mso_admin", "analyst", "provider", "auditor", name="userrole", schema="platform")

risk_tier_enum = sa.Enum("low", "rising", "high", "complex", name="risktier")
claim_type_enum = sa.Enum("professional", "institutional", "pharmacy", name="claimtype")
suspect_status_enum = sa.Enum("open", "captured", "dismissed", "expired", name="suspectstatus")
suspect_type_enum = sa.Enum(
    "med_dx_gap", "specificity", "recapture", "near_miss", "historical", "new_suspect",
    name="suspecttype",
)
gap_status_enum = sa.Enum("open", "closed", "excluded", name="gapstatus")
upload_status_enum = sa.Enum(
    "pending", "mapping", "validating", "processing", "completed", "failed",
    name="uploadstatus",
)
insight_category_enum = sa.Enum(
    "revenue", "cost", "quality", "provider", "trend", "cross_module",
    name="insightcategory",
)
insight_status_enum = sa.Enum("active", "dismissed", "bookmarked", "acted_on", name="insightstatus")


# ---------------------------------------------------------------------------
# Helper: create all tenant-scoped tables inside an arbitrary schema
# ---------------------------------------------------------------------------

def create_tenant_tables(schema_name: str) -> None:
    """Create every tenant-scoped table inside *schema_name*."""

    # --- members ---
    op.create_table(
        "members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("member_id", sa.String(50), index=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("date_of_birth", sa.Date, nullable=False),
        sa.Column("gender", sa.String(1), nullable=False),
        sa.Column("zip_code", sa.String(10), nullable=True),
        sa.Column("health_plan", sa.String(200), nullable=True),
        sa.Column("plan_product", sa.String(100), nullable=True),
        sa.Column("coverage_start", sa.Date, nullable=True),
        sa.Column("coverage_end", sa.Date, nullable=True),
        sa.Column("pcp_provider_id", sa.Integer, nullable=True),  # FK added after providers
        sa.Column("medicaid_status", sa.Boolean, server_default="false"),
        sa.Column("disability_status", sa.Boolean, server_default="false"),
        sa.Column("institutional", sa.Boolean, server_default="false"),
        sa.Column("current_raf", sa.Numeric(8, 3), nullable=True),
        sa.Column("projected_raf", sa.Numeric(8, 3), nullable=True),
        sa.Column("risk_tier", risk_tier_enum, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- practice_groups ---
    op.create_table(
        "practice_groups",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("client_code", sa.String(50), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("zip_code", sa.String(10), nullable=True),
        sa.Column("provider_count", sa.Integer, nullable=True),
        sa.Column("total_panel_size", sa.Integer, nullable=True),
        sa.Column("avg_capture_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("avg_recapture_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("avg_raf", sa.Numeric(8, 3), nullable=True),
        sa.Column("group_pmpm", sa.Numeric(10, 2), nullable=True),
        sa.Column("gap_closure_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("targets", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- providers ---
    op.create_table(
        "providers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("npi", sa.String(15), index=True, nullable=False),
        sa.Column("practice_group_id", sa.Integer, sa.ForeignKey(f"{schema_name}.practice_groups.id"), nullable=True, index=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("specialty", sa.String(100), nullable=True),
        sa.Column("practice_name", sa.String(200), nullable=True),
        sa.Column("tin", sa.String(15), nullable=True),
        sa.Column("panel_size", sa.Integer, nullable=True),
        sa.Column("capture_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("recapture_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("avg_panel_raf", sa.Numeric(8, 3), nullable=True),
        sa.Column("panel_pmpm", sa.Numeric(10, 2), nullable=True),
        sa.Column("gap_closure_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("targets", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # Now add the FK from members.pcp_provider_id -> providers.id
    op.create_foreign_key(
        f"fk_members_pcp_provider_{schema_name}",
        "members", "providers",
        ["pcp_provider_id"], ["id"],
        source_schema=schema_name, referent_schema=schema_name,
    )

    # --- adt_sources ---
    op.create_table(
        "adt_sources",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_sync", sa.DateTime(timezone=True), nullable=True),
        sa.Column("events_received", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- adt_events ---
    op.create_table(
        "adt_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("source_id", sa.Integer, sa.ForeignKey(f"{schema_name}.adt_sources.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_message_id", sa.String(200), nullable=True),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), nullable=True),
        sa.Column("patient_name", sa.String(200), nullable=True),
        sa.Column("patient_dob", sa.Date, nullable=True),
        sa.Column("patient_mrn", sa.String(50), nullable=True),
        sa.Column("external_member_id", sa.String(100), nullable=True),
        sa.Column("match_confidence", sa.Integer, nullable=True),
        sa.Column("patient_class", sa.String(50), nullable=True),
        sa.Column("admit_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discharge_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admit_source", sa.String(100), nullable=True),
        sa.Column("discharge_disposition", sa.String(100), nullable=True),
        sa.Column("diagnosis_codes", JSONB, nullable=True),
        sa.Column("facility_name", sa.String(200), nullable=True),
        sa.Column("facility_npi", sa.String(20), nullable=True),
        sa.Column("facility_type", sa.String(50), nullable=True),
        sa.Column("attending_provider", sa.String(200), nullable=True),
        sa.Column("attending_npi", sa.String(20), nullable=True),
        sa.Column("pcp_name", sa.String(200), nullable=True),
        sa.Column("pcp_npi", sa.String(20), nullable=True),
        sa.Column("plan_name", sa.String(200), nullable=True),
        sa.Column("plan_member_id", sa.String(100), nullable=True),
        sa.Column("is_processed", sa.Boolean, server_default="false"),
        sa.Column("alerts_sent", JSONB, nullable=True),
        sa.Column("estimated_total_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("estimated_daily_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("actual_claim_id", sa.Integer, nullable=True),
        sa.Column("estimation_accuracy", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- claims ---
    op.create_table(
        "claims",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), index=True, nullable=False),
        sa.Column("claim_id", sa.String(50), nullable=True),
        sa.Column("claim_type", claim_type_enum, index=True, nullable=False),
        sa.Column("service_date", sa.Date, index=True, nullable=False),
        sa.Column("paid_date", sa.Date, nullable=True),
        sa.Column("diagnosis_codes", ARRAY(sa.String(10)), nullable=True),
        sa.Column("procedure_code", sa.String(10), nullable=True),
        sa.Column("drg_code", sa.String(10), nullable=True),
        sa.Column("ndc_code", sa.String(15), nullable=True),
        sa.Column("rendering_provider_id", sa.Integer, sa.ForeignKey(f"{schema_name}.providers.id"), nullable=True),
        sa.Column("facility_name", sa.String(200), nullable=True),
        sa.Column("facility_npi", sa.String(15), nullable=True),
        sa.Column("billed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("allowed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("member_liability", sa.Numeric(12, 2), nullable=True),
        sa.Column("service_category", sa.String(50), nullable=True, index=True),
        sa.Column("pos_code", sa.String(5), nullable=True),
        sa.Column("drug_name", sa.String(200), nullable=True),
        sa.Column("drug_class", sa.String(100), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=True),
        sa.Column("days_supply", sa.Integer, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("data_tier", sa.String(10), server_default="record"),
        sa.Column("is_estimated", sa.Boolean, server_default="false"),
        sa.Column("estimated_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("signal_source", sa.String(50), nullable=True),
        sa.Column("signal_event_id", sa.Integer, sa.ForeignKey(f"{schema_name}.adt_events.id"), nullable=True),
        sa.Column("reconciled", sa.Boolean, server_default="false"),
        sa.Column("reconciled_claim_id", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- hcc_suspects ---
    op.create_table(
        "hcc_suspects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), index=True, nullable=False),
        sa.Column("payment_year", sa.Integer, index=True, nullable=False),
        sa.Column("hcc_code", sa.Integer, nullable=False),
        sa.Column("hcc_label", sa.String(200), nullable=True),
        sa.Column("icd10_code", sa.String(10), nullable=True),
        sa.Column("icd10_label", sa.String(300), nullable=True),
        sa.Column("raf_value", sa.Numeric(8, 3), nullable=False),
        sa.Column("annual_value", sa.Numeric(10, 2), nullable=True),
        sa.Column("suspect_type", suspect_type_enum, nullable=False),
        sa.Column("status", suspect_status_enum, index=True, server_default="open"),
        sa.Column("confidence", sa.Integer, nullable=True),
        sa.Column("evidence_summary", sa.Text, nullable=True),
        sa.Column("source_claims", sa.Text, nullable=True),
        sa.Column("identified_date", sa.Date, nullable=False),
        sa.Column("captured_date", sa.Date, nullable=True),
        sa.Column("dismissed_date", sa.Date, nullable=True),
        sa.Column("dismissed_reason", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- raf_history ---
    op.create_table(
        "raf_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), index=True, nullable=False),
        sa.Column("calculation_date", sa.Date, nullable=False),
        sa.Column("payment_year", sa.Integer, nullable=False),
        sa.Column("demographic_raf", sa.Numeric(8, 3), nullable=False),
        sa.Column("disease_raf", sa.Numeric(8, 3), nullable=False),
        sa.Column("interaction_raf", sa.Numeric(8, 3), nullable=False),
        sa.Column("total_raf", sa.Numeric(8, 3), nullable=False),
        sa.Column("hcc_count", sa.Integer, server_default="0"),
        sa.Column("suspect_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- gap_measures ---
    op.create_table(
        "gap_measures",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(20), index=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("stars_weight", sa.Integer, server_default="1"),
        sa.Column("target_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("star_3_cutpoint", sa.Numeric(5, 2), nullable=True),
        sa.Column("star_4_cutpoint", sa.Numeric(5, 2), nullable=True),
        sa.Column("star_5_cutpoint", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_custom", sa.Boolean, server_default="false"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("detection_logic", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- member_gaps ---
    op.create_table(
        "member_gaps",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), index=True, nullable=False),
        sa.Column("measure_id", sa.Integer, sa.ForeignKey(f"{schema_name}.gap_measures.id"), index=True, nullable=False),
        sa.Column("status", gap_status_enum, index=True, server_default="open"),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("closed_date", sa.Date, nullable=True),
        sa.Column("measurement_year", sa.Integer, index=True, nullable=False),
        sa.Column("responsible_provider_id", sa.Integer, sa.ForeignKey(f"{schema_name}.providers.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- upload_jobs ---
    op.create_table(
        "upload_jobs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("detected_type", sa.String(50), nullable=True),
        sa.Column("status", upload_status_enum, server_default="pending"),
        sa.Column("column_mapping", JSONB, nullable=True),
        sa.Column("mapping_template_id", sa.Integer, nullable=True),
        sa.Column("total_rows", sa.Integer, nullable=True),
        sa.Column("processed_rows", sa.Integer, nullable=True),
        sa.Column("error_rows", sa.Integer, nullable=True),
        sa.Column("errors", JSONB, nullable=True),
        sa.Column("uploaded_by", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- mapping_templates ---
    op.create_table(
        "mapping_templates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("source_name", sa.String(200), nullable=True),
        sa.Column("data_type", sa.String(50), nullable=False),
        sa.Column("column_mapping", JSONB, nullable=False),
        sa.Column("transformation_rules", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- mapping_rules ---
    op.create_table(
        "mapping_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("source_name", sa.String(200), nullable=True),
        sa.Column("rule_type", sa.String(50), nullable=False),
        sa.Column("rule_config", JSONB, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- insights ---
    op.create_table(
        "insights",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("category", insight_category_enum, nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("dollar_impact", sa.Numeric(12, 2), nullable=True),
        sa.Column("recommended_action", sa.Text, nullable=True),
        sa.Column("confidence", sa.Integer, nullable=True),
        sa.Column("status", insight_status_enum, server_default="active"),
        sa.Column("affected_members", JSONB, nullable=True),
        sa.Column("affected_providers", JSONB, nullable=True),
        sa.Column("surface_on", JSONB, nullable=True),
        sa.Column("connections", JSONB, nullable=True),
        sa.Column("source_modules", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- prediction_outcomes ---
    op.create_table(
        "prediction_outcomes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("prediction_type", sa.String(50), nullable=False),
        sa.Column("prediction_id", sa.Integer, nullable=True),
        sa.Column("predicted_value", sa.Text, nullable=True),
        sa.Column("confidence", sa.Integer, nullable=True),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("actual_value", sa.Text, nullable=True),
        sa.Column("was_correct", sa.Boolean, nullable=True),
        sa.Column("context", JSONB, nullable=True),
        sa.Column("lesson_learned", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- learning_metrics ---
    op.create_table(
        "learning_metrics",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("metric_date", sa.Date, nullable=False),
        sa.Column("prediction_type", sa.String(50), nullable=False),
        sa.Column("total_predictions", sa.Integer, server_default="0"),
        sa.Column("confirmed", sa.Integer, server_default="0"),
        sa.Column("rejected", sa.Integer, server_default="0"),
        sa.Column("pending", sa.Integer, server_default="0"),
        sa.Column("accuracy_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("breakdown", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- user_interactions ---
    op.create_table(
        "user_interactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("interaction_type", sa.String(30), nullable=False),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("page_context", sa.String(200), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- care_alerts ---
    op.create_table(
        "care_alerts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("adt_event_id", sa.Integer, sa.ForeignKey(f"{schema_name}.adt_events.id"), nullable=False),
        sa.Column("member_id", sa.Integer, sa.ForeignKey(f"{schema_name}.members.id"), nullable=True),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("recommended_action", sa.Text, nullable=True),
        sa.Column("assigned_to", sa.Integer, nullable=True),
        sa.Column("status", sa.String(30), server_default="open"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- annotations ---
    op.create_table(
        "annotations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("note_type", sa.String(50), server_default="general"),
        sa.Column("author_id", sa.Integer, nullable=False),
        sa.Column("author_name", sa.String(200), nullable=False),
        sa.Column("requires_follow_up", sa.Boolean, server_default="false"),
        sa.Column("follow_up_date", sa.Date, nullable=True),
        sa.Column("follow_up_completed", sa.Boolean, server_default="false"),
        sa.Column("is_pinned", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- watchlist_items ---
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("entity_name", sa.String(300), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("watch_for", JSONB, nullable=True),
        sa.Column("last_snapshot", JSONB, nullable=True),
        sa.Column("changes_detected", JSONB, nullable=True),
        sa.Column("last_checked", sa.DateTime(timezone=True), nullable=True),
        sa.Column("has_changes", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- action_items ---
    op.create_table(
        "action_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("source_type", sa.String(50), nullable=True),
        sa.Column("source_id", sa.Integer, nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("assigned_to", sa.Integer, nullable=True),
        sa.Column("assigned_to_name", sa.String(200), nullable=True),
        sa.Column("priority", sa.String(20), server_default="medium"),
        sa.Column("status", sa.String(20), server_default="open"),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("completed_date", sa.Date, nullable=True),
        sa.Column("member_id", sa.Integer, nullable=True),
        sa.Column("provider_id", sa.Integer, nullable=True),
        sa.Column("group_id", sa.Integer, nullable=True),
        sa.Column("expected_impact", sa.String(500), nullable=True),
        sa.Column("actual_outcome", sa.String(500), nullable=True),
        sa.Column("outcome_measured", sa.Boolean, server_default="false"),
        sa.Column("resolution_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- report_templates ---
    op.create_table(
        "report_templates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("sections", JSONB, nullable=False),
        sa.Column("schedule", sa.String(50), nullable=True),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- generated_reports ---
    op.create_table(
        "generated_reports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("template_id", sa.Integer, sa.ForeignKey(f"{schema_name}.report_templates.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("period", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), server_default="generating"),
        sa.Column("content", JSONB, nullable=True),
        sa.Column("ai_narrative", sa.Text, nullable=True),
        sa.Column("generated_by", sa.Integer, nullable=False),
        sa.Column("file_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )

    # --- saved_filters ---
    op.create_table(
        "saved_filters",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("page_context", sa.String(50), nullable=False),
        sa.Column("conditions", JSONB, nullable=False),
        sa.Column("created_by", sa.Integer, nullable=False),
        sa.Column("is_shared", sa.Boolean, server_default="false"),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("use_count", sa.Integer, server_default="0"),
        sa.Column("last_used", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema=schema_name,
    )


def drop_tenant_tables(schema_name: str) -> None:
    """Drop all tenant-scoped tables (reverse order for FK deps)."""
    tables = [
        "saved_filters", "generated_reports", "report_templates",
        "action_items", "watchlist_items", "annotations",
        "care_alerts", "user_interactions", "learning_metrics", "prediction_outcomes",
        "insights", "mapping_rules", "mapping_templates", "upload_jobs",
        "member_gaps", "gap_measures", "raf_history", "hcc_suspects",
        "claims", "adt_events", "adt_sources",
        "providers", "practice_groups", "members",
    ]
    for t in tables:
        op.drop_table(t, schema=schema_name)


# ---------------------------------------------------------------------------
# Upgrade / Downgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # 1. Create the platform schema
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")

    # 2. Create platform-scoped enum types
    tenant_status_enum.create(op.get_bind(), checkfirst=True)
    user_role_enum.create(op.get_bind(), checkfirst=True)

    # 3. platform.tenants
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("schema_name", sa.String(63), unique=True, nullable=False),
        sa.Column("status", tenant_status_enum, server_default="onboarding"),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="platform",
    )

    # 4. platform.users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("platform.tenants.id"), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("mfa_secret", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="platform",
    )


def downgrade() -> None:
    op.drop_table("users", schema="platform")
    op.drop_table("tenants", schema="platform")
    user_role_enum.drop(op.get_bind(), checkfirst=True)
    tenant_status_enum.drop(op.get_bind(), checkfirst=True)
    op.execute("DROP SCHEMA IF EXISTS platform CASCADE")
