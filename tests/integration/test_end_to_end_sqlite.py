"""整合測試：用 SQLite demo.db 跑完整 audit 流程"""
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path
import pytest

REPO = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO / "scripts" / "audit_runner.py"
CONFIG = REPO / "config" / "audit_config_sqlite.yaml"
DEMO_DB = REPO / "tests" / "fixtures" / "demo.db"


def _prepare_baseline_and_sample(db_path):
    """在跑 audit_runner 之前，先用 sqlite3 把 Step 1/2/3 跑掉。"""
    sys.path.insert(0, str(REPO / "scripts"))
    from audit_runner import render_sql, load_config

    cfg = load_config(str(CONFIG))
    sql_dir = REPO / "templates" / "sqlite"
    placeholders = cfg.placeholders

    conn = sqlite3.connect(str(db_path))
    for step in ["01_baseline_snapshot.sql",
                 "02_golden_sample.sql",
                 "03_dual_run.sql"]:
        sql = render_sql(str(sql_dir / step), placeholders)
        conn.executescript(sql)
    conn.commit()
    conn.close()


@pytest.mark.integration
def test_end_to_end_sqlite_pass(tmp_path):
    """完整流程：新舊資料一致 → 應該 PASS（exit 0）"""
    test_db = tmp_path / "demo.db"
    shutil.copy(DEMO_DB, test_db)

    cfg_text = CONFIG.read_text(encoding="utf-8")
    new_cfg = tmp_path / "cfg.yaml"
    new_cfg.write_text(
        cfg_text.replace("../tests/fixtures/demo.db", str(test_db)),
        encoding="utf-8",
    )

    _prepare_baseline_and_sample(test_db)

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "-c", str(new_cfg)],
        capture_output=True, text=True, cwd=str(REPO / "scripts")
    )
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    assert result.returncode == 0, f"Expected PASS but got exit {result.returncode}"
    assert "FINAL: PASS" in result.stdout
