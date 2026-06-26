# 測試

```bash
pip install pytest pyyaml
pytest -v                          # 全部
pytest -v -m unit                  # 僅單元測試
pytest -v -m integration           # 僅整合測試 (用 demo.db)
pytest tests/test_render_sql.py    # 單一檔案
```

## 結構
- `test_render_sql.py` — 測試 placeholder 替換
- `test_judge.py` — 測試容忍度判斷
- `test_load_config.py` — 測試 YAML 載入與環境變數替換
- `integration/test_end_to_end_sqlite.py` — 完整跑一次 SQLite 流程
