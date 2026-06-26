"""單元測試：render_sql"""
import pytest
from pathlib import Path
from audit_runner import render_sql


@pytest.mark.unit
def test_basic_replace(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("SELECT * FROM {{TBL}} WHERE id = {{ID}};")
    out = render_sql(str(p), {"TBL": "users", "ID": "42"})
    assert "SELECT * FROM users WHERE id = 42;" == out


@pytest.mark.unit
def test_missing_placeholder_raises(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("SELECT {{A}}, {{B}}")
    with pytest.raises(ValueError) as e:
        render_sql(str(p), {"A": "1"})
    assert "B" in str(e.value)


@pytest.mark.unit
def test_multiple_occurrences(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("{{T}} JOIN {{T}} ON {{T}}.id = {{T}}.x")
    out = render_sql(str(p), {"T": "orders"})
    assert out.count("orders") == 4
    assert "{{" not in out


@pytest.mark.unit
def test_whitespace_in_placeholder(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("SELECT {{ COL }}, {{  COL2  }} FROM t")
    out = render_sql(str(p), {"COL": "name", "COL2": "age"})
    assert "name" in out and "age" in out


@pytest.mark.unit
def test_no_placeholder(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("SELECT 1 FROM dual;")
    out = render_sql(str(p), {})
    assert out == "SELECT 1 FROM dual;"


@pytest.mark.unit
def test_multiple_missing_reported(tmp_path):
    p = tmp_path / "x.sql"
    p.write_text("{{A}} {{B}} {{C}}")
    with pytest.raises(ValueError) as e:
        render_sql(str(p), {})
    msg = str(e.value)
    assert "A" in msg and "B" in msg and "C" in msg
