// 容忍度判斷 – 移植自 scripts/audit_runner.py _judge()
function judge(metric, diff, diffPct, tolerance) {
  if (!tolerance) {
    return { status: "SKIP", reason: "未設定容忍度" };
  }
  const d = (diff != null) ? Number(diff) : 0.0;

  if (tolerance.max_abs_diff != null && Math.abs(d) > tolerance.max_abs_diff) {
    return { status: "FAIL", reason: `|差異|=${Math.abs(d)} > ${tolerance.max_abs_diff}` };
  }

  if (tolerance.max_pct_diff != null) {
    const p = (diffPct != null) ? Number(diffPct) : 0.0;
    if (Math.abs(p) > tolerance.max_pct_diff) {
      return { status: "FAIL", reason: `|差異%|=${Math.abs(p)}% > ${tolerance.max_pct_diff}%` };
    }
  }

  return { status: "PASS", reason: "在容忍度內" };
}

// 對所有 Step 5 結果進行容忍度判定
function judgeAll(results, tolerances) {
  const tolMap = {};
  tolerances.forEach(t => { tolMap[t.metric.toUpperCase()] = t; });

  let overall = true;
  const judged = results.map(row => {
    const metric = String(row.METRIC || "").toUpperCase();
    const diff = row.DIFF;
    const diffPct = row.DIFF_PCT;
    const result = judge(metric, diff, diffPct, tolMap[metric]);
    if (result.status !== "PASS") overall = false;
    return {
      metric: metric,
      oldVal: row.OLD_VAL,
      newVal: row.NEW_VAL,
      diff: diff,
      diffPct: diffPct,
      status: result.status,
      reason: result.reason
    };
  });

  return { overall, judged };
}
