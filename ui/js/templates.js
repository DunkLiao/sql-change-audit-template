// SQL Change Audit – Dynamic SQL Builders
// 根據 config 動態產生 Step 1-6 的 SQL（SQLite 方言）

// 預設設定
const DEFAULT_CONFIG = {
  tables: {
    baselineTable: "tmp_baseline",
    sampleTable: "tmp_sample",
    compareTable: "tmp_compare",
    sourceTable: "",
    oldView: "v_audit_old",
    newView: "v_audit_new",
    numericTol: "0.01"
  },
  pkColumns: ["cust_id", "ss_seq"],
  bizColumns: [
    { name: "industry_group", type: "text" },
    { name: "lgd_value", type: "numeric" },
    { name: "k_value", type: "numeric" },
    { name: "ead_amt", type: "numeric" },
    { name: "rwa_amt", type: "numeric" }
  ],
  branchColumn: "case_branch",
  filters: [
    { name: "例外", condition: "substr(industry_type,3,2) IN ('08','09')", limit: 10 },
    { name: "邊界", condition: "ead_amt IN (0, 1, 999999)", limit: 10 },
    { name: "一般", condition: "substr(industry_type,3,2) NOT IN ('08','09')", limit: 10 },
    { name: "NULL", condition: "industry_type IS NULL", limit: 5 }
  ],
  aggregateMetrics: [
    { metric: "CNT", expression: "COUNT(*)", maxAbsDiff: 0, maxPctDiff: null },
    { metric: "SUM_AMT", expression: "SUM(ead_amt)", maxAbsDiff: null, maxPctDiff: 0.001 },
    { metric: "SUM_WEIGHTED", expression: "SUM(rwa_amt)", maxAbsDiff: null, maxPctDiff: 0.01 },
    { metric: "AVG_RATIO", expression: "AVG(lgd_value)", maxAbsDiff: 0.001, maxPctDiff: null },
    { metric: "GROUP_CNT", expression: "COUNT(DISTINCT industry_group)", maxAbsDiff: 0, maxPctDiff: null }
  ],
  groupColumn: "industry_group"
};

// ---- Helper ----
function _escCol(col) {
  return col; // SQLite 不需要特別 escape，簡單名稱直接使用
}

// 收集所有欄位（主鍵 + 業務 + 分支）
function _allColumns(pkColumns, bizColumns, branchColumn) {
  var cols = pkColumns.filter(Boolean);
  bizColumns.forEach(function(c) { if (c.name) cols.push(c.name); });
  if (branchColumn) cols.push(branchColumn);
  return cols;
}

// ---- Step 1: 基準快照 ----
function buildStep1(config) {
  var t = config.tables;
  var cols = _allColumns(config.pkColumns, config.bizColumns, config.branchColumn);
  if (cols.length === 0) throw new Error("至少需要一個主鍵或業務欄位");
  return [
    "DROP TABLE IF EXISTS " + t.baselineTable,
    "CREATE TABLE " + t.baselineTable + " AS SELECT " + cols.join(", ") + " FROM " + t.oldView
  ];
}

// ---- Step 2: 抽樣 ----
function buildStep2(config) {
  var t = config.tables;
  var pk = config.pkColumns.filter(Boolean);
  if (pk.length === 0) throw new Error("至少需要一個主鍵欄位");
  if (!t.sourceTable) throw new Error("需要設定來源資料表");

  var stmts = ["DROP TABLE IF EXISTS " + t.sampleTable];
  stmts.push("CREATE TABLE " + t.sampleTable + " AS SELECT '" + (config.filters[0]?.name || "SAMPLE") + "' AS SAMPLE_TYPE, " + pk.join(", ") + " FROM " + t.sourceTable + " t WHERE 0");

  config.filters.forEach(function(f) {
    if (!f.condition) return;
    stmts.push("INSERT INTO " + t.sampleTable + " SELECT '" + f.name + "', " + pk.map(function(c) { return "t." + c; }).join(", ") + " FROM " + t.sourceTable + " t WHERE " + f.condition + " LIMIT " + (f.limit || 10));
  });

  return stmts;
}

// ---- Step 3: 雙軌執行 ----
function buildStep3(config) {
  var t = config.tables;
  var pk = config.pkColumns.filter(Boolean);
  if (pk.length === 0) throw new Error("至少需要一個主鍵欄位");

  var selectParts = ["s.SAMPLE_TYPE"];
  // COALESCE PK columns
  pk.forEach(function(c) {
    selectParts.push("COALESCE(o." + c + ", n." + c + ") AS " + c);
  });
  // OLD / NEW for biz columns
  config.bizColumns.forEach(function(c) {
    if (!c.name) return;
    selectParts.push("o." + c.name + " AS OLD_" + c.name);
    selectParts.push("n." + c.name + " AS NEW_" + c.name);
  });
  // OLD / NEW for branch
  if (config.branchColumn) {
    selectParts.push("o." + config.branchColumn + " AS OLD_" + config.branchColumn);
    selectParts.push("n." + config.branchColumn + " AS NEW_" + config.branchColumn);
  }

  var joinOld = pk.map(function(c) { return "o." + c + " = s." + c; }).join(" AND ");
  var joinNew = pk.map(function(c) { return "n." + c + " = s." + c; }).join(" AND ");

  return [
    "DROP TABLE IF EXISTS " + t.compareTable,
    "CREATE TABLE " + t.compareTable + " AS SELECT " + selectParts.join(", ") + " FROM " + t.sampleTable + " s LEFT JOIN " + t.baselineTable + " o ON " + joinOld + " LEFT JOIN " + t.newView + " n ON " + joinNew
  ];
}

