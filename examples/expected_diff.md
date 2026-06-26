# Expected Diff（改版前由 AI 報案）

## 本次改版主題
（例：LGD 預設常數調整 + 新增例外行業 08/09）

## 影響範圍
### 將被修改的欄位
- LGD_VALUE：例外行業（08, 09）由 0.45 → 0.75
- K_VALUE：因 LGD 變動，自動連動調整

### 不應被影響的欄位
- CUST_ID, SS_SEQ（主鍵）
- EAD_AMT（曝險額）
- INDUSTRY_GROUP（分組結果）

### 影響資料範圍
```sql
WHERE SUBSTR(INDUSTRY_TYPE, 3, 2) IN ('08', '09')
```
預估影響筆數：約 1,200 筆 / 全表 350,000 筆 (0.34%)

## 預期差異
- Step 4：約 5~10 筆 EXCEPTION 樣本 DIFF_LGD 標記
- Step 5：SUM_WEIGHTED +0.05~0.15%

## 風險
- 例外行業判定條件改變會誤傷其他行業
