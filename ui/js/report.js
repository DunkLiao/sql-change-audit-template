// 報告產生器 – 支援動態欄位

function generateMarkdownReport(runResult, config) {
  var now = new Date().toLocaleString();
  var overall = runResult.overall ? "通過" : "未通過";

  var md = [];
  md.push("# SQL 變更審計報告");
  md.push("");
  md.push("**產生時間：** " + now);
  md.push("**審計結果：** " + overall);
  md.push("");

  var t = (config && config.tables) ? config.tables : {};

  md.push("## 設定摘要");
  md.push("");
  md.push("| 設定項目 | 值 |");
  md.push("|---|---|");
  md.push("| 來源資料表 | " + (t.sourceTable || "-") + " |");
  md.push("| 舊版 View | " + (t.oldView || "-") + " |");
  md.push("| 新版 View | " + (t.newView || "-") + " |");
  if (config) {
    md.push("| 主鍵欄位 | " + (config.pkColumns || []).filter(Boolean).join(", ") + " |");
    var bizNames = (config.bizColumns || []).filter(function(c) { return c.name; }).map(function(c) { return c.name; });
    md.push("| 業務欄位 | " + bizNames.join(", ") + " |");
    md.push("| 彙總指標 | " + (config.aggregateMetrics || []).filter(function(m) { return m.metric; }).map(function(m) { return m.metric; }).join(", ") + " |");
  }
  md.push("");

  md.push("## 步驟 4：逐列差異比對");
  md.push("");
  var s4 = runResult.step4;
  if (s4) {
    md.push("**狀態：** " + (s4.pass ? "通過" : "未通過"));
    md.push("**差異列數：** " + (s4.diffCount != null ? s4.diffCount : "N/A"));
    md.push("");
    if (s4.rows && s4.rows.length > 0 && s4.columns) {
      md.push("| " + s4.columns.join(" | ") + " |");
      md.push("|" + s4.columns.map(function() { return "---"; }).join("|") + "|");
      s4.rows.forEach(function(row) {
        md.push("| " + row.map(function(v) { return v === null ? "NULL" : String(v); }).join(" | ") + " |");
      });
      md.push("");
    }
  } else {
    md.push("**狀態：** 錯誤"); md.push("");
  }

  md.push("## 步驟 5：彙總指標檢查");
  md.push("");
  var s5 = runResult.step5;
  if (s5 && s5.judged && s5.judged.length) {
    md.push("**狀態：** " + (s5.pass ? "通過" : "未通過"));
    md.push("");
    md.push("| 指標 | 舊值 | 新值 | 差異 | 差異% | 狀態 | 原因 |");
    md.push("|---|---|---|---|---|---|---|");
    s5.judged.forEach(function(r) {
      md.push("| " + [
        r.metric, r.oldVal != null ? String(r.oldVal) : "-", r.newVal != null ? String(r.newVal) : "-",
        r.diff != null ? String(r.diff) : "-", r.diffPct != null ? String(r.diffPct) : "-",
        r.status, r.reason
      ].join(" | ") + " |");
    });
    md.push("");
  } else {
    md.push("**狀態：** 錯誤"); md.push("");
  }

  md.push("## 步驟 6：分組分類差異");
  md.push("");
  var s6 = runResult.step6 || (runResult.steps && runResult.steps.find(function(s) { return s.step === 6; }));
  if (s6) {
    md.push("**狀態：** " + (s6.pass ? "通過" : "未通過"));
    md.push("**變更組數：** " + (s6.diffCount != null ? s6.diffCount : "N/A"));
    md.push("");
  }

  md.push("---");
  md.push("*由 SQL 變更審計工具自動產生*");
  return md.join("\n");
}

function generateHtmlReport(runResult, config) {
  var md = generateMarkdownReport(runResult, config);
  var html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^\*\*(.+?)\*\*/gm, "<strong>$1</strong>")
    .replace(/^\|(.+)\|$/gm, function(line) {
      if (line.includes("---")) return "";
      var cells = line.split("|").filter(function(c) { return c.trim(); }).map(function(c) { return "<td>" + c.trim() + "</td>"; });
      return "<tr>" + cells.join("") + "</tr>";
    })
    .replace(/^---$/gm, "<hr>")
    .replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, function(match) {
    return "<table border='1' cellpadding='4' cellspacing='0'>" + match + "</table>";
  });

  return "<!DOCTYPE html>\n<html lang='zh-TW'>\n<head>\n<meta charset='UTF-8'>\n<title>SQL 變更審計報告</title>\n<style>\nbody{font-family:-apple-system,'Microsoft JhengHei',sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#212529}\ntable{border-collapse:collapse;width:100%;margin:16px 0}\ntd,th{padding:8px 12px;border:1px solid #dee2e6;text-align:left}\ntr:nth-child(even){background:#f8f9fa}\nh1{border-bottom:2px solid #2563eb;padding-bottom:8px;color:#2563eb}\nh2{border-bottom:1px solid #dee2e6;padding-bottom:4px}\n</style>\n</head>\n<body>\n" + html + "\n</body>\n</html>";
}
