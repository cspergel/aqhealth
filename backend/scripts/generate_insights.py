"""
Generate AI-powered insights from seeded data using Claude API.

Connects to the database, pulls data from all modules, builds a context graph,
calls Claude to generate 8-10 cross-module insights, and stores them in the
insights table.

Usage:
    cd backend
    python -m scripts.generate_insights
"""

import json
import os
import re
import sys
from decimal import Decimal

import anthropic
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not found in environment or .env file")
    sys.exit(1)

DATABASE_URL_SYNC = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)

# Strip driver prefix if present (psycopg2 uses plain postgresql://)
db_url = DATABASE_URL_SYNC
for prefix in ("postgresql+psycopg2://", "postgresql+asyncpg://"):
    if db_url.startswith(prefix):
        db_url = "postgresql://" + db_url[len(prefix):]
        break

SCHEMA = "demo_mso"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def fetch_all(cur, query):
    """Execute query and return list of dicts."""
    cur.execute(query)
    cols = [desc[0] for desc in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

def collect_data(conn):
    """Pull summary data from all modules."""
    cur = conn.cursor()

    data = {}

    # --- Members ---
    cur.execute("SELECT COUNT(*) FROM members")
    data["total_members"] = cur.fetchone()[0]

    cur.execute("SELECT AVG(current_raf) FROM members WHERE current_raf IS NOT NULL")
    data["avg_raf"] = round(float(cur.fetchone()[0] or 0), 3)

    cur.execute("SELECT AVG(projected_raf) FROM members WHERE projected_raf IS NOT NULL")
    data["avg_projected_raf"] = round(float(cur.fetchone()[0] or 0), 3)

    cur.execute("""
        SELECT risk_tier, COUNT(*) as cnt
        FROM members
        WHERE risk_tier IS NOT NULL
        GROUP BY risk_tier
        ORDER BY cnt DESC
    """)
    data["risk_tier_distribution"] = {row[0]: row[1] for row in cur.fetchall()}

    # --- HCC Suspects ---
    cur.execute("SELECT COUNT(*) FROM hcc_suspects")
    data["total_suspects"] = cur.fetchone()[0]

    cur.execute("""
        SELECT status, COUNT(*) as cnt
        FROM hcc_suspects
        GROUP BY status
        ORDER BY cnt DESC
    """)
    data["suspect_status_distribution"] = {row[0]: row[1] for row in cur.fetchall()}

    cur.execute("""
        SELECT hcc_label, COUNT(*) as cnt,
               ROUND(AVG(annual_value)::numeric, 2) as avg_value,
               ROUND(SUM(annual_value)::numeric, 2) as total_value
        FROM hcc_suspects
        WHERE status = 'open'
        GROUP BY hcc_label
        ORDER BY total_value DESC NULLS LAST
        LIMIT 10
    """)
    cols = [desc[0] for desc in cur.description]
    data["top_suspect_categories"] = [dict(zip(cols, row)) for row in cur.fetchall()]

    # Recapture rate
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'captured') as captured,
            COUNT(*) as total
        FROM hcc_suspects
        WHERE suspect_type = 'recapture'
    """)
    row = cur.fetchone()
    if row and row[1] > 0:
        data["recapture_rate"] = round(row[0] / row[1] * 100, 1)
    else:
        data["recapture_rate"] = 0.0

    # Total open suspect value
    cur.execute("SELECT COALESCE(SUM(annual_value), 0) FROM hcc_suspects WHERE status = 'open'")
    data["total_open_suspect_value"] = float(cur.fetchone()[0])

    # --- Claims / Expenditure ---
    cur.execute("SELECT COUNT(*) FROM claims")
    data["total_claims"] = cur.fetchone()[0]

    cur.execute("""
        SELECT service_category,
               COUNT(*) as claim_count,
               ROUND(SUM(paid_amount)::numeric, 2) as total_paid,
               ROUND(AVG(paid_amount)::numeric, 2) as avg_paid
        FROM claims
        WHERE service_category IS NOT NULL AND paid_amount IS NOT NULL
        GROUP BY service_category
        ORDER BY total_paid DESC NULLS LAST
    """)
    cols = [desc[0] for desc in cur.description]
    data["expenditure_by_category"] = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute("SELECT COALESCE(SUM(paid_amount), 0) FROM claims WHERE paid_amount IS NOT NULL")
    data["total_expenditure"] = float(cur.fetchone()[0])

    # PMPM
    if data["total_members"] > 0:
        data["pmpm"] = round(data["total_expenditure"] / data["total_members"] / 12, 2)
    else:
        data["pmpm"] = 0

    # --- Providers ---
    cur.execute("SELECT COUNT(*) FROM providers")
    data["total_providers"] = cur.fetchone()[0]

    cur.execute("""
        SELECT first_name || ' ' || last_name as provider_name,
               specialty, panel_size, capture_rate, recapture_rate,
               gap_closure_rate, panel_pmpm
        FROM providers
        WHERE capture_rate IS NOT NULL
        ORDER BY capture_rate DESC
        LIMIT 5
    """)
    cols = [desc[0] for desc in cur.description]
    data["top_providers_by_capture"] = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute("""
        SELECT first_name || ' ' || last_name as provider_name,
               specialty, panel_size, capture_rate, recapture_rate,
               gap_closure_rate, panel_pmpm
        FROM providers
        WHERE capture_rate IS NOT NULL
        ORDER BY capture_rate ASC
        LIMIT 5
    """)
    cols = [desc[0] for desc in cur.description]
    data["bottom_providers_by_capture"] = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute("""
        SELECT AVG(capture_rate), AVG(recapture_rate), AVG(gap_closure_rate), AVG(panel_pmpm)
        FROM providers
        WHERE capture_rate IS NOT NULL
    """)
    row = cur.fetchone()
    data["avg_provider_metrics"] = {
        "avg_capture_rate": float(row[0] or 0),
        "avg_recapture_rate": float(row[1] or 0),
        "avg_gap_closure_rate": float(row[2] or 0),
        "avg_panel_pmpm": float(row[3] or 0),
    }

    # --- Care Gaps ---
    cur.execute("""
        SELECT gm.code, gm.name,
               COUNT(*) as total_gaps,
               COUNT(*) FILTER (WHERE mg.status = 'closed') as closed,
               COUNT(*) FILTER (WHERE mg.status = 'open') as open_gaps,
               ROUND(
                   COUNT(*) FILTER (WHERE mg.status = 'closed')::numeric /
                   NULLIF(COUNT(*), 0) * 100, 1
               ) as closure_rate
        FROM member_gaps mg
        JOIN gap_measures gm ON gm.id = mg.measure_id
        GROUP BY gm.code, gm.name
        ORDER BY total_gaps DESC
    """)
    cols = [desc[0] for desc in cur.description]
    data["care_gap_summary"] = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute("""
        SELECT COUNT(*) FILTER (WHERE status = 'open') as open_gaps,
               COUNT(*) FILTER (WHERE status = 'closed') as closed_gaps,
               COUNT(*) as total_gaps
        FROM member_gaps
    """)
    row = cur.fetchone()
    data["care_gap_totals"] = {
        "open": row[0],
        "closed": row[1],
        "total": row[2],
        "overall_closure_rate": round(row[1] / max(row[2], 1) * 100, 1),
    }

    cur.close()
    return data


# ---------------------------------------------------------------------------
# Claude API call
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an AI analytics engine for a managed care MSO. Analyze the following population data and generate 8-10 actionable insights. Each insight must:
- Have a clear title
- Include a description with specific numbers from the data
- Estimate dollar impact where possible
- Recommend a specific action
- Be categorized as: revenue, cost, quality, provider, or cross_module
- Include a confidence score (0-100)

Return as JSON array: [{title, description, dollar_impact, recommended_action, category, confidence, surface_on: [list of pages where this should show]}]

IMPORTANT: Return ONLY the JSON array, no markdown fencing or extra text."""


