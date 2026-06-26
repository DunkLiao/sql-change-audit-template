# SQL Change Audit Template

一套**萬用的 SQL 改版驗收樣板** + **自動驗收腳本** + **單元測試** + **多方言支援**，
專為 AI 協作 (vibe coding) 場景設計，避免 AI 改 SQL 時悄悄改壞邏輯沒人發現。

> **AI 改完不是「跑得過」就算數，必須證明「結果跟舊版一致」或「差異都能解釋」。**

## 五步驟驗收流程

```
① 凍結舊版 → ② 黃金樣本 → ③ 雙跑輸出 → ④ 差異比對 → ⑤ 差異歸因
```

## Quick start

```bash
pip install -r scripts/requirements.txt

# Dry-run（不連 DB，先測流程）
python scripts/audit_runner.py --dry-run

# 單元 + 整合測試（內含 SQLite demo.db）
pytest -v

# Oracle 正式驗收
export DB_PASSWORD='xxx'
python scripts/audit_runner.py -c config/audit_config.yaml

# SQLite 驗收
python scripts/audit_runner.py -c config/audit_config_sqlite.yaml
```

## 結構
```
templates/         Oracle SQL 樣板 (預設)
templates/sqlite/  SQLite 方言版本
scripts/           audit_runner.py 自動驗收
config/            設定檔（Oracle / SQLite 兩種）
tests/             pytest 單元 + 整合測試
docs/ examples/    流程與範本
reports/           報告輸出
```

## 三大特色

| 特色 | 說明 |
|---|---|
| 多方言支援 | 預設 Oracle，內附 SQLite 版本，可自行擴充 PostgreSQL / MS SQL |
| 自動驗收 | 一行指令跑完 Step 4+5，自動產報告，exit code 接 CI |
| 單元測試 | pytest 覆蓋核心函式，改腳本不擔心壞掉 |

## 授權
MIT
