import subprocess
import sys
import shutil
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "audit_runner.py"
CONFIG = REPO / "config" / "audit_config_sqlite.yaml"
DEMO_DB = REPO / "tests" / "fixtures" / "demo.db"


def test_cli_accepts_repo_relative_config_path_from_repo_root():
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "-c",
            "config/audit_config_sqlite.yaml",
            "--dry-run",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
    )

    assert result.returncode == 0
    assert "Config not found" not in result.stdout
    assert "FINAL: PASS" in result.stdout


def test_cli_runs_sqlite_workflow_with_config_relative_dsn(tmp_path):
    db_dir = tmp_path / "db"
    config_dir = tmp_path / "config"
    db_dir.mkdir()
    config_dir.mkdir()
    db_path = db_dir / "demo.db"
    shutil.copy(DEMO_DB, db_path)

    cfg_text = CONFIG.read_text(encoding="utf-8")
    cfg_text = cfg_text.replace("../tests/fixtures/demo.db", "../db/demo.db")
    cfg_text = cfg_text.replace("../reports", str(tmp_path / "reports"))
    cfg_path = config_dir / "audit_config_sqlite.yaml"
    cfg_path.write_text(cfg_text, encoding="utf-8")

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "-c", str(cfg_path)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )

    assert result.returncode == 0
    assert "FINAL: PASS" in result.stdout