def generate_insights(data):
    """Call Claude API to generate insights from the data context."""
    context = json.dumps(data, cls=DecimalEncoder, indent=2)

    client = anthropic.Anthropic(api_key=API_KEY)

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": f"Here is the population data for analysis:\n\n{context}",
            }
        ],
        system=SYSTEM_PROMPT,
    )

    # Extract the text content
    raw = message.content[0].text.strip()

    # Strip markdown code fencing if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]  # remove first line
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        elif "```" in raw:
            raw = raw[:raw.rfind("```")].strip()

    return json.loads(raw)


# ---------------------------------------------------------------------------
# Store insights
# ---------------------------------------------------------------------------

def _parse_dollar(value):
    """Extract a numeric dollar amount from various formats (int, float, string)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Extract first number from string like "$16,236 annually..."
        match = re.search(r'[\$]?\s*([\d,]+(?:\.\d+)?)', value)
        if match:
            return float(match.group(1).replace(',', ''))
    return None


def store_insights(conn, insights):
    """Replace existing insights with newly generated ones."""
    cur = conn.cursor()

    # Clear existing insights
    cur.execute("DELETE FROM insights")

    for ins in insights:
        cur.execute("""
            INSERT INTO insights (
                category, title, description, dollar_impact,
                recommended_action, confidence, status,
                surface_on, source_modules, created_at, updated_at
            ) VALUES (
                %(category)s, %(title)s, %(description)s, %(dollar_impact)s,
                %(recommended_action)s, %(confidence)s, 'active',
                %(surface_on)s, %(source_modules)s, NOW(), NOW()
            )
        """, {
            "category": ins.get("category", "cross_module"),
            "title": ins["title"],
            "description": ins["description"],
            "dollar_impact": _parse_dollar(ins.get("dollar_impact")),
            "recommended_action": ins.get("recommended_action"),
            "confidence": ins.get("confidence"),
            "surface_on": json.dumps(ins.get("surface_on", [])),
            "source_modules": json.dumps(ins.get("source_modules", [])) if ins.get("source_modules") else None,
        })

    conn.commit()
    cur.close()
    return len(insights)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("AQSoft Health Platform — AI Insight Generation")
    print("=" * 60)
    print()

    # Connect to database
    print(f"Connecting to database...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False

    # Set search path to tenant schema
    cur = conn.cursor()
    cur.execute(f"SET search_path TO {SCHEMA}, public")
    cur.close()

    print(f"Schema: {SCHEMA}")
    print()

    # Collect data from all modules
    print("Collecting data from all modules...")
    data = collect_data(conn)

    print(f"  Members:       {data['total_members']}")
    print(f"  Avg RAF:       {data['avg_raf']}")
    print(f"  Recapture %:   {data['recapture_rate']}%")
    print(f"  Suspects:      {data['total_suspects']} (${data['total_open_suspect_value']:,.0f} open value)")
    print(f"  Claims:        {data['total_claims']}")
    print(f"  Expenditure:   ${data['total_expenditure']:,.0f}")
    print(f"  PMPM:          ${data['pmpm']:,.2f}")
    print(f"  Providers:     {data['total_providers']}")
    print(f"  Care Gaps:     {data['care_gap_totals']['total']} ({data['care_gap_totals']['overall_closure_rate']}% closed)")
    print()

    # Call Claude API
    print("Calling Claude API to generate insights...")
    print()
    insights = generate_insights(data)
    print(f"Generated {len(insights)} insights")
    print()

    # Print insights
    for i, ins in enumerate(insights, 1):
        print(f"--- Insight {i} ---")
        print(f"  Title:      {ins['title']}")
        print(f"  Category:   {ins.get('category', 'N/A')}")
        print(f"  Confidence: {ins.get('confidence', 'N/A')}%")
        dollar = ins.get('dollar_impact')
        if dollar is not None:
            try:
                print(f"  $ Impact:   ${float(dollar):,.0f}")
            except (ValueError, TypeError):
                print(f"  $ Impact:   {dollar}")
        print(f"  Action:     {ins.get('recommended_action', 'N/A')}")
        print(f"  Surface on: {', '.join(ins.get('surface_on', []))}")
        print(f"  Description: {ins['description'][:200]}...")
        print()

    # Store in database
    print("Storing insights in database...")
    count = store_insights(conn, insights)
    print(f"Stored {count} insights (replaced any existing)")

    conn.close()
    print()
    print("Done!")


if __name__ == "__main__":
    main()
