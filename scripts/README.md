# audit_runner.py

支援 driver: oracledb / cx_Oracle / pyodbc / sqlite3

## 使用
```bash
python scripts/audit_runner.py --dry-run
python scripts/audit_runner.py -c config/audit_config.yaml         # Oracle
python scripts/audit_runner.py -c config/audit_config_sqlite.yaml  # SQLite
```

## Exit codes
- 0: PASS
- 1: FAIL（差異超出容忍度）
- 2: 設定錯誤 / 連線失敗

## CI 整合範例（GitHub Actions）
```yaml
- run: pip install -r scripts/requirements.txt
- run: python scripts/audit_runner.py -c config/audit_config.yaml
  env:
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: audit-report
    path: reports/
```
