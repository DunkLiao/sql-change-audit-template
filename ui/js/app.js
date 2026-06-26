// 主應用程式控制器 – 動態欄位設定版
const App = {
  db: null,
  dbMode: "browser",
  backendUrl: "http://localhost:8000",
  remoteConnected: false,
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  runResult: null,
  oldSQL: "",
  newSQL: "",

  async init() {
    this.bindTabs();
    this.bindSetup();
    this.bindSQLInput();
    this.bindConfigTab();
    this.bindResults();
    this.renderConfigTab();
    this.showTab("setup");
    this.log("應用程式就緒，請先初始化資料庫。");
  },

  // ==== 頁籤 ====
  bindTabs() {
    document.querySelectorAll("nav.tabs button").forEach(function(btn) {
      btn.addEventListener("click", function() { App.showTab(btn.dataset.tab); });
    });
  },
  showTab(name) {
    document.querySelectorAll("nav.tabs button").forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function(t) { t.classList.remove("active"); });
    var tabBtn = document.querySelector("nav.tabs button[data-tab=\"" + name + "\"]");
    var tabPanel = document.getElementById("tab-" + name);
    if (tabBtn) tabBtn.classList.add("active");
    if (tabPanel) tabPanel.classList.add("active");
  },

  // ==== 通知 / 記錄 ====
  notify(msg, type) { type = type || "info";
    var el = document.createElement("div");
    el.className = "notification " + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 3000);
  },
  log(msg) {
    var logEl = document.getElementById("log-output");
    if (!logEl) return;
    logEl.textContent += "[" + new Date().toLocaleTimeString() + "] " + msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  },
  clearLog() {
    var logEl = document.getElementById("log-output");
    if (logEl) logEl.textContent = "";
  },

  // ================================================================
  //  頁籤 1：資料庫設定（保持原樣）
  // ================================================================
  bindSetup() {
    document.getElementById("btn-new-db").addEventListener("click", async function() {
      var btn = document.getElementById("btn-new-db");
      var orig = btn.textContent;
      btn.textContent = "建立中..."; btn.disabled = true;
      try {
        App.log("正在建立記憶體資料庫...");
        if (App.db) closeDatabase(App.db);
        App.db = await createDatabase();
        App.updateDbStatus(true, "記憶體 SQLite");
        App.log("資料庫建立成功。");
        App.notify("記憶體資料庫已就緒", "success");
      } catch (e) {
        App.log("錯誤：" + e.message);
        App.notify("建立資料庫失敗：" + e.message, "error");
      }
      btn.textContent = orig; btn.disabled = false;
    });

    document.getElementById("btn-load-db").addEventListener("click", async function() {
      var files = document.getElementById("db-file-input").files;
      if (!files.length) { App.notify("請先選擇 .db 檔案", "error"); return; }
      try {
        App.log("正在載入資料庫：" + files[0].name);
        var buffer = await files[0].arrayBuffer();
        if (App.db) closeDatabase(App.db);
        App.db = await loadDatabase(buffer);
        App.updateDbStatus(true, files[0].name);
        App.log("資料庫已載入。資料表：" + App.getTableList());
        App.notify("資料庫已載入：" + files[0].name, "success");
      } catch (e) {
        App.log("錯誤：" + e.message);
        App.notify("載入失敗：" + e.message, "error");
      }
    });

    document.getElementById("btn-load-sql").addEventListener("click", function() {
      var sql = document.getElementById("setup-sql").value.trim();
      if (!sql) { App.notify("請輸入 SQL", "error"); return; }
      if (!App.db) { App.notify("請先建立資料庫", "error"); return; }
      try {
        App.log("正在執行結構 SQL...");
        runSQLBatch(App.db, splitSQL(sql));
        App.updateDbStatus(true, "記憶體（自訂結構）");
        App.log("已執行。資料表：" + App.getTableList());
        App.notify("結構已套用成功", "success");
      } catch (e) {
        App.log("錯誤：" + e.message);
        App.notify("SQL 錯誤：" + e.message, "error");
      }
    });

    document.getElementById("btn-download-db").addEventListener("click", function() {
      if (!App.db) { App.notify("沒有資料庫可供下載", "error"); return; }
      var data = exportDatabase(App.db);
      var blob = new Blob([data], { type: "application/octet-stream" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "audit_snapshot.db";
      a.click();
      App.notify("資料庫已下載", "success");
    });

    document.querySelectorAll("input[name='db-mode']").forEach(function(r) {
      r.addEventListener("change", function() {
        App.dbMode = r.value;
        App.toggleDbSections();
      });
    });

    document.getElementById("btn-test-connection").addEventListener("click", async function() {
      var url = document.getElementById("remote-api-url").value.trim();
      var driver = document.getElementById("remote-driver").value;
      var dsn = document.getElementById("remote-dsn").value.trim();
      var user = document.getElementById("remote-user").value.trim();
      var pass = document.getElementById("remote-password").value;
      var resEl = document.getElementById("remote-test-result");
      if (!url) { App.notify("請輸入後端 API 網址", "error"); return; }
      App.backendUrl = url;
      resEl.textContent = "連線測試中..."; resEl.style.color = "";
      try {
        var resp = await fetch(url + "/api/test-connection", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driver: driver, dsn: dsn, user: user, password: pass })
        });
        if (resp.ok) {
          App.remoteConnected = true;
          App.updateRemoteDbStatus(true, driver + " @ " + (dsn || ":memory:"));
          resEl.textContent = "連線成功"; resEl.style.color = "var(--pass)";
          App.notify("遠端資料庫連線成功", "success");
        } else {
          var err = await resp.json();
          App.remoteConnected = false;
          resEl.textContent = "失敗：" + (err.detail || ""); resEl.style.color = "var(--fail)";
        }
      } catch (e) {
        App.remoteConnected = false;
        resEl.textContent = "無法連接：" + e.message; resEl.style.color = "var(--fail)";
      }
    });
  },

  getTableList() {
    if (!this.db) return "（無資料庫）";
    try {
      var result = execSQL(this.db, "SELECT name FROM sqlite_master WHERE type='table' OR type='view' ORDER BY name");
      return result[0] ? result[0].values.map(function(r) { return r[0]; }).join(", ") || "（空的）" : "（空的）";
    } catch (e) { return "（讀取失敗）"; }
  },
  updateDbStatus(ok, label) {
    var el = document.getElementById("db-status");
    el.className = "db-status " + (ok ? "connected" : "disconnected");
    el.textContent = ok ? "已連線：" + label : "未連線";
  },
  toggleDbSections() {
    var local = document.getElementById("local-db-section");
    var remote = document.getElementById("remote-db-section");
    if (this.dbMode === "browser") { if (local) local.style.display = ""; if (remote) remote.style.display = "none"; }
    else { if (local) local.style.display = "none"; if (remote) remote.style.display = ""; }
  },
  updateRemoteDbStatus(ok, label) {
    var el = document.getElementById("remote-db-status");
    el.className = "db-status " + (ok ? "connected" : "disconnected");
    el.textContent = ok ? "已連線：" + label : "未連線";
  },

  // ================================================================
  //  頁籤 2：SQL 輸入（保持原樣）
  // ================================================================
  bindSQLInput() {
    document.getElementById("btn-apply-sql").addEventListener("click", function() {
      App.oldSQL = document.getElementById("old-sql").value.trim();
      App.newSQL = document.getElementById("new-sql").value.trim();
      if (!App.oldSQL || !App.newSQL) { App.notify("請輸入修改前與修改後的 SQL", "error"); return; }
      if (App.dbMode === "browser") {
        if (!App.db) { App.notify("請先初始化資料庫", "error"); return; }
        try { App.applySQLToDB(); App.notify("View 建立成功", "success"); }
        catch (e) { App.log("錯誤：" + e.message); App.notify("建立 View 失敗：" + e.message, "error"); }
      } else {
        App.log("遠端模式：View 將在執行管線時一併建立。");
        App.notify("SQL 已就緒，請執行審計管線", "info");
      }
    });
    document.getElementById("btn-detect-sql").addEventListener("click", function() {
      var oldS = document.getElementById("old-sql").value.trim();
      var newS = document.getElementById("new-sql").value.trim();
      document.getElementById("old-sql-mode").textContent = "（" + App._sqlType(oldS) + "）";
      document.getElementById("new-sql-mode").textContent = "（" + App._sqlType(newS) + "）";
    });
  },
  _sqlType(sql) {
    if (!sql) return "空白";
    var u = sql.toUpperCase().trim();
    if (u.startsWith("SELECT")) return "SELECT（將建立 View）";
    if (u.startsWith("CREATE")) return "CREATE（直接執行）";
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(sql)) return "已存在的資料表/View";
    return "未知格式";
  },
  applySQLToDB() {
    var oldL = this._viewForSQL(this.oldSQL) || "v_audit_old";
    var newL = this._viewForSQL(this.newSQL) || "v_audit_new";
    runSQL(this.db, "DROP VIEW IF EXISTS " + oldL);
    runSQL(this.db, "DROP VIEW IF EXISTS " + newL);
    execSQL(this.db, this._resolveSQL(this.oldSQL, oldL));
    execSQL(this.db, this._resolveSQL(this.newSQL, newL));
    this.config.tables.oldView = oldL;
    this.config.tables.newView = newL;
    this.log("已建立 " + oldL + " 與 " + newL);
  },
  _viewForSQL(sql) {
    var u = (sql || "").toUpperCase().trim();
    return (u.startsWith("SELECT") || u.startsWith("CREATE")) ? null : sql;
  },
  _resolveSQL(sql, vn) {
    var u = sql.toUpperCase().trim();
    if (u.startsWith("SELECT")) return "CREATE VIEW " + vn + " AS " + sql;
    return sql;
  },

  // ================================================================
  //  頁籤 3：參數設定（動態）
  // ================================================================
  bindConfigTab() {
    document.getElementById("btn-save-config").addEventListener("click", function() { App.readConfigFromForm(); App.notify("設定已儲存", "success"); });
    document.getElementById("btn-import-yaml").addEventListener("click", function() { document.getElementById("yaml-file-input").click(); });
    document.getElementById("yaml-file-input").addEventListener("change", function(e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var parsed = App._parseSimpleYAML(ev.target.result);
          App._applyYAMLConfig(parsed);
          App.renderConfigTab();
          App.notify("設定已匯入", "success");
        } catch (er) { App.notify("YAML 解析錯誤：" + er.message, "error"); }
      };
      reader.readAsText(file);
    });
    document.getElementById("btn-export-yaml").addEventListener("click", function() {
      App.readConfigFromForm();
      var y = App._generateYAML();
      var blob = new Blob([y], { type: "text/yaml" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "audit_config.yaml"; a.click();
      App.notify("設定已匯出", "success");
    });
    document.getElementById("btn-run-pipeline").addEventListener("click", function() { App.runAudit(); });
  },

  // --- 動態渲染所有設定區塊 ---
  renderConfigTab() {
    var cfg = this.config;
    var html = "";

    // 基礎設定
    html += this._sectionHeader("基礎設定", "base");
    html += "<div class='section-body' id='sec-base'><div class='form-row'>";
    html += this._field("來源資料表", "cfg-source", cfg.tables.sourceTable);
    html += this._field("基準表", "cfg-baseline", cfg.tables.baselineTable);
    html += this._field("樣本表", "cfg-sample", cfg.tables.sampleTable);
    html += "</div><div class='form-row'>";
    html += this._field("比對表", "cfg-compare", cfg.tables.compareTable);
    html += this._field("新版 View", "cfg-newview", cfg.tables.newView);
    html += this._field("數值容忍度", "cfg-numtol", cfg.tables.numericTol);
    html += "</div></div>";

    // 主鍵欄位
    html += this._sectionHeader("主鍵欄位 (" + cfg.pkColumns.filter(Boolean).length + ")", "pk", true);
    html += "<div class='section-body' id='sec-pk'>";
    cfg.pkColumns.forEach(function(c, i) {
      html += "<div class='row-item'><input value='" + (c || "") + "' data-cfg='pk." + i + "' placeholder='主鍵 " + (i + 1) + "'><button onclick='App._removePk(" + i + ")' class='btn-remove'>✕</button></div>";
    });
    html += "</div>";

    // 業務欄位
    var bizCount = cfg.bizColumns.filter(function(c) { return c.name; }).length;
    html += this._sectionHeader("業務欄位 (" + bizCount + ")", "biz", true);
    html += "<div class='section-body' id='sec-biz'>";
    cfg.bizColumns.forEach(function(c, i) {
      html += "<div class='row-item row-biz'><input value='" + (c.name || "") + "' data-cfg='biz." + i + ".name' placeholder='欄位名稱' style='flex:2'>";
      html += "<select data-cfg='biz." + i + ".type' style='flex:1'>";
      html += "<option value='text'" + (c.type === "text" ? " selected" : "") + ">文字</option>";
      html += "<option value='numeric'" + (c.type === "numeric" ? " selected" : "") + ">數值</option>";
      html += "</select>";
      html += "<button onclick='App._removeBiz(" + i + ")' class='btn-remove'>✕</button></div>";
    });
    html += "</div>";

    // 分支欄位
    html += this._sectionHeader("分支欄位", "branch");
    html += "<div class='section-body' id='sec-branch'>";
    html += "<div class='row-item'><input value='" + (cfg.branchColumn || "") + "' data-cfg='branchColumn' placeholder='分支標記欄位（可留空）' style='flex:1'><button onclick='App._clearBranch()' class='btn-remove'>清除</button></div>";
    html += "</div>";

    // 抽樣條件
    html += this._sectionHeader("抽樣條件 (" + cfg.filters.filter(function(f) { return f.condition; }).length + ")", "filter", true);
    html += "<div class='section-body' id='sec-filter'>";
    cfg.filters.forEach(function(f, i) {
      html += "<div class='row-item row-filter'><input value='" + (f.name || "") + "' data-cfg='filter." + i + ".name' placeholder='名稱' style='width:70px'>";
      html += "<input value='" + (f.condition || "") + "' data-cfg='filter." + i + ".condition' placeholder='WHERE 條件' style='flex:2'>";
      html += "<input value='" + (f.limit || 10) + "' data-cfg='filter." + i + ".limit' placeholder='上限' style='width:60px' type='number'>";
      html += "<button onclick='App._removeFilter(" + i + ")' class='btn-remove'>✕</button></div>";
    });
    html += "</div>";

    // 彙總指標
    html += this._sectionHeader("彙總指標 (" + cfg.aggregateMetrics.filter(function(m) { return m.metric && m.expression; }).length + ")", "metric", true);
    html += "<div class='section-body' id='sec-metric'>";
    cfg.aggregateMetrics.forEach(function(m, i) {
      html += "<div class='row-item row-metric'><input value='" + (m.metric || "") + "' data-cfg='metric." + i + ".metric' placeholder='指標名稱' style='width:100px'>";
      html += "<input value='" + (m.expression || "") + "' data-cfg='metric." + i + ".expression' placeholder='SQL 表達式（例：COUNT(*), SUM(amt)）' style='flex:2'>";
      html += "<input value='" + (m.maxAbsDiff != null ? m.maxAbsDiff : "") + "' data-cfg='metric." + i + ".maxAbsDiff' placeholder='絕對差' style='width:80px' type='number' step='any'>";
      html += "<input value='" + (m.maxPctDiff != null ? m.maxPctDiff : "") + "' data-cfg='metric." + i + ".maxPctDiff' placeholder='%差' style='width:80px' type='number' step='any'>";
      html += "<button onclick='App._removeMetric(" + i + ")' class='btn-remove'>✕</button></div>";
    });
    html += "</div>";

    // 分組欄位
    html += this._sectionHeader("分組欄位", "group");
    html += "<div class='section-body' id='sec-group'>";
    html += "<div class='row-item'><input value='" + (cfg.groupColumn || "") + "' data-cfg='groupColumn' placeholder='用於 Step 6 分組差異檢查（可留空）' style='flex:1'><button onclick='App._clearGroup()' class='btn-remove'>清除</button></div>";
    html += "</div>";

    document.getElementById("config-sections").innerHTML = html;

    // 折疊切換
    document.querySelectorAll(".section-header").forEach(function(h) {
      h.addEventListener("click", function() {
        var body = this.nextElementSibling;
        body.style.display = body.style.display === "none" ? "" : "none";
        this.classList.toggle("collapsed", body.style.display === "none");
      });
    });
  },

  _sectionHeader(title, id, showAdd) {
    var add = showAdd ? "<button onclick='App._addToSection(\"" + id + "\")' class='btn-add btn btn-secondary' style='padding:2px 12px;font-size:12px'>+ 新增</button>" : "";
    return "<h3 class='section-header'><span>" + title + "</span>" + add + "</h3>";
  },
  _field(label, id, value) {
    return "<div class='form-group'><label>" + label + "</label><input id='" + id + "' value='" + (value || "") + "'></div>";
  },

  // --- 動態新增 / 刪除 ---
  _addToSection(section) {
    var cfg = this.config;
    if (section === "pk") { cfg.pkColumns.push(""); }
    else if (section === "biz") { cfg.bizColumns.push({ name: "", type: "numeric" }); }
    else if (section === "filter") { cfg.filters.push({ name: "", condition: "", limit: 10 }); }
    else if (section === "metric") { cfg.aggregateMetrics.push({ metric: "", expression: "", maxAbsDiff: null, maxPctDiff: null }); }
    this.renderConfigTab();
  },
  _removePk(i) { var a = this.config.pkColumns.filter(Boolean); if (a.length <= 1) { this.notify("至少保留一個主鍵欄位", "error"); return; } this.config.pkColumns.splice(i, 1); this.renderConfigTab(); },
  _removeBiz(i) { var a = this.config.bizColumns.filter(function(c) { return c.name; }); if (a.length <= 1) { this.notify("至少保留一個業務欄位", "error"); return; } this.config.bizColumns.splice(i, 1); this.renderConfigTab(); },
  _removeFilter(i) { this.config.filters.splice(i, 1); this.renderConfigTab(); },
  _removeMetric(i) { this.config.aggregateMetrics.splice(i, 1); this.renderConfigTab(); },
  _clearBranch() { this.config.branchColumn = ""; this.renderConfigTab(); },
  _clearGroup() { this.config.groupColumn = ""; this.renderConfigTab(); },

  // --- 讀取表單回到 config ---
  readConfigFromForm() {
    var c = this.config;
    c.tables.sourceTable = document.getElementById("cfg-source")?.value.trim() || "";
    c.tables.baselineTable = document.getElementById("cfg-baseline")?.value.trim() || "tmp_baseline";
    c.tables.sampleTable = document.getElementById("cfg-sample")?.value.trim() || "tmp_sample";
    c.tables.compareTable = document.getElementById("cfg-compare")?.value.trim() || "tmp_compare";
    c.tables.newView = document.getElementById("cfg-newview")?.value.trim() || "v_audit_new";
    c.tables.numericTol = document.getElementById("cfg-numtol")?.value.trim() || "0.01";

    // 主鍵
    document.querySelectorAll("[data-cfg^='pk.']").forEach(function(inp) {
      var idx = parseInt(inp.dataset.cfg.split(".")[1]);
      c.pkColumns[idx] = inp.value.trim();
    });

    // 業務欄位
    document.querySelectorAll("[data-cfg^='biz.']").forEach(function(inp) {
      var parts = inp.dataset.cfg.split(".");
      var idx = parseInt(parts[1]);
      var prop = parts[2]; // "name" or "type"
      if (prop === "name") c.bizColumns[idx].name = inp.value.trim();
      else if (prop === "type") c.bizColumns[idx].type = inp.value;
    });

    // 分支
    var branchVal = document.querySelector("[data-cfg='branchColumn']")?.value.trim() || "";
    c.branchColumn = branchVal;

    // 抽樣
    document.querySelectorAll("[data-cfg^='filter.']").forEach(function(inp) {
      var parts = inp.dataset.cfg.split(".");
      var idx = parseInt(parts[1]);
      var prop = parts[2];
      if (prop === "name") c.filters[idx].name = inp.value.trim();
      else if (prop === "condition") c.filters[idx].condition = inp.value.trim();
      else if (prop === "limit") c.filters[idx].limit = parseInt(inp.value) || 10;
    });

    // 彙總指標
    document.querySelectorAll("[data-cfg^='metric.']").forEach(function(inp) {
      var parts = inp.dataset.cfg.split(".");
      var idx = parseInt(parts[1]);
      var prop = parts[2];
      var val = inp.value.trim();
      if (prop === "metric") c.aggregateMetrics[idx].metric = val;
      else if (prop === "expression") c.aggregateMetrics[idx].expression = val;
      else if (prop === "maxAbsDiff") c.aggregateMetrics[idx].maxAbsDiff = val !== "" ? parseFloat(val) : null;
      else if (prop === "maxPctDiff") c.aggregateMetrics[idx].maxPctDiff = val !== "" ? parseFloat(val) : null;
    });

    // 分組
    var groupVal = document.querySelector("[data-cfg='groupColumn']")?.value.trim() || "";
    c.groupColumn = groupVal;
  },

  // ================================================================
  //  執行審計
  // ================================================================
  async runAudit() {
    this.readConfigFromForm();
    this.oldSQL = document.getElementById("old-sql").value.trim();
    this.newSQL = document.getElementById("new-sql").value.trim();
    if (!this.oldSQL || !this.newSQL) { this.notify("請輸入修改前與修改後的 SQL", "error"); return; }
    this.config.tables.oldView = this._viewForSQL(this.oldSQL) || "v_audit_old";
    this.config.tables.newView = this._viewForSQL(this.newSQL) || "v_audit_new";
    if (this.dbMode === "remote") return this.runAuditRemote();

    var missing = validateConfig(this.config);
    if (missing.length > 0) { this.notify("缺少必要設定：" + missing.join(", "), "error"); return; }
    if (!this.db) { this.notify("請先初始化資料庫", "error"); return; }

    this.showTab("results"); this.clearLog();
    this.log("開始執行審計管線...");
    var stepNames = ["基準快照", "黃金樣本", "雙軌執行", "差異比對", "彙總檢查", "分組差異"];
    var progressEl = document.getElementById("pipeline-progress");
    progressEl.innerHTML = "";

    try {
      this.applySQLToDB();
      this.runResult = runFullPipeline(this.db, this.config, function(step) {
        var name = stepNames[step.step - 1] || ("步驟 " + step.step);
        var ok = step.ok !== false && step.pass !== false;
        App.log("步驟 " + step.step + "（" + name + "）：" + (ok ? "成功" : "失敗") + (step.error ? " - " + step.error : ""));
        var span = document.createElement("span");
        span.className = "step " + (ok ? "done" : "error");
        span.textContent = name;
        progressEl.appendChild(span);
      });
      this.renderResults(this.runResult);
      this.notify("審計完成：" + (this.runResult.overall ? "通過" : "未通過"), this.runResult.overall ? "success" : "error");
    } catch (e) {
      this.log("管線錯誤：" + e.message);
      this.notify("錯誤：" + e.message, "error");
      var span = document.createElement("span"); span.className = "step error"; span.textContent = "錯誤"; progressEl.appendChild(span);
    }
  },

  async runAuditRemote() {
    this.showTab("results"); this.clearLog(); this.log("遠端模式：透過後端 API 執行...");
    var progressEl = document.getElementById("pipeline-progress"); progressEl.innerHTML = "";
    var stepNames = ["基準快照", "黃金樣本", "雙軌執行", "差異比對", "彙總檢查", "分組差異"];
    var driver = document.getElementById("remote-driver").value;
    var dsn = document.getElementById("remote-dsn").value.trim();
    var user = document.getElementById("remote-user").value.trim();
    var pass = document.getElementById("remote-password").value;

    var sqlDir = (driver === "oracledb" || driver === "cx_Oracle") ? "../templates" : "../templates/sqlite";

    var body = { db: { driver: driver, user: user, password: pass, dsn: dsn }, config: this.config, before_sql: this.oldSQL, after_sql: this.newSQL, sql_dir: sqlDir };

    try {
      var resp = await fetch(this.backendUrl + "/api/run-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!resp.ok) { var err = await resp.json(); throw new Error(err.detail || "HTTP " + resp.status); }
      var data = await resp.json();
      this.runResult = { overall: data.overall, steps: [], step4: data.step4, step5: data.step5, step6: data.step6 };
      stepNames.forEach(function(n) { var s = document.createElement("span"); s.className = "step done"; s.textContent = n; progressEl.appendChild(s); });
      this.renderResults(this.runResult);
      this.notify("審計完成：" + (this.runResult.overall ? "通過" : "未通過"), this.runResult.overall ? "success" : "error");
    } catch (e) {
      this.log("遠端錯誤：" + e.message);
      this.notify("錯誤：" + e.message, "error");
      var span = document.createElement("span"); span.className = "step error"; span.textContent = "錯誤"; progressEl.appendChild(span);
    }
  },

  // ================================================================
  //  頁籤 4：審計結果
  // ================================================================
  bindResults() {
    document.getElementById("btn-download-md").addEventListener("click", function() { App._downloadReport("md"); });
    document.getElementById("btn-download-html").addEventListener("click", function() { App._downloadReport("html"); });
    document.getElementById("btn-go-config").addEventListener("click", function() { App.showTab("config"); });
  },
  _downloadReport(fmt) {
    if (!this.runResult) { this.notify("尚無結果", "error"); return; }
    var content = fmt === "html" ? generateHtmlReport(this.runResult, this.config) : generateMarkdownReport(this.runResult, this.config);
    var blob = new Blob([content], { type: fmt === "html" ? "text/html" : "text/markdown" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "audit_report." + (fmt === "html" ? "html" : "md"); a.click();
    this.notify("報告已下載", "success");
  },
  renderResults(result) {
    if (!result) return;
    document.getElementById("btn-download-md").disabled = false;
    document.getElementById("btn-download-html").disabled = false;
    var summaryEl = document.getElementById("result-summary");
    summaryEl.style.display = "block";
    summaryEl.className = "summary " + (result.overall ? "pass" : "fail");
    summaryEl.textContent = "審計結果：" + (result.overall ? "通過" : "未通過");

    // Step 4
    var s4 = result.step4, s4Status = document.getElementById("s4-status"), s4Table = document.getElementById("s4-table"), s4Cont = document.getElementById("s4-table-container");
    if (s4) {
      s4Status.innerHTML = "步驟 4：逐列差異比對 — <span class='badge " + (s4.pass ? "badge-pass" : "badge-fail") + "'>" + (s4.pass ? "通過" : "未通過") + "</span>（" + (s4.diffCount || 0) + " 列差異）";
      if (s4.rows && s4.rows.length > 0 && s4.columns) {
        s4Cont.style.display = "block";
        var h = "<thead><tr>"; s4.columns.forEach(function(c) { h += "<th>" + c + "</th>"; }); h += "</tr></thead><tbody>";
        s4.rows.forEach(function(row) { h += "<tr>"; row.forEach(function(v) { h += "<td class='mono'>" + (v === null ? "NULL" : v) + "</td>"; }); h += "</tr>"; });
        h += "</tbody>"; s4Table.innerHTML = h;
      } else s4Cont.style.display = "none";
    } else { s4Status.innerHTML = "步驟 4 — <span class='badge badge-fail'>錯誤</span>"; s4Cont.style.display = "none"; }

    // Step 5
    var s5 = result.step5, s5Status = document.getElementById("s5-status"), s5Table = document.getElementById("s5-table");
    if (s5 && s5.judged && s5.judged.length) {
      s5Status.innerHTML = "步驟 5：彙總指標檢查 — <span class='badge " + (s5.pass ? "badge-pass" : "badge-fail") + "'>" + (s5.pass ? "通過" : "未通過") + "</span>";
      var h = "<thead><tr><th>指標</th><th>舊值</th><th>新值</th><th>差異</th><th>差異%</th><th>狀態</th><th>原因</th></tr></thead><tbody>";
      s5.judged.forEach(function(r) {
        var b = r.status === "PASS" ? "badge-pass" : r.status === "FAIL" ? "badge-fail" : "badge-skip";
        h += "<tr><td>" + r.metric + "</td>";
        h += "<td class='mono'>" + (r.oldVal != null ? r.oldVal : "-") + "</td>";
        h += "<td class='mono'>" + (r.newVal != null ? r.newVal : "-") + "</td>";
        h += "<td class='mono'>" + (r.diff != null ? r.diff : "-") + "</td>";
        h += "<td class='mono'>" + (r.diffPct != null ? r.diffPct : "-") + "</td>";
        h += "<td><span class='badge " + b + "'>" + r.status + "</span></td><td>" + r.reason + "</td></tr>";
      });
      h += "</tbody>"; s5Table.innerHTML = h;
    } else { s5Status.innerHTML = "步驟 5：彙總指標檢查 — <span class='badge badge-fail'>錯誤</span>"; s5Table.innerHTML = ""; }

    // Step 6
    var s6 = result.step6 || (result.steps && result.steps.find(function(s) { return s.step === 6; }));
    var s6Status = document.getElementById("s6-status");
    if (s6) {
      var p6 = s6.pass !== false;
      s6Status.innerHTML = "步驟 6：分組分類差異 — <span class='badge " + (p6 ? "badge-pass" : "badge-fail") + "'>" + (p6 ? "通過" : "未通過") + "</span>（" + (s6.diffCount || 0) + " 組變更）";
    } else { s6Status.innerHTML = "步驟 6：分組分類差異 — <span class='badge badge-skip'>略過</span>"; }
  },

  // ================================================================
  //  YAML 匯入 / 匯出
  // ================================================================
  _parseSimpleYAML(text) {
    var lines = text.split("\n"), result = { tables: {}, pkColumns: [], bizColumns: [], filters: [], aggregateMetrics: [] }, section = null;
    lines.forEach(function(line) {
      var t = line.trim();
      if (!t || t.startsWith("#")) return;
      if (t === "tables:" || t === "基礎設定:") { section = "tables"; return; }
      if (t === "pk_columns:" || t === "主鍵欄位:") { section = "pk"; return; }
      if (t === "biz_columns:" || t === "業務欄位:") { section = "biz"; return; }
      if (t === "branch_column:" || t === "分支欄位:") { section = "branch"; return; }
      if (t === "filters:" || t === "抽樣條件:") { section = "filter"; return; }
      if (t === "aggregate_metrics:" || t === "彙總指標:") { section = "metric"; return; }
      if (t === "tolerances:" || t === "容忍度:") { section = "tolerance"; return; }
      if (t === "group_column:" || t === "分組欄位:") { section = "group"; return; }
      if (t === "placeholders:") { section = "placeholders"; return; }

      var m;
      if (section === "tables" && (m = t.match(/^(\w+):\s*(.*)$/))) {
        var keyMap = { sourceTable: "sourceTable", baselineTable: "baselineTable", sampleTable: "sampleTable", compareTable: "compareTable", oldView: "oldView", newView: "newView", numericTol: "numericTol", SOURCE_TABLE: "sourceTable", BASELINE_TABLE: "baselineTable", SAMPLE_TABLE: "sampleTable", COMPARE_TABLE: "compareTable", OLD_SQL_OR_VIEW: "oldView", NEW_SQL_OR_VIEW: "newView", NUMERIC_TOL: "numericTol" };
        var k = keyMap[m[1]] || m[1];
        result.tables[k] = m[2].trim().replace(/^["']|["']$/g, "");
      } else if (section === "placeholders" && (m = t.match(/^([A-Z0-9_]+):\s*(.*)$/))) {
        var km2 = { SOURCE_TABLE: "sourceTable", BASELINE_TABLE: "baselineTable", SAMPLE_TABLE: "sampleTable", COMPARE_TABLE: "compareTable", OLD_SQL_OR_VIEW: "oldView", NEW_SQL_OR_VIEW: "newView", NUMERIC_TOL: "numericTol" };
        var k2 = km2[m[1]];
        if (k2) result.tables[k2] = m[2].trim().replace(/^["']|["']$/g, "");
      } else if (section === "pk") { result.pkColumns.push(t.replace(/^- /, "").trim()); }
      else if (section === "biz") {
        var bm = t.match(/-\s*(?:name:|name\s*)?\s*(\S+)\s*(?:type:|type\s*)?\s*(\S*)/);
        if (bm) result.bizColumns.push({ name: bm[1] || "", type: bm[2] === "text" ? "text" : "numeric" });
      } else if (section === "branch") { result.branchColumn = t.replace(/^- /, "").trim(); }
      else if (section === "filter") {
        var fm = t.match(/-\s*(\S+)?\s*["']?([^"']*)["']?\s*(\d*)$/);
        if (fm) result.filters.push({ name: fm[1] || "", condition: fm[2] || "", limit: parseInt(fm[3]) || 10 });
      } else if (section === "metric" || section === "tolerance") {
        if (t.startsWith("- metric:")) { var mn = t.split(":")[1].trim(); result.aggregateMetrics.push({ metric: mn, expression: "", maxAbsDiff: null, maxPctDiff: null }); }
        else if (t.startsWith("expression:") || t.startsWith("表達式:")) { var em = result.aggregateMetrics; if (em.length) em[em.length - 1].expression = t.split(/:\s*/)[1]?.trim() || ""; }
        else if (t.startsWith("max_abs_diff:")) { var am = result.aggregateMetrics; if (am.length) am[am.length - 1].maxAbsDiff = parseFloat(t.split(":")[1]); }
        else if (t.startsWith("max_pct_diff:")) { var pm = result.aggregateMetrics; if (pm.length) pm[pm.length - 1].maxPctDiff = parseFloat(t.split(":")[1]); }
      } else if (section === "group") { result.groupColumn = t.replace(/^- /, "").trim(); }
    });
    return result;
  },
  _applyYAMLConfig(parsed) {
    if (parsed.tables) { Object.assign(this.config.tables, parsed.tables); }
    if (parsed.pkColumns && parsed.pkColumns.length) { this.config.pkColumns = parsed.pkColumns; }
    if (parsed.bizColumns && parsed.bizColumns.length) { this.config.bizColumns = parsed.bizColumns; }
    if (parsed.branchColumn !== undefined) { this.config.branchColumn = parsed.branchColumn; }
    if (parsed.filters && parsed.filters.length) { this.config.filters = parsed.filters; }
    if (parsed.aggregateMetrics && parsed.aggregateMetrics.length) { this.config.aggregateMetrics = parsed.aggregateMetrics; }
    if (parsed.groupColumn !== undefined) { this.config.groupColumn = parsed.groupColumn; }
  },
  _generateYAML() {
    var c = this.config, y = "# SQL 變更審計設定\n\n";
    y += "基礎設定:\n";
    var tKeys = ["sourceTable", "baselineTable", "sampleTable", "compareTable", "oldView", "newView", "numericTol"];
    tKeys.forEach(function(k) { if (c.tables[k]) y += "  " + k + ": " + c.tables[k] + "\n"; });
    y += "\n主鍵欄位:\n"; c.pkColumns.filter(Boolean).forEach(function(v) { y += "  - " + v + "\n"; });
    y += "\n業務欄位:\n"; c.bizColumns.filter(function(x) { return x.name; }).forEach(function(x) { y += "  - name: " + x.name + "\n    type: " + x.type + "\n"; });
    if (c.branchColumn) y += "\n分支欄位: " + c.branchColumn + "\n";
    y += "\n抽樣條件:\n"; c.filters.filter(function(f) { return f.condition; }).forEach(function(f) { y += "  - " + f.name + " \"" + f.condition + "\" " + f.limit + "\n"; });
    y += "\n彙總指標:\n"; c.aggregateMetrics.filter(function(m) { return m.metric; }).forEach(function(m) {
      y += "  - metric: " + m.metric + "\n";
      if (m.expression) y += "    expression: " + m.expression + "\n";
      if (m.maxAbsDiff != null) y += "    max_abs_diff: " + m.maxAbsDiff + "\n";
      if (m.maxPctDiff != null) y += "    max_pct_diff: " + m.maxPctDiff + "\n";
    });
    if (c.groupColumn) y += "\n分組欄位: " + c.groupColumn + "\n";
    return y;
  }
};

// ==== 輔助 ====
function splitSQL(sql) {
  var statements = [], current = "";
  sql.split("\n").forEach(function(line) {
    var t = line.trim();
    if (!t || t.startsWith("--")) { current += line + "\n"; return; }
    current += line + "\n";
    if (t.endsWith(";")) { statements.push(current.trim()); current = ""; }
  });
  if (current.trim()) statements.push(current.trim());
  return statements;
}

App._onClickNewDb = function() {
  var btn = document.getElementById("btn-new-db");
  var orig = btn.textContent;
  btn.textContent = "建立中..."; btn.disabled = true;
  (async function() {
    try {
      App.log("正在建立記憶體資料庫...");
      if (App.db) closeDatabase(App.db);
      App.db = await createDatabase();
      App.updateDbStatus(true, "記憶體 SQLite");
      App.log("資料庫建立成功。");
      App.notify("記憶體資料庫已就緒", "success");
    } catch (e) {
      App.log("錯誤：" + e.message);
      App.notify("建立資料庫失敗：" + e.message, "error");
    }
    btn.textContent = orig; btn.disabled = false;
  })();
};

document.addEventListener("DOMContentLoaded", function() { App.init(); });
