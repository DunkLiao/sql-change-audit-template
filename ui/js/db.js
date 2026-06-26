// sql.js wrapper – browser-side SQLite database
let SQL = null;

// 從 DOM 中找到 sql-wasm.js 的所在目錄（絕對路徑），作為 WASM 位置基準
function _getWasmDir() {
  var scripts = document.getElementsByTagName("script");
  for (var i = scripts.length - 1; i >= 0; i--) {
    var src = scripts[i].src;
    if (src && src.indexOf("sql-wasm.js") !== -1) {
      return src.substring(0, src.lastIndexOf("/") + 1);
    }
  }
  return "js/vendor/";
}

// Initialize sql.js (call once). Returns the SQL module.
async function initSqlJsModule() {
  if (SQL) return SQL;

  const initFn = typeof initSqlJs !== "undefined" ? initSqlJs : window.initSqlJs;
  if (!initFn) {
    throw new Error("sql.js 未載入，請確認 js/vendor/sql-wasm.js 存在");
  }

  try {
    SQL = await initFn({
      locateFile: function(file) { return _getWasmDir() + file; }
    });
    console.log("[sql.js] loaded, Database:", typeof SQL.Database);
    return SQL;
  } catch (e) {
    console.error("[sql.js] init failed:", e);
    throw new Error("sql.js 初始化失敗：" + e.message);
  }
}

// Create a fresh in-memory database
async function createDatabase() {
  const sqlModule = await initSqlJsModule();
  if (!sqlModule || !sqlModule.Database) {
    throw new Error("sql.js 模組不完整，缺少 Database 建構式");
  }
  return new sqlModule.Database();
}

// Load a database from an ArrayBuffer (e.g., uploaded .db file)
async function loadDatabase(arrayBuffer) {
  const sqlModule = await initSqlJsModule();
  if (!sqlModule || !sqlModule.Database) {
    throw new Error("sql.js 模組不完整，缺少 Database 建構式");
  }
  const uint8 = new Uint8Array(arrayBuffer);
  return new sqlModule.Database(uint8);
}

// Execute one or more SQL statements. Returns array of {columns, values} for SELECTs.
function execSQL(db, sql) {
  try {
    return db.exec(sql);
  } catch (e) {
    throw new Error("SQL 錯誤：" + e.message + "\nSQL: " + sql.substring(0, 200));
  }
}

// Execute DDL/DML statements (no result expected)
function runSQL(db, sql) {
  try {
    db.run(sql);
  } catch (e) {
    throw new Error("SQL 錯誤：" + e.message + "\nSQL: " + sql.substring(0, 200));
  }
}

// Execute a list of SQL statements sequentially
function runSQLBatch(db, statements) {
  statements.forEach(sql => {
    if (sql.trim()) runSQL(db, sql);
  });
}

// Export database as Uint8Array (for download)
function exportDatabase(db) {
  return db.export();
}

// Close database
function closeDatabase(db) {
  if (db) db.close();
}
