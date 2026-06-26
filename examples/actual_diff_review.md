# Actual Diff Review（改版後實際驗收）

## 改版日期
2026-06-26

## 改了哪些檔案
- views/V_LGD_CALC.sql 第 45 行 CASE WHEN 新增 08, 09
- config/lgd_const.sql 新增兩筆常數設定

## 實際 vs 預期
| METRIC | 實際 | 預期 | 結果 |
|---|---|---|---|
| CNT | 0 | 0 | ✅ |
| SUM_AMT | 0 | 0 | ✅ |
| SUM_WEIGHTED | +0.087% | 0.05~0.15% | ✅ |

## 結論
✅ 通過驗收，可合併至 main 分支。

## 簽核
- 開發：____________
- 覆核：____________
- 日期：2026-06-26
