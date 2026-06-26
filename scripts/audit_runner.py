#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SQL 改版自動驗收腳本 (Audit Runner)

支援 driver (按優先順序): oracledb, cx_Oracle, pyodbc, sqlite3
Exit code: 0=PASS / 1=FAIL / 2=Config or Connection error
"""
from __future__ import annotations
import argparse, logging, os, re, sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("[ERROR] need pyyaml", file=sys.stderr); sys.exit(2)

try:
    from tabulate import tabulate
except ImportError:
    def tabulate(rows, headers=(), tablefmt="github"):
        out = [" | ".join(map(str, headers)), "-" * 40]
        for r in rows: out.append(" | ".join(map(str, r)))
        return "\n".join(out)

# Driver fallback
_DB_DRIVER = None
_DB_DRIVER_NAME = None
for mod_name in ("oracledb", "cx_Oracle", "pyodbc", "sqlite3"):
    try:
        _DB_DRIVER = __import__(mod_name)
        _DB_DRIVER_NAME = mod_name
        break
    except ImportError:
        continue


@dataclass
class DBConfig:
    driver: str = "oracledb"
    user: str = ""
    password: str = ""
    dsn: str = ""
    schema: str = ""


@dataclass
class TolItem:
    metric: str
    max_abs_diff: Optional[float] = None
    max_pct_diff: Optional[float] = None


@dataclass
class AuditConfig:
    db: DBConfig = field(default_factory=DBConfig)
    placeholders: Dict[str, str] = field(default_factory=dict)
    tolerances: List[TolItem] = field(default_factory=list)
    sql_dir: str = "../templates"
    report_dir: str = "../reports"


def setup_logger(verbose: bool) -> logging.Logger:
    logger = logging.getLogger("audit")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    if not logger.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)-7s %(message)s", datefmt="%H:%M:%S"))
        logger.addHandler(h)
    return logger


_ENV_PAT = re.compile(r"\$\{ENV:([A-Z0-9_]+)\}")

def _resolve_env(value: Any) -> Any:
    if isinstance(value, str):
        return _ENV_PAT.sub(lambda m: os.environ.get(m.group(1), ""), value)
    if isinstance(value, dict):
        return {k: _resolve_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_env(v) for v in value]
    return value


def load_config(path: str) -> AuditConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    raw = _resolve_env(raw)
    db = DBConfig(**raw.get("db", {}))
    tolerances = [TolItem(**t) for t in raw.get("tolerances", [])]
    return AuditConfig(
        db=db,
        placeholders={k: str(v) for k, v in raw.get("placeholders", {}).items()},
        tolerances=tolerances,
        sql_dir=raw.get("sql_dir", "../templates"),
        report_dir=raw.get("report_dir", "../reports"),
    )


_PH_PAT = re.compile(r"\{\{\s*([A-Z0-9_]+)\s*\}\}")

def render_sql(sql_path: str, placeholders: Dict[str, str]) -> str:
    with open(sql_path, "r", encoding="utf-8") as f:
        text = f.read()
    missing = set()
    def repl(m):
        key = m.group(1)
        if key not in placeholders:
            missing.add(key)
            return m.group(0)
        return placeholders[key]
    rendered = _PH_PAT.sub(repl, text)
    if missing:
        raise ValueError(f"設定檔缺少下列 placeholder：{sorted(missing)}")
    return rendered


def connect_db(cfg: DBConfig):
    global _DB_DRIVER, _DB_DRIVER_NAME
    if cfg.driver and cfg.driver != _DB_DRIVER_NAME:
        try:
            _DB_DRIVER = __import__(cfg.driver)
            _DB_DRIVER_NAME = cfg.driver
        except ImportError:
            raise RuntimeError(f"指定 driver '{cfg.driver}' 未安裝")

    if _DB_DRIVER is None:
        raise RuntimeError("沒有可用的 DB driver")

    if _DB_DRIVER_NAME in ("oracledb", "cx_Oracle"):
        return _DB_DRIVER.connect(user=cfg.user, password=cfg.password, dsn=cfg.dsn)
    if _DB_DRIVER_NAME == "pyodbc":
        return _DB_DRIVER.connect(cfg.dsn)
    if _DB_DRIVER_NAME == "sqlite3":
        return _DB_DRIVER.connect(cfg.dsn or ":memory:")
    raise RuntimeError(f"不支援的 driver: {_DB_DRIVER_NAME}")


def query_sql(conn, sql: str) -> Tuple[List[str], List[tuple]]:
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in (cur.description or [])]
    rows = cur.fetchall()
    cur.close()
    return cols, rows


def run_step4(conn, sql_dir: Path, placeholders, logger, dry_run, verbose):
    logger.info("Step 4: Diff Report")
    sql = render_sql(str(sql_dir / "04_diff_report.sql"), placeholders)
    if verbose: logger.debug("Rendered SQL:\n" + sql)
    if dry_run:
        logger.warning("[DRY-RUN] simulated 0 rows")
        return True, 0, ([], [])
    cols, rows = query_sql(conn, sql)
    return len(rows) == 0, len(rows), (cols, rows[:10])


def run_step5(conn, sql_dir: Path, placeholders, tolerances, logger, dry_run, verbose):
    logger.info("Step 5: Aggregate Check")
    sql = render_sql(str(sql_dir / "05_aggregate_check.sql"), placeholders)
    if verbose: logger.debug("Rendered SQL:\n" + sql)
    if dry_run:
        cols = ["METRIC", "OLD_VAL", "NEW_VAL", "DIFF", "DIFF_PCT"]
        rows = [
            ("CNT", 1000.0, 1000.0, 0.0, 0.0),
            ("SUM_AMT", 1.2e9, 1.2e9, 50.0, 0.0000041),
            ("SUM_WEIGHTED", 8.5e8, 8.500087e8, 73950.0, 0.0086),
            ("AVG_RATIO", 0.4512, 0.4519, 0.0007, None),
            ("GROUP_CNT", 24.0, 24.0, 0.0, 0.0),
        ]
        logger.warning("[DRY-RUN] using simulated data")
    else:
        cols, rows = query_sql(conn, sql)

    tol_map = {t.metric: t for t in tolerances}
    results = []
    overall = True
    for row in rows:
        rec = dict(zip(cols, row))
        metric = str(rec.get("METRIC", "")).upper()
        diff = rec.get("DIFF")
        diff_pct = rec.get("DIFF_PCT")
        status, reason = _judge(metric, diff, diff_pct, tol_map.get(metric))
        if status != "PASS": overall = False
        results.append({"metric": metric, "old": rec.get("OLD_VAL"), "new": rec.get("NEW_VAL"),
                        "diff": diff, "diff_pct": diff_pct, "status": status, "reason": reason})
    return overall, results


def _judge(metric, diff, diff_pct, tol):
    if tol is None:
        return "SKIP", "未設定容忍度"
    try:
        d = float(diff) if diff is not None else 0.0
    except (TypeError, ValueError):
        d = 0.0
    if tol.max_abs_diff is not None and abs(d) > tol.max_abs_diff:
        return "FAIL", f"|DIFF|={abs(d):g} > {tol.max_abs_diff:g}"
    if tol.max_pct_diff is not None:
        try:
            p = float(diff_pct) if diff_pct is not None else 0.0
        except (TypeError, ValueError):
            p = 0.0
        if abs(p) > tol.max_pct_diff:
            return "FAIL", f"|DIFF_PCT|={abs(p):g}% > {tol.max_pct_diff:g}%"
    return "PASS", "在容忍度內"


def write_report(report_dir: Path, cfg, step4, step5, logger):
    report_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    p = report_dir / f"audit_report_{ts}.md"
    s4_pass, s4_cnt, _ = step4
    s5_pass, s5_results = step5
    overall = s4_pass and s5_pass
    lines = [f"# SQL Audit Report ({ts})", "",
             f"## Result: **{'PASS' if overall else 'FAIL'}**", "",
             f"- Step 4 Diff Rows: {s4_cnt}", "", "## Step 5", ""]
    table = [[r["metric"], r["old"], r["new"], r["diff"], r["diff_pct"], r["status"], r["reason"]]
             for r in s5_results]
    lines.append(tabulate(table, headers=["METRIC","OLD","NEW","DIFF","DIFF_PCT","STATUS","REASON"]))
    lines.append("")
    p.write_text("\n".join(lines), encoding="utf-8")
    logger.info(f"Report: {p}")
    return p


def print_summary(step4, step5, logger):
    s4_pass, s4_cnt, _ = step4
    s5_pass, s5_results = step5
    logger.info("=" * 60)
    logger.info(f"Step 4: {'PASS' if s4_pass else 'FAIL'}  diff_rows={s4_cnt}")
    for r in s5_results:
        logger.info(f"  [{r['status']:4}] {r['metric']:14} DIFF={r['diff']} -> {r['reason']}")
    logger.info(f"FINAL: {'PASS' if s4_pass and s5_pass else 'FAIL'}")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", "-c", default="../config/audit_config.yaml")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logger = setup_logger(args.verbose)
    script_dir = Path(__file__).resolve().parent
    cp = (script_dir / args.config).resolve() if not os.path.isabs(args.config) else Path(args.config)
    if not cp.exists():
        logger.error(f"Config not found: {cp}"); sys.exit(2)
    cfg = load_config(str(cp))
    sql_dir = (script_dir / cfg.sql_dir).resolve()
    report_dir = (script_dir / cfg.report_dir).resolve()
    logger.info(f"Config: {cp}")
    logger.info(f"SQL dir: {sql_dir}")
    logger.info(f"Report dir: {report_dir}")

    conn = None
    if not args.dry_run:
        try:
            conn = connect_db(cfg.db)
        except Exception as e:
            logger.error(f"Connection failed: {e}"); sys.exit(2)
        logger.info(f"Connected via {_DB_DRIVER_NAME}")
    else:
        logger.warning("DRY-RUN mode")

    try:
        step4 = run_step4(conn, sql_dir, cfg.placeholders, logger, args.dry_run, args.verbose)
        step5 = run_step5(conn, sql_dir, cfg.placeholders, cfg.tolerances, logger, args.dry_run, args.verbose)
    finally:
        if conn:
            try: conn.close()
            except Exception: pass

    print_summary(step4, step5, logger)
    write_report(report_dir, cfg, step4, step5, logger)
    sys.exit(0 if (step4[0] and step5[0]) else 1)


if __name__ == "__main__":
    main()
