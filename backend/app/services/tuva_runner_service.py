"""
Tuva Runner Service — executes dbt commands against DuckDB.

Wraps dbt CLI to run Tuva transformations after data export.

Multi-tenancy: each run accepts a ``tenant_schema`` and plumbs it through to
dbt via the ``DBT_DUCKDB_PATH`` environment variable. The root
``profiles.yml`` reads that env var, so a per-tenant run writes to
``data/tuva_<tenant>.duckdb`` while the default (no tenant) falls back to
the shared ``data/tuva_warehouse.duckdb`` for backward compat.
"""

import logging
import os
import subprocess
from typing import Any

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
_DBT_PROJECT_DIR = os.path.join(_PROJECT_ROOT, "dbt_project")
_DATA_DIR = os.path.join(_PROJECT_ROOT, "data")


def _resolve_duckdb_path(tenant_schema: str | None) -> str:
    """Return the absolute DuckDB file path for the given tenant.

    ``None`` and ``"platform"`` both route to the shared warehouse so that
    legacy single-DB workflows keep working.
    """
    if not tenant_schema or tenant_schema == "platform":
        return os.path.join(_DATA_DIR, "tuva_warehouse.duckdb")
    return os.path.join(_DATA_DIR, f"tuva_{tenant_schema}.duckdb")


class TuvaRunnerService:
    """Runs dbt/Tuva transformations."""

    def __init__(self, project_dir: str | None = None):
        self.project_dir = project_dir or _DBT_PROJECT_DIR

    def _build_command(self, verb: str, select: str | None = None) -> list[str]:
        """Build the dbt CLI command."""
        cmd = [
            "dbt", verb,
            "--project-dir", self.project_dir,
            "--profiles-dir", self.project_dir,
        ]
        if select:
            cmd.extend(["--select", select])
        return cmd

    def run_seeds(self, tenant_schema: str | None = None) -> dict[str, Any]:
        """Run dbt seed to load Tuva terminology tables."""
        return self._execute("seed", tenant_schema=tenant_schema)

    def run_all(self, tenant_schema: str | None = None) -> dict[str, Any]:
        """Run full dbt build (seed + run + test)."""
        return self._execute("build", tenant_schema=tenant_schema)

    def run_mart(self, mart_name: str, tenant_schema: str | None = None) -> dict[str, Any]:
        """Run a specific Tuva data mart (e.g., 'cms_hcc', 'quality_measures')."""
        return self._execute("run", select=mart_name, tenant_schema=tenant_schema)

    def run_models(self, tenant_schema: str | None = None) -> dict[str, Any]:
        """Run dbt run (models only, no seeds or tests)."""
        return self._execute("run", tenant_schema=tenant_schema)

    def compile_project(self, tenant_schema: str | None = None) -> dict[str, Any]:
        """Compile dbt project without executing."""
        return self._execute("compile", tenant_schema=tenant_schema)

    def _execute(
        self,
        verb: str,
        select: str | None = None,
        tenant_schema: str | None = None,
    ) -> dict[str, Any]:
        """Execute a dbt command and return results.

        Sets ``DBT_DUCKDB_PATH`` for the subprocess so ``profiles.yml``
        routes the build to the caller's tenant-scoped DuckDB file.
        Returns ``duckdb_path`` alongside stdout/stderr so the caller can
        verify the tenant isolation end-to-end.
        """
        cmd = self._build_command(verb, select)
        duckdb_path = _resolve_duckdb_path(tenant_schema)

        env = os.environ.copy()
        env["DBT_DUCKDB_PATH"] = duckdb_path

        logger.info(
            "Running dbt: %s (tenant=%s, duckdb=%s)",
            " ".join(cmd), tenant_schema or "platform", duckdb_path,
        )

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.project_dir,
                env=env,
                timeout=600,  # 10 minute timeout
            )
            success = result.returncode == 0
            if not success:
                logger.error("dbt %s failed:\n%s", verb, result.stderr or result.stdout)
            else:
                logger.info("dbt %s completed successfully", verb)

            return {
                "success": success,
                "command": " ".join(cmd),
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
                "tenant_schema": tenant_schema or "platform",
                "duckdb_path": duckdb_path,
            }
        except subprocess.TimeoutExpired:
            logger.error("dbt %s timed out after 600s", verb)
            return {
                "success": False,
                "command": " ".join(cmd),
                "error": "timeout",
                "tenant_schema": tenant_schema or "platform",
                "duckdb_path": duckdb_path,
            }
        except FileNotFoundError:
            logger.error("dbt command not found — is dbt installed?")
            return {
                "success": False,
                "command": " ".join(cmd),
                "error": "dbt not found",
                "tenant_schema": tenant_schema or "platform",
                "duckdb_path": duckdb_path,
            }
