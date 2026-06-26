#!/usr/bin/env python3
"""SQL 變更審計工具 - 後端伺服器（動態設定版）

啟動:
    cd backend && pip install fastapi uvicorn pyyaml pydantic
    python server.py
"""

from __future__ import annotations

import argparse, json, logging, sys, tempfile
from pathlib import Path
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("請安裝: pip install fastapi uvicorn pyyaml pydantic")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
from audit_runner import DBConfig, TolItem, connect_db, render_sql, run_step4, run_step5

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("audit-api")

app = FastAPI(title="SQL 變更審計 API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
UI_DIR = Path(__file__).resolve().parent.parent / "ui"


class DBConnectionRequest(BaseModel):
    model_config = {"extra": "allow"}
    driver: str = "sqlite3"
    user: str = ""
    password: str = ""
    dsn: str = ":memory:"
    db_schema: str = ""


class AuditRunRequest(BaseModel):
    db: DBConnectionRequest = DBConnectionRequest()
    config: dict = {}
    before_sql: str = ""
    after_sql: str = ""
    sql_dir: str = "../templates/sqlite"


# ---- Dynamic SQL builders (mirrors ui/js/templates.js) ----

def _all_columns(pk, biz, branch):
    cols = list(pk)
    for c in biz:
        if c.get("name"):
            cols.append(c["name"])
    if branch:
        cols.append(branch)
    return cols


def _build_step1(config):
    t = config["tables"]
    cols = _all_columns(config.get("pkColumns", []), config.get("bizColumns", []), config.get("branchColumn", ""))
    if not cols:
        raise ValueError("至少需要一個欄位")
    return [
        f"DROP TABLE IF EXISTS {t['baselineTable']}",
        f"CREATE TABLE {t['baselineTable']} AS SELECT {', '.join(cols)} FROM {t['oldView']}"
    ]


def _build_step2(config):
    t = config["tables"]
    pk = [c for c in config.get("pkColumns", []) if c]
    if not pk:
        raise ValueError("至少需要一個主鍵欄位")
    stmts = [
        f"DROP TABLE IF EXISTS {t['sampleTable']}",
        f"CREATE TABLE {t['sampleTable']} AS SELECT 'DEFAULT' AS SAMPLE_TYPE, {', '.join(pk)} FROM {t['sourceTable']} t WHERE 0"
    ]
    for f in config.get("filters", []):
        if not f.get("condition"):
            continue
        cols = ", ".join(f"t.{c}" for c in pk)
        stmts.append(f"INSERT INTO {t['sampleTable']} SELECT '{f['name']}', {cols} FROM {t['sourceTable']} t WHERE {f['condition']} LIMIT {f.get('limit', 10)}")
    return stmts


def _build_step3(config):
    t = config["tables"]
    pk = [c for c in config.get("pkColumns", []) if c]
    if not pk:
        raise ValueError("至少需要一個主鍵欄位")

    parts = ["s.SAMPLE_TYPE"]
    for c in pk:
        parts.append(f"COALESCE(o.{c}, n.{c}) AS {c}")
    for c in config.get("bizColumns", []):
        if c.get("name"):
            parts.append(f"o.{c['name']} AS OLD_{c['name']}")
            parts.append(f"n.{c['name']} AS NEW_{c['name']}")
    bc = config.get("branchColumn", "")
    if bc:
        parts.append(f"o.{bc} AS OLD_{bc}")
        parts.append(f"n.{bc} AS NEW_{bc}")

    join_old = " AND ".join(f"o.{c} = s.{c}" for c in pk)
    join_new = " AND ".join(f"n.{c} = s.{c}" for c in pk)

    return [
        f"DROP TABLE IF EXISTS {t['compareTable']}",
        f"CREATE TABLE {t['compareTable']} AS SELECT {', '.join(parts)} FROM {t['sampleTable']} s LEFT JOIN {t['baselineTable']} o ON {join_old} LEFT JOIN {t['newView']} n ON {join_new}"
    ]


def _build_step4(config):
    t = config["tables"]
    pk = [c for c in config.get("pkColumns", []) if c]
    conds = []
    for c in config.get("bizColumns", []):
        if not c.get("name"):
            continue
        n = c["name"]
        if c.get("type") in ("text", "string"):
            conds.append(f"COALESCE(CAST(OLD_{n} AS TEXT),'#') <> COALESCE(CAST(NEW_{n} AS TEXT),'#')")
        else:
            conds.append(f"ABS(COALESCE(OLD_{n},0) - COALESCE(NEW_{n},0)) > {t.get('numericTol','0.01')}")
    bc = config.get("branchColumn", "")
    if bc:
        conds.append(f"COALESCE(OLD_{bc},'#') <> COALESCE(NEW_{bc},'#')")
    if not conds:
        return "SELECT 'N/A' WHERE 0"
    return f"SELECT SAMPLE_TYPE, {', '.join(pk)} FROM {t['compareTable']} WHERE {' OR '.join(conds)}"


def _build_step5(config):
    t = config["tables"]
    metrics = [m for m in config.get("aggregateMetrics", []) if m.get("metric") and m.get("expression")]
    if not metrics:
        raise ValueError("至少需要一個彙總指標")

    old_exprs = [f"{m['expression']} AS M{i}" for i, m in enumerate(metrics)]
    new_exprs = [f"{m['expression']} AS M{i}" for i, m in enumerate(metrics)]

    unions = []
    for i, m in enumerate(metrics):
        alias = f"M{i}"
        unions.append(f"SELECT '{m['metric']}' AS METRIC, o.{alias} AS OLD_VAL, n.{alias} AS NEW_VAL, n.{alias}-o.{alias} AS DIFF, ROUND((n.{alias}-o.{alias})*100.0/NULLIF(o.{alias},0),6) AS DIFF_PCT FROM old_stats o, new_stats n")

    return f"WITH old_stats AS (SELECT {', '.join(old_exprs)} FROM {t['baselineTable']}), new_stats AS (SELECT {', '.join(new_exprs)} FROM {t['newView']}) {' UNION ALL '.join(unions)}"


# ---- DB helpers ----
def _db_execute(conn, sql: str, ignore_missing: bool = False):
    cur = conn.cursor()
    try:
        cur.execute(sql)
    except Exception:
        if ignore_missing:
            try: conn.rollback()
            except Exception: pass
            cur.close()
            return
        raise
    conn.commit()
    cur.close()


def _db_execute_batch(conn, stmts: list[str]):
    for s in stmts:
        if not s.strip():
            continue
        _db_execute(conn, s, ignore_missing=s.strip().upper().startswith("DROP"))


# ---- API ----
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/test-connection")
def test_connection(req: DBConnectionRequest):
    try:
        cfg = DBConfig(driver=req.driver, user=req.user, password=req.password, dsn=req.dsn, schema=req.db_schema)
        conn = connect_db(cfg)
        conn.close()
        return {"connected": True, "driver": req.driver}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"連線失敗：{e}")


