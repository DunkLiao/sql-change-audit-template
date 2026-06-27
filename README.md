# SQL Change Audit Template

SQL Change Audit Template 是一套用來驗證 SQL 改寫結果的審計樣板。它的目標不是只確認 SQL 能執行，而是確認改寫前後的逐列結果、彙總指標與分組變化都符合預期。

適合用在 AI 協作改 SQL、資料庫邏輯重構、Oracle 到 SQLite 本機驗證、以及需要留下審計報告的改版流程。

## 功能概覽

- CLI 審計流程：用 `scripts/audit_runner.py` 讀取 YAML 設定、渲染 SQL 樣板、執行檢查並輸出 Markdown 報告。
- SQLite 本機驗證：內建 `tests/fixtures/demo.db` 與 `config/audit_config_sqlite.yaml`，可直接跑完整流程。
- Oracle 樣板：`templates/` 提供 Oracle 風格 SQL 樣板，正式環境可用 `config/audit_config.yaml` 串接。
- Web 工作台：`ui/` 提供靜態前端，可在瀏覽器內用 sql.js 跑 SQLite，也可透過 `backend/server.py` 呼叫 FastAPI。
- 自動測試：pytest 覆蓋設定載入、SQL 渲染、容忍度判斷、CLI、後端 API 與 UI 結構。

## 專案結構

```text
backend/              FastAPI API 與可選的 UI 靜態檔服務
config/               Oracle / SQLite 審計設定檔
docs/                 流程說明與檢查清單
examples/             差異報告範例
prompts/              AI 協作提示詞範本
reports/              審計報告輸出位置，僅保留 .gitkeep
scripts/              CLI 審計工具與 shell 範例
templates/            Oracle SQL 樣板
templates/sqlite/     SQLite SQL 樣板
tests/                pytest 單元與整合測試
ui/                   靜態 HTML/CSS/JavaScript 工作台
```

## 快速開始

建議使用 Python 3.10+。

```bash
pip install -r scripts/requirements.txt
pytest -v
python scripts/audit_runner.py --dry-run
python scripts/audit_runner.py -c config/audit_config_sqlite.yaml
```

SQLite 指令會讀取 `config/audit_config_sqlite.yaml`，連到內建 demo database，執行 Step 1-3 準備表，再執行 Step 4/5 檢查並輸出報告到 `reports/`。

## CLI 使用方式

Dry-run 不連資料庫，只驗證設定與流程可跑：

```bash
python scripts/audit_runner.py --dry-run
```

執行 SQLite demo：

```bash
python scripts/audit_runner.py -c config/audit_config_sqlite.yaml
```

執行 Oracle 設定前，先提供密碼環境變數：

```bash
export DB_PASSWORD="your-password"
python scripts/audit_runner.py -c config/audit_config.yaml
```

Windows PowerShell 可用：

```powershell
$env:DB_PASSWORD = "your-password"
python scripts\audit_runner.py -c config\audit_config.yaml
```

Exit code：

- `0`：審計通過
- `1`：有差異超出容忍度
- `2`：設定錯誤或資料庫連線失敗

## Web 工作台

### 只使用前端

在 `ui/` 目錄啟動靜態伺服器：

```bash
cd ui
python server.py 8080
```

瀏覽器開啟 `http://localhost:8080`。這個模式可用瀏覽器內 SQLite，不需要後端。

### 使用 FastAPI 後端

安裝後端依賴：

```bash
pip install -r backend/requirements.txt
```

啟動 API 與 UI：

```bash
python backend/server.py
```

預設網址：

- UI：`http://localhost:8000`
- API health check：`http://localhost:8000/api/health`

目前後端 `/api/run-audit` 的動態審計流程支援 `sqlite3`。Oracle/ODBC 可以用來做連線測試；正式 Oracle 審計請使用 CLI 與 SQL 樣板流程。

## 審計流程

```text
Step 1  凍結舊版結果成 baseline
Step 2  建立黃金樣本
Step 3  雙軌執行新舊 SQL
Step 4  逐列差異比對
Step 5  彙總指標容忍度判斷
Step 6  分組差異檢查，Web/API 模式支援
```

CLI 目前輸出 Step 4/5 的報告；Web/API 模式會回傳 Step 4/5/6 結果。

## 設定檔重點

`config/audit_config_sqlite.yaml` 是可直接執行的本機範例。主要區塊：

- `db`：driver、dsn、schema 等連線資訊
- `sql_dir`：SQL 樣板目錄
- `report_dir`：報告輸出目錄
- `placeholders`：SQL 樣板替換值
- `tolerances`：各彙總指標的容忍度

敏感資訊請使用環境變數，例如：

```yaml
db:
  password: ${ENV:DB_PASSWORD}
```

不要把資料庫密碼、正式資料、產生報告或本機虛擬環境提交到 Git。

## 測試與驗證

完整測試：

```bash
pytest -v
```

只跑單元或整合測試：

```bash
pytest -v -m unit
pytest -v -m integration
```

前端 JavaScript 語法檢查：

```bash
node --check ui/js/app.js
node --check ui/js/pipeline.js
node --check ui/js/templates.js
```

Python 語法檢查：

```bash
python -m py_compile backend/server.py scripts/audit_runner.py
```

## 報告輸出

CLI 會在 `reports/` 產生 `audit_report_YYYYMMDD_HHMMSS.md`。這些報告是執行產物，預設被 `.gitignore` 排除，只保留 `reports/.gitkeep` 讓資料夾存在。

## 授權

MIT
