"""
Tuva Runner Service — executes dbt commands against DuckDB.

Wraps dbt CLI to run Tuva transformations after data export.
"""

import logging
import os
import subprocess
from typing import Any

logger = logging.getLogger(__name__)

_DBT_PROJECT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "dbt_project"
)


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

    def run_seeds(self) -> dict[str, Any]:
        """Run dbt seed to load Tuva terminology tables."""
        return self._execute("seed")

    def run_all(self) -> dict[str, Any]:
        """Run full dbt build (seed + run + test)."""
        return self._execute("build")

    def run_mart(self, mart_name: str) -> dict[str, Any]:
        """Run a specific Tuva data mart (e.g., 'cms_hcc', 'quality_measures')."""
        return self._execute("run", select=mart_name)

    def run_models(self) -> dict[str, Any]:
        """Run dbt run (models only, no seeds or tests)."""
        return self._execute("run")

    def compile_project(self) -> dict[str, Any]:
        """Compile dbt project without executing."""
        return self._execute("compile")

    def _execute(self, verb: str, select: str | None = None) -> dict[str, Any]:
        """Execute a dbt command and return results."""
        cmd = self._build_command(verb, select)
        logger.info("Running dbt: %s", " ".join(cmd))

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.project_dir,
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
            }
        except subprocess.TimeoutExpired:
            logger.error("dbt %s timed out after 600s", verb)
            return {
                "success": False,
                "command": " ".join(cmd),
                "error": "timeout",
            }
        except FileNotFoundError:
            logger.error("dbt command not found — is dbt installed?")
            return {
                "success": False,
                "command": " ".join(cmd),
                "error": "dbt not found",
            }
