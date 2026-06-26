# SQL 樣板方言

| 方言 | 路徑 | Driver |
|---|---|---|
| Oracle (預設) | `templates/*.sql` | oracledb / cx_Oracle |
| SQLite | `templates/sqlite/*.sql` | sqlite3 |

## 主要語法差異

| 功能 | Oracle | SQLite |
|---|---|---|
| Drop | `DROP TABLE x PURGE` | `DROP TABLE IF EXISTS x` |
| NULL | `NVL(x,0)` | `COALESCE(x,0)` |
| Limit | `ROWNUM <= 10` | `LIMIT 10` |
| Cast | `TO_CHAR(x)` | `CAST(x AS TEXT)` |
| COMMIT | 需要 | 不需要 |

## 切換方式
在 yaml 改 `sql_dir`:
```yaml
sql_dir: ../templates           # Oracle
sql_dir: ../templates/sqlite    # SQLite
```