@app.post("/api/run-audit")
def run_audit(req: AuditRunRequest):
    config = req.config
    driver = req.db.driver
    tables = config.get("tables", {})

    # 從使用者 SQL 推導 View 名稱
    if req.before_sql:
        upper = req.before_sql.strip().upper()
        if not (upper.startswith("SELECT") or upper.startswith("CREATE")):
            tables["oldView"] = req.before_sql.strip()
        else:
            tables["oldView"] = "v_audit_old"
    if req.after_sql:
        upper = req.after_sql.strip().upper()
        if not (upper.startswith("SELECT") or upper.startswith("CREATE")):
            tables["newView"] = req.after_sql.strip()
        else:
            tables["newView"] = "v_audit_new"

    try:
        db_cfg = DBConfig(driver=req.db.driver, user=req.db.user, password=req.db.password, dsn=req.db.dsn, schema=req.db.db_schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"設定錯誤：{e}")

    conn = None
    try:
        conn = connect_db(db_cfg)
        logger.info(f"已連線：{driver}")

        # 套用使用者 SQL 為 View
        old_label = tables.get("oldView", "v_audit_old")
        new_label = tables.get("newView", "v_audit_new")

        if req.before_sql:
            upper = req.before_sql.strip().upper()
            if upper.startswith("SELECT"):
                view_sql = f"CREATE OR REPLACE VIEW {old_label} AS {req.before_sql}" if driver not in ("sqlite3",) else f"CREATE VIEW IF NOT EXISTS {old_label} AS {req.before_sql}"
            elif upper.startswith("CREATE"):
                view_sql = req.before_sql
            else:
                view_sql = ""
            if view_sql:
                _db_execute(conn, f"DROP VIEW IF EXISTS {old_label}", ignore_missing=True)
                _db_execute(conn, view_sql)

        if req.after_sql:
            upper = req.after_sql.strip().upper()
            if upper.startswith("SELECT"):
                view_sql = f"CREATE OR REPLACE VIEW {new_label} AS {req.after_sql}" if driver not in ("sqlite3",) else f"CREATE VIEW IF NOT EXISTS {new_label} AS {req.after_sql}"
            elif upper.startswith("CREATE"):
                view_sql = req.after_sql
            else:
                view_sql = ""
            if view_sql:
                _db_execute(conn, f"DROP VIEW IF EXISTS {new_label}", ignore_missing=True)
                _db_execute(conn, view_sql)

        # 強制更新 config 中的 view 名稱
        config["tables"]["oldView"] = old_label
        config["tables"]["newView"] = new_label

        # Step 1-3
        _db_execute_batch(conn, _build_step1(config))
        _db_execute_batch(conn, _build_step2(config))
        _db_execute_batch(conn, _build_step3(config))

        # Step 4
        sql4 = _build_step4(config)
        cur = conn.cursor()
        cur.execute(sql4)
        s4_cols = [d[0] for d in (cur.description or [])]
        s4_rows = cur.fetchall()
        cur.close()
        s4_pass = len(s4_rows) == 0

        # Step 5
        sql5 = _build_step5(config)
        cur = conn.cursor()
        cur.execute(sql5)
        s5_cols = [d[0] for d in (cur.description or [])]
        s5_rows = cur.fetchall()
        cur.close()

        # Build tolerances
        tolerances = []
        for m in config.get("aggregateMetrics", []):
            if m.get("metric"):
                tol = {"metric": m["metric"]}
                if m.get("maxAbsDiff") is not None:
                    tol["max_abs_diff"] = m["maxAbsDiff"]
                if m.get("maxPctDiff") is not None:
                    tol["max_pct_diff"] = m["maxPctDiff"]
                tolerances.append(TolItem(**tol))

        # Judge
        from audit_runner import _judge
        tol_map = {t.metric.upper(): t for t in tolerances}
        judged = []
        s5_pass = True
        for row in s5_rows:
            rec = dict(zip(s5_cols, row))
            metric = str(rec.get("METRIC", "")).upper()
            diff = rec.get("DIFF")
            diff_pct = rec.get("DIFF_PCT")
            tol = tol_map.get(metric)
            status, reason = _judge(metric, diff, diff_pct, tol)
            if status != "PASS":
                s5_pass = False
            judged.append({"metric": metric, "oldVal": rec.get("OLD_VAL"), "newVal": rec.get("NEW_VAL"), "diff": diff, "diffPct": diff_pct, "status": status, "reason": reason})

        overall = s4_pass and s5_pass

        return {
            "overall": overall,
            "step4": {"pass": s4_pass, "diffCount": len(s4_rows), "columns": s4_cols, "rows": [list(r) for r in s4_rows[:50]]},
            "step5": {"pass": s5_pass, "judged": judged},
            "step6": {"pass": True, "diffCount": 0}
        }
    except Exception as e:
        logger.error(f"審計錯誤：{e}")
        raise HTTPException(status_code=500, detail=f"審計執行錯誤：{e}")
    finally:
        if conn:
            try: conn.close()
            except Exception: pass


@app.get("/")
def serve_index():
    path = UI_DIR / "index.html"
    return FileResponse(str(path)) if path.exists() else {"message": "UI 不存在"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", "-p", type=int, default=8000)
    p.add_argument("--no-ui", action="store_true")
    args = p.parse_args()
    if not args.no_ui and (UI_DIR / "index.html").exists():
        app.mount("/js", StaticFiles(directory=str(UI_DIR / "js")), name="js")
        app.mount("/css", StaticFiles(directory=str(UI_DIR / "css")), name="css")
        print(f"UI: http://localhost:{args.port}")
    print(f"API: http://localhost:{args.port}")
    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info")

if __name__ == "__main__":
    main()
