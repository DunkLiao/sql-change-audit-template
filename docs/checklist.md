# 改版檢查清單

## 改版前
- [ ] Git 開新分支（`git switch -c feature/xxx`）
- [ ] Step 1 baseline 跑完，產出 TMP_BASELINE_Vxxxx
- [ ] Step 2 sample 跑完，產出 TMP_GOLDEN_SAMPLE
- [ ] expected_diff.md 寫好

## 改版中
- [ ] 用 AI Prompt 模板
- [ ] 要求 AI 改前報案
- [ ] 一次只改一件事

## 改版後驗收
- [ ] Step 3 dual_run 跑完
- [ ] Step 4 diff_report 回傳 0 筆
- [ ] Step 5 各指標在容忍度內：
  - [ ] CNT DIFF = 0
  - [ ] SUM_AMT DIFF_PCT < 0.001%
  - [ ] SUM_WEIGHTED DIFF_PCT < 0.01%
  - [ ] GROUP_CNT 一致
- [ ] actual_diff_review.md 簽核
- [ ] git commit + push + 開 PR
