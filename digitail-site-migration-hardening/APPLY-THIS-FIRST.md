# Migration hardening — how to apply

This zip contains **only changed and new files**. Nothing else is in it,
so nothing else can be overwritten. `wrangler.toml` is deliberately
absent, as always.

## 1. Unzip over `Documents/digitail-site`

Overwrite when asked. The paths in the zip match the repo.

## 2. Run the new migration

```
npx wrangler d1 execute digitail --remote --file=./migrations/0006_migration_ledger.sql
```

This creates the ledger, backfills it by inspecting what your database
actually has, and — if an admin account exists — locks `/admin/setup.html`
shut. It reads the real schema rather than assuming, so it is correct
whether or not 0005 was ever applied.

## 3. Check what it found

```
npx wrangler d1 execute digitail --remote --command="SELECT filename, note FROM schema_migrations"
```

If `0005_tags_and_users.sql` is **not** listed, that migration was never
run — apply it now:

```
npx wrangler d1 execute digitail --remote --file=./migrations/0005_tags_and_users.sql
```

## 4. Push

```
git add .
git commit -m "Harden migrations against re-running; latch admin setup shut"
git push
```

## 5. Check the live site

- `/api/health` still reports everything wired up
- log in to `/admin/` with your existing password (unchanged)
- `/admin/setup.html` should refuse to create an account

## Run the tests any time

```
python3 tools/test_migrations.py
node --experimental-sqlite tools/test_setup_gate.mjs
```
