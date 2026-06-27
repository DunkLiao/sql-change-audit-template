import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from backend.server import app


REPO = Path(__file__).resolve().parent.parent
DEMO_DB = REPO / "tests" / "fixtures" / "demo.db"


def _remote_audit_body(db_path: Path, **overrides):
    body = {
        "db": {"driver": "sqlite3", "dsn": str(db_path), "db_schema": "main"},
        "config": {
            "tables": {
                "baselineTable": "tmp_baseline",
                "sampleTable": "tmp_sample",
                "compareTable": "tmp_compare",
                "sourceTable": "lgd_calc_result",
                "oldView": "v_lgd_calc_old",
                "newView": "v_lgd_calc_new",
                "numericTol": "0.01",
            },
            "pkColumns": ["cust_id", "ss_seq"],
            "bizColumns": [
                {"name": "industry_group", "type": "text"},
                {"name": "lgd_value", "type": "numeric"},
                {"name": "k_value", "type": "numeric"},
                {"name": "ead_amt", "type": "numeric"},
                {"name": "rwa_amt", "type": "numeric"},
            ],
            "branchColumn": "case_branch",
            "filters": [
                {"name": "exception", "condition": "substr(industry_type,3,2) IN ('08','09')", "limit": 10},
                {"name": "boundary", "condition": "ead_amt IN (0, 1, 999999)", "limit": 10},
                {"name": "normal", "condition": "substr(industry_type,3,2) NOT IN ('08','09')", "limit": 10},
                {"name": "null", "condition": "industry_type IS NULL", "limit": 5},
            ],
            "aggregateMetrics": [
                {"metric": "CNT", "expression": "COUNT(*)", "maxAbsDiff": 0, "maxPctDiff": None},
                {"metric": "SUM_AMT", "expression": "SUM(ead_amt)", "maxAbsDiff": None, "maxPctDiff": 0.001},
                {"metric": "SUM_WEIGHTED", "expression": "SUM(rwa_amt)", "maxAbsDiff": None, "maxPctDiff": 0.01},
                {"metric": "AVG_RATIO", "expression": "AVG(lgd_value)", "maxAbsDiff": 0.001, "maxPctDiff": None},
                {"metric": "GROUP_CNT", "expression": "COUNT(DISTINCT industry_group)", "maxAbsDiff": 0, "maxPctDiff": None},
            ],
            "groupColumn": "industry_group",
        },
        "before_sql": "v_lgd_calc_old",
        "after_sql": "v_lgd_calc_new",
        "sql_dir": "../templates/sqlite",
    }
    body.update(overrides)
    return body


def test_backend_app_serves_ui_static_assets_when_imported():
    client = TestClient(app)

    assert client.get("/").status_code == 200
    js = client.get("/js/app.js")
    css = client.get("/css/style.css")

    assert js.status_code == 200
    assert "const App" in js.text
    assert css.status_code == 200
    assert ".app-shell" in css.text


def test_run_audit_rejects_missing_config_with_400(tmp_path):
    db_path = tmp_path / "demo.db"
    shutil.copy(DEMO_DB, db_path)
    client = TestClient(app)

    resp = client.post(
        "/api/run-audit",
        json={
            "db": {"driver": "sqlite3", "dsn": str(db_path)},
            "config": {},
            "before_sql": "v_lgd_calc_old",
            "after_sql": "v_lgd_calc_new",
        },
    )

    assert resp.status_code == 400
    assert "缺少必要設定" in resp.json()["detail"]


def test_run_audit_rejects_non_sqlite_dynamic_audit(tmp_path):
    db_path = tmp_path / "demo.db"
    shutil.copy(DEMO_DB, db_path)
    body = _remote_audit_body(db_path)
    body["db"]["driver"] = "oracledb"
    client = TestClient(app)

    resp = client.post("/api/run-audit", json=body)

    assert resp.status_code == 400
    assert "目前僅支援 sqlite3" in resp.json()["detail"]


def test_run_audit_returns_real_step6_group_diff(tmp_path):
    db_path = tmp_path / "demo.db"
    shutil.copy(DEMO_DB, db_path)
    conn = __import__("sqlite3").connect(db_path)
    conn.execute("UPDATE v_lgd_calc_new SET industry_group = 'ChangedGroup' WHERE cust_id = 'C1000'")
    conn.commit()
    conn.close()

    client = TestClient(app)
    body = _remote_audit_body(db_path)
    body["config"]["filters"] = [{"name": "changed", "condition": "cust_id = 'C1000'", "limit": 1}]
    resp = client.post("/api/run-audit", json=body)

    assert resp.status_code == 200
    data = resp.json()
    assert data["step6"]["pass"] is False
    assert data["step6"]["diffCount"] == 1
    assert data["step6"]["columns"] == ["OLD_GROUP", "NEW_GROUP", "CHANGED_CNT"]
    assert data["step6"]["rows"][0] == ["A", "ChangedGroup", 1]


def test_run_audit_marks_step6_skipped_without_group_column(tmp_path):
    db_path = tmp_path / "demo.db"
    shutil.copy(DEMO_DB, db_path)
    body = _remote_audit_body(db_path)
    body["config"]["groupColumn"] = ""
    client = TestClient(app)

    resp = client.post("/api/run-audit", json=body)

    assert resp.status_code == 200
    data = resp.json()
    assert data["step6"]["pass"] is True
    assert data["step6"]["skipped"] is True
    assert data["step6"]["diffCount"] == 0
