---
name: safe-migration
description: Safety check for Django migrations before running migrate on this machine's production database. Whenever you want to run makemigrations or migrate, or a new file in */migrations/ is created or reviewed, run this skill first. Invoke at most once per session; re-invoke only if it is no longer in context.
---

# Safe migration

The local database (`warehouse_db` on 127.0.0.1:5432) is the production database. Hard project rule: **no data may be lost.**

All commands run in the `warehouse-backend` folder.

## 1. Models and migrations in sync
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py makemigrations --check --dry-run
```
"No changes detected" means no migration has been left out.

## 2. Unapplied migrations
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py showmigrations --plan | grep -F "[ ]"
```
Empty output means there is nothing to migrate and the work ends here.

**Warning:** empty output sometimes lies. The `django_migrations` table has old records from before the squash (e.g. `accounts` from `0006` to `0034`). A new migration whose name matches one of them is assumed "applied" and never runs.

## 2-b. New migration name colliding with `django_migrations`
Before migrate, check every migration on disk against the table's records. The definitive sign of a collision is that the same-named record was recorded **before that migration's same-app dependencies**; a real migration is never applied earlier than its dependency (cross-app dependencies are not checked because of the old fake records):
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c "
from django.db import connection
from django.db.migrations.loader import MigrationLoader
loader = MigrationLoader(connection)
with connection.cursor() as c:
    c.execute('select app, name, applied from django_migrations')
    applied = {(a, n): t for a, n, t in c.fetchall()}
for key, mig in sorted(loader.disk_migrations.items()):
    deps = [d for d in mig.dependencies if d in applied and d[0] == key[0]]
    if key in applied and deps and applied[key] < max(applied[d] for d in deps):
        print('COLLISION', key, 'applied', applied[key].date(), 'before its dependency', max(deps, key=applied.get))
"
```
Each `COLLISION` line means that migration has never run. Make its name unique (e.g. `0006_<description>`) and run step 2 again.

## 3. Check for destructive operations
Read every unapplied migration and look for these operations:
- `RemoveField` and `DeleteModel`
- `AlterField`: type change, shortened `max_length`, or `null=False` without `default`
- `RenameField` and `RenameModel`
- `RunSQL` and `RunPython`: missing `reverse_code`, or deleting and rewriting data
- `AlterUniqueTogether` and `AddConstraint`: may fail on existing data
- `SeparateDatabaseAndState`: check the `database_operations` part separately

Also look at the actual SQL:
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py sqlmigrate <app> <migration_name>
```
Watch for `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN ... TYPE`, `DELETE` and `TRUNCATE`. For a deeper review, use the `data-loss-reviewer` subagent.

## 4. Decision
- **No destructive operations:** take a backup (step 5). Then get the user's permission to migrate the production database with one short yes/no question.
- **With destructive operations:** do not run it. Tell the user exactly which column, table or data will be lost. Propose the safe path (expand-contract): first the new column and a data copy, and the removal in a later migration.

## 5. Backup before migrate (mandatory by guard hook)
The guard hook `.claude/hooks/guard.py` blocks any execution of `manage.py migrate` unless a non-empty `.dump` file with a corresponding `.meta.json` with an age of **less than 15 minutes** exists in `warehouse-backend/backups/db/`.

Do not run `run_auto_backup`, because it deletes all backups except the last 7. Instead, create just one standalone backup:
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-migrate'); print(m['filename'], m['size'])"
```
The file is created in `warehouse-backend/backups/db/` and authorization to run migrate will be open for 15 minutes.

## 6. After migrate
```bash
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py check
PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py showmigrations --plan | grep -F "[ ]"
```
Report the result briefly.
