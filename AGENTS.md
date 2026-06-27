# Repository Guidelines

## Project Structure & Module Organization

This repository provides a SQL change-audit template for validating whether SQL rewrites preserve expected results. Core automation lives in `scripts/audit_runner.py`; supporting shell usage is in `scripts/run_audit.sh` and `scripts/README.md`. SQL templates are under `templates/` for Oracle-style defaults and `templates/sqlite/` for SQLite examples. Runtime configuration belongs in `config/`, with `audit_config.yaml` for Oracle and `audit_config_sqlite.yaml` for local SQLite validation. Test assets and pytest suites are in `tests/`, including `tests/fixtures/demo.db` and integration coverage in `tests/integration/`. Documentation and examples are in `docs/`, `examples/`, and `prompts/`. The optional web experience is split between `backend/` for FastAPI server code and `ui/` for static HTML/CSS/JavaScript.

## Build, Test, and Development Commands

Use Python 3.10+ unless a deployment target requires otherwise.

```bash
pip install -r scripts/requirements.txt
python scripts/audit_runner.py --dry-run
pytest -v
pytest -v -m unit
pytest -v -m integration
python scripts/audit_runner.py -c config/audit_config_sqlite.yaml
```

`--dry-run` validates the workflow without connecting to a database. The SQLite config runs an end-to-end local audit. For Oracle runs, set `DB_PASSWORD` in the environment before using `config/audit_config.yaml`.

## Coding Style & Naming Conventions

Keep Python code PEP 8 compatible with 4-space indentation, clear function names, and small helpers that are easy to unit test. Test files must follow the configured `test_*.py` pattern from `pytest.ini`. SQL template filenames should keep the numeric workflow prefix, such as `01_baseline_snapshot.sql`, so audit steps remain ordered. Prefer explicit YAML keys and environment-variable placeholders over hard-coded secrets.

## Testing Guidelines

Add or update pytest coverage when changing `scripts/audit_runner.py`, YAML rendering, tolerance judging, or SQL-template behavior. Unit tests belong directly under `tests/`; full workflow tests belong in `tests/integration/` and should use fixtures rather than external services. Run `pytest -v` before handing off changes, and run the SQLite audit command when template or config behavior changes.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits, for example `feat:`, `fix:`, and `chore:`. Keep commits focused and describe the user-visible behavior changed. Pull requests should include a concise summary, test commands run, affected database dialects, and any report or UI screenshots when relevant. Never commit database passwords, generated report contents, local virtual environments, caches, or `__pycache__/` files.
