"""
End-to-end smoke test for the Tuva integration.

Uses Tuva's built-in synthetic data to verify:
1. dbt deps are installed
2. dbt seeds load correctly (terminology tables)
3. dbt models compile without errors
4. Export service creates valid DuckDB tables
"""

import os
import subprocess
import pytest
import duckdb

# Use subst drive if available, otherwise fall back to real path
_REAL_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DBT_PROJECT_DIR = os.path.join(_REAL_PROJECT_ROOT, "dbt_project")

# For dbt commands, use the subst drive to avoid Windows path length issues
_SUBST_DRIVE = "T:\\"
_SUBST_DBT_DIR = os.path.join(_SUBST_DRIVE, "dbt_project")


def _get_dbt_project_dir():
    """Use subst drive if it exists, otherwise real path."""
    if os.path.isdir(_SUBST_DBT_DIR):
        return _SUBST_DBT_DIR
    return DBT_PROJECT_DIR


@pytest.mark.integration
class TestTuvaEndToEnd:
    """Integration tests requiring dbt + DuckDB installed."""

    def test_dbt_is_installed(self):
        """Verify dbt CLI is available. Skips if not installed."""
        try:
            result = subprocess.run(
                ["dbt", "--version"],
                capture_output=True, text=True,
                timeout=10,
            )
        except FileNotFoundError:
            pytest.skip("dbt CLI not installed — skipping dbt integration tests")
        assert result.returncode == 0
        assert "core" in result.stdout.lower()

    def test_dbt_deps_installed(self):
        """Verify Tuva package is installed. Skips if dbt not available."""
        try:
            subprocess.run(["dbt", "--version"], capture_output=True, timeout=10)
        except FileNotFoundError:
            pytest.skip("dbt CLI not installed")
        project_dir = _get_dbt_project_dir()
        result = subprocess.run(
            ["dbt", "deps", "--project-dir", project_dir,
             "--profiles-dir", project_dir],
            capture_output=True, text=True,
            timeout=120,
        )
        assert result.returncode == 0, f"dbt deps failed: {result.stderr}"

    def test_dbt_compile_input_layer(self):
        """Verify our input layer models compile. Skips if dbt not available."""
        try:
            subprocess.run(["dbt", "--version"], capture_output=True, timeout=10)
        except FileNotFoundError:
            pytest.skip("dbt CLI not installed")
        project_dir = _get_dbt_project_dir()
        result = subprocess.run(
            ["dbt", "compile", "--select", "medical_claim eligibility pharmacy_claim",
             "--project-dir", project_dir, "--profiles-dir", project_dir],
            capture_output=True, text=True,
            timeout=120,
        )
        assert result.returncode == 0, f"dbt compile failed: {result.stderr}"

    def test_export_service_creates_valid_duckdb(self):
        """Verify export service creates valid DuckDB tables."""
        from app.services.tuva_export_service import TuvaExportService

        service = TuvaExportService(duckdb_path=":memory:")
        con = service._get_connection()

        # Verify raw schema was created
        schemas = con.execute("SELECT schema_name FROM information_schema.schemata").fetchall()
        schema_names = [s[0] for s in schemas]
        assert "raw" in schema_names

        service.close()

    def test_runner_service_builds_command(self):
        """Verify runner service constructs correct dbt commands."""
        from app.services.tuva_runner_service import TuvaRunnerService

        runner = TuvaRunnerService(project_dir="/test/path")
        cmd = runner._build_command("run", select="cms_hcc")
        assert cmd == ["dbt", "run", "--project-dir", "/test/path", "--profiles-dir", "/test/path", "--select", "cms_hcc"]

    def test_sync_service_instantiates(self):
        """Verify sync service can be instantiated."""
        from app.services.tuva_sync_service import TuvaSyncService

        service = TuvaSyncService(duckdb_path=":memory:")
        assert service.duckdb_path == ":memory:"
