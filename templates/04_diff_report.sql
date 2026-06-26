-- Oracle: Step 4 Diff Report (must return 0 rows)
SELECT SAMPLE_TYPE, {{PK_COL_1}}, {{PK_COL_2}}
FROM {{COMPARE_TABLE}}
WHERE NVL(TO_CHAR(OLD_{{BIZ_COL_1}}),'#') <> NVL(TO_CHAR(NEW_{{BIZ_COL_1}}),'#')
   OR NVL(OLD_{{BIZ_COL_2}},-1) <> NVL(NEW_{{BIZ_COL_2}},-1)
   OR NVL(OLD_{{BIZ_COL_3}},-1) <> NVL(NEW_{{BIZ_COL_3}},-1)
   OR ABS(NVL(OLD_{{BIZ_COL_4}},0) - NVL(NEW_{{BIZ_COL_4}},0)) > {{NUMERIC_TOL}}
   OR ABS(NVL(OLD_{{BIZ_COL_5}},0) - NVL(NEW_{{BIZ_COL_5}},0)) > {{NUMERIC_TOL}}
   OR NVL(OLD_{{BRANCH_COL}},'#') <> NVL(NEW_{{BRANCH_COL}},'#');
