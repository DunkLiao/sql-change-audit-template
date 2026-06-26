-- Oracle: Step 3 Dual Run
DROP TABLE {{COMPARE_TABLE}} PURGE;
CREATE TABLE {{COMPARE_TABLE}} AS
SELECT s.SAMPLE_TYPE,
       COALESCE(o.{{PK_COL_1}}, n.{{PK_COL_1}}) AS {{PK_COL_1}},
       COALESCE(o.{{PK_COL_2}}, n.{{PK_COL_2}}) AS {{PK_COL_2}},
       o.{{BIZ_COL_1}} AS OLD_{{BIZ_COL_1}}, n.{{BIZ_COL_1}} AS NEW_{{BIZ_COL_1}},
       o.{{BIZ_COL_2}} AS OLD_{{BIZ_COL_2}}, n.{{BIZ_COL_2}} AS NEW_{{BIZ_COL_2}},
       o.{{BIZ_COL_3}} AS OLD_{{BIZ_COL_3}}, n.{{BIZ_COL_3}} AS NEW_{{BIZ_COL_3}},
       o.{{BIZ_COL_4}} AS OLD_{{BIZ_COL_4}}, n.{{BIZ_COL_4}} AS NEW_{{BIZ_COL_4}},
       o.{{BIZ_COL_5}} AS OLD_{{BIZ_COL_5}}, n.{{BIZ_COL_5}} AS NEW_{{BIZ_COL_5}},
       o.{{BRANCH_COL}} AS OLD_{{BRANCH_COL}}, n.{{BRANCH_COL}} AS NEW_{{BRANCH_COL}}
FROM {{SAMPLE_TABLE}} s
LEFT JOIN {{BASELINE_TABLE}} o ON o.{{PK_COL_1}} = s.{{PK_COL_1}} AND o.{{PK_COL_2}} = s.{{PK_COL_2}}
LEFT JOIN {{NEW_SQL_OR_VIEW}} n ON n.{{PK_COL_1}} = s.{{PK_COL_1}} AND n.{{PK_COL_2}} = s.{{PK_COL_2}};
COMMIT;
