"""Tests for the Tuva dbt runner service."""

import pytest
from app.services.tuva_runner_service import TuvaRunnerService


def test_build_dbt_command_run():
    """Verify the dbt run command is constructed correctly."""
    service = TuvaRunnerService(project_dir="/fake/path")
    cmd = service._build_command("run")
    assert cmd == ["dbt", "run", "--project-dir", "/fake/path"]


def test_build_dbt_command_with_select():
    """Verify dbt command with --select flag."""
    service = TuvaRunnerService(project_dir="/fake/path")
    cmd = service._build_command("run", select="cms_hcc")
    assert cmd == ["dbt", "run", "--project-dir", "/fake/path", "--select", "cms_hcc"]


def test_build_dbt_command_seed():
    """Verify the dbt seed command."""
    service = TuvaRunnerService(project_dir="/fake/path")
    cmd = service._build_command("seed")
    assert cmd == ["dbt", "seed", "--project-dir", "/fake/path"]


def test_build_dbt_command_build():
    """Verify the dbt build command."""
    service = TuvaRunnerService(project_dir="/fake/path")
    cmd = service._build_command("build")
    assert cmd == ["dbt", "build", "--project-dir", "/fake/path"]
