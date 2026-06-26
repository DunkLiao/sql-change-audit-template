"""單元測試：load_config"""
import os
import pytest
from pathlib import Path
from audit_runner import load_config, TolItem


FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.mark.unit
def test_load_basic_config():
    cfg = load_config(str(FIXTURE_DIR / "sample_config.yaml"))
    assert cfg.db.driver == "sqlite3"
    assert cfg.placeholders["PK_COL_1"] == "cust_id"
    assert len(cfg.tolerances) == 2
    assert isinstance(cfg.tolerances[0], TolItem)
    assert cfg.tolerances[0].metric == "CNT"


@pytest.mark.unit
def test_env_var_substitution(monkeypatch, tmp_path):
    monkeypatch.setenv("MY_PASSWORD", "secret123")
    p = tmp_path / "c.yaml"
    p.write_text("""db:
  driver: oracledb
  password: ${ENV:MY_PASSWORD}
placeholders: {}
tolerances: []
""")
    cfg = load_config(str(p))
    assert cfg.db.password == "secret123"


@pytest.mark.unit
def test_env_var_not_exist_becomes_empty(monkeypatch, tmp_path):
    monkeypatch.delenv("NOT_EXIST_VAR", raising=False)
    p = tmp_path / "c.yaml"
    p.write_text("""db:
  driver: oracledb
  password: ${ENV:NOT_EXIST_VAR}
placeholders: {}
tolerances: []
""")
    cfg = load_config(str(p))
    assert cfg.db.password == ""


@pytest.mark.unit
def test_placeholders_coerced_to_str(tmp_path):
    p = tmp_path / "c.yaml"
    p.write_text("""db: {driver: sqlite3}
placeholders:
  NUM_VAL: 42
  STR_VAL: hello
tolerances: []
""")
    cfg = load_config(str(p))
    assert cfg.placeholders["NUM_VAL"] == "42"
    assert isinstance(cfg.placeholders["NUM_VAL"], str)


@pytest.mark.unit
def test_tolerances_parsed():
    cfg = load_config(str(FIXTURE_DIR / "sample_config.yaml"))
    cnt_tol = next(t for t in cfg.tolerances if t.metric == "CNT")
    assert cnt_tol.max_abs_diff == 0
    sum_tol = next(t for t in cfg.tolerances if t.metric == "SUM_AMT")
    assert sum_tol.max_pct_diff == 0.001
