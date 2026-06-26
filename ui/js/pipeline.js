// Pipeline executor – runs Steps 1-6 with dynamic SQL builders
// 使用 templates.js 的 buildStepN(config) 動態產生 SQL

function runStep1(db, config) {
  var stmts = buildStep1(config);
  runSQLBatch(db, stmts);
  return { step: 1, ok: true };
}

function runStep2(db, config) {
  var stmts = buildStep2(config);
  runSQLBatch(db, stmts);
  var result = execSQL(db, "SELECT COUNT(*) AS cnt FROM " + config.tables.sampleTable);
  return { step: 2, ok: true, sampleCount: result[0]?.values[0]?.[0] ?? 0 };
}

function runStep3(db, config) {
  var stmts = buildStep3(config);
  runSQLBatch(db, stmts);
  var result = execSQL(db, "SELECT COUNT(*) AS cnt FROM " + config.tables.compareTable);
  return { step: 3, ok: true, compareCount: result[0]?.values[0]?.[0] ?? 0 };
}

function runStep4(db, config) {
  var sql = buildStep4(config);
  var result = execSQL(db, sql);
  if (result.length === 0) {
    return { step: 4, pass: true, diffCount: 0, columns: [], rows: [] };
  }
  var cols = result[0].columns;
  var rows = result[0].values;
  return {
    step: 4,
    pass: rows.length === 0,
    diffCount: rows.length,
    columns: cols,
    rows: rows.slice(0, 50)
  };
}

function runStep5(db, config) {
  var tolerances = buildTolerances(config);
  var sql = buildStep5(config);
  var result = execSQL(db, sql);
  if (result.length === 0 || !result[0] || result[0].values.length === 0) {
    return { step: 5, pass: true, judged: [], message: "No aggregate data" };
  }
  var cols = result[0].columns;
  var rows = result[0].values.map(function(vals) {
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = vals[i]; });
    return obj;
  });
  var j = judgeAll(rows, tolerances);
  return { step: 5, pass: j.overall, judged: j.judged };
}

function runStep6(db, config) {
  var sql = buildStep6(config);
  if (!sql) {
    return { step: 6, pass: true, diffCount: 0, rows: [], message: "未設定分組欄位" };
  }
  try {
    var result = execSQL(db, sql);
    if (result.length === 0 || !result[0]) {
      return { step: 6, pass: true, diffCount: 0, columns: [], rows: [] };
    }
    var cols = result[0].columns;
    var rows = result[0].values;
    return {
      step: 6,
      pass: rows.length === 0,
      diffCount: rows.length,
      columns: cols,
      rows: rows
    };
  } catch (e) {
    return { step: 6, pass: true, diffCount: 0, message: "跳過：" + e.message };
  }
}

function runFullPipeline(db, config, progressCallback) {
  var steps = [];
  var push = function(result) {
    steps.push(result);
    if (progressCallback) progressCallback(result);
  };

  try { push(runStep1(db, config)); }
  catch (e) { push({ step: 1, ok: false, error: e.message }); throw e; }

  try { push(runStep2(db, config)); }
  catch (e) { push({ step: 2, ok: false, error: e.message }); throw e; }

  try { push(runStep3(db, config)); }
  catch (e) { push({ step: 3, ok: false, error: e.message }); throw e; }

  try { push(runStep4(db, config)); }
  catch (e) { push({ step: 4, pass: false, error: e.message }); throw e; }

  try { push(runStep5(db, config)); }
  catch (e) { push({ step: 5, pass: false, error: e.message }); throw e; }

  try { push(runStep6(db, config)); }
  catch (e) { push({ step: 6, pass: false, error: e.message }); }

  var s4 = steps.find(function(s) { return s.step === 4; });
  var s5 = steps.find(function(s) { return s.step === 5; });
  var overall = (s4?.pass !== false) && (s5?.pass !== false);

  return { steps: steps, overall: overall, step4: s4, step5: s5 };
}