// ---- Step 4: 差異比對 ----
function buildStep4(config) {
  var t = config.tables;
  var pk = config.pkColumns.filter(Boolean);
  if (pk.length === 0) throw new Error("至少需要一個主鍵欄位");

  var conditions = [];
  config.bizColumns.forEach(function(c) {
    if (!c.name) return;
    if (c.type === "text" || c.type === "string") {
      conditions.push("COALESCE(CAST(OLD_" + c.name + " AS TEXT),'#') <> COALESCE(CAST(NEW_" + c.name + " AS TEXT),'#')");
    } else {
      conditions.push("ABS(COALESCE(OLD_" + c.name + ",0) - COALESCE(NEW_" + c.name + ",0)) > " + t.numericTol);
    }
  });

  if (config.branchColumn) {
    conditions.push("COALESCE(OLD_" + config.branchColumn + ",'#') <> COALESCE(NEW_" + config.branchColumn + ",'#')");
  }

  if (conditions.length === 0) return "SELECT 'N/A' AS RESULT WHERE 0";

  return "SELECT SAMPLE_TYPE, " + pk.join(", ") + " FROM " + t.compareTable + " WHERE " + conditions.join(" OR ");
}

// ---- Step 5: 彙總指標 ----
function buildStep5(config) {
  var t = config.tables;

  var metrics = config.aggregateMetrics.filter(function(m) { return m.metric && m.expression; });
  if (metrics.length === 0) throw new Error("至少需要一個彙總指標");

  // Build old_stats SELECT
  var oldExprs = metrics.map(function(m, i) {
    return m.expression + " AS M" + i;
  });

  // Build new_stats SELECT (same expressions against newView)
  var newExprs = metrics.map(function(m, i) {
    return m.expression + " AS M" + i;
  });

  // Build UNION ALL selects
  var unions = metrics.map(function(m, i) {
    var alias = "M" + i;
    return "SELECT '" + m.metric.replace(/'/g, "''") + "' AS METRIC, o." + alias + " AS OLD_VAL, n." + alias + " AS NEW_VAL, n." + alias + "-o." + alias + " AS DIFF, ROUND((n." + alias + "-o." + alias + ")*100.0/NULLIF(o." + alias + ",0),6) AS DIFF_PCT FROM old_stats o, new_stats n";
  });

  return "WITH old_stats AS (SELECT " + oldExprs.join(", ") + " FROM " + t.baselineTable + "), new_stats AS (SELECT " + newExprs.join(", ") + " FROM " + t.newView + ") " + unions.join(" UNION ALL ");
}

// ---- Step 6: 分組差異 ----
function buildStep6(config) {
  var t = config.tables;
  var pk = config.pkColumns.filter(Boolean);
  var gc = config.groupColumn;
  if (!gc || pk.length === 0) return null;

  var joinOn = pk.map(function(c) { return "o." + c + "=n." + c; }).join(" AND ");

  return "SELECT o." + gc + " AS OLD_GROUP, n." + gc + " AS NEW_GROUP, COUNT(*) AS CHANGED_CNT FROM " + t.baselineTable + " o JOIN " + t.newView + " n ON " + joinOn + " WHERE COALESCE(o." + gc + ",'#') <> COALESCE(n." + gc + ",'#') GROUP BY o." + gc + ", n." + gc;
}

// ---- Validate ----
function validateConfig(config) {
  var missing = [];
  var t = config.tables;
  if (!t.sourceTable) missing.push("來源資料表");
  if (!config.pkColumns.filter(Boolean).length) missing.push("主鍵欄位（至少一個）");
  if (!config.bizColumns.filter(function(c) { return c.name; }).length) missing.push("業務欄位（至少一個）");
  if (!config.aggregateMetrics.filter(function(m) { return m.metric && m.expression; }).length) missing.push("彙總指標（至少一個）");
  return missing;
}

// ---- Build tolerances from aggregate metrics ----
function buildTolerances(config) {
  return config.aggregateMetrics
    .filter(function(m) { return m.metric && (m.maxAbsDiff != null || m.maxPctDiff != null); })
    .map(function(m) {
      return {
        metric: m.metric,
        max_abs_diff: m.maxAbsDiff != null ? m.maxAbsDiff : undefined,
        max_pct_diff: m.maxPctDiff != null ? m.maxPctDiff : undefined
      };
    });
}
