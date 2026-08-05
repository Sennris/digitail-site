#!/usr/bin/env python3
"""
Proves that re-running any migration against a populated database
cannot destroy content.

Builds a database from the migration files, adds content of the kind
that only exists in production (an admin account, a devlog written
after seeding, an edited homepage blob), then applies every migration
a second time and checks nothing was lost.

    python3 tools/test_migrations.py
"""

import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))

failures = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


def apply_file(conn, path, tolerate=False):
    """Run one migration. Returns the error message if it stopped early."""
    sql = path.read_text()
    try:
        conn.executescript(sql)
        conn.commit()
        return None
    except sqlite3.Error as e:
        conn.commit()
        if tolerate:
            return str(e)
        raise


def snapshot(conn):
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in tables}


print("Migration files found:")
for p in MIGRATIONS:
    print(f"  {p.name}")
print()

conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys = ON")

# ---- first run: build the database the way it was built for real ----------
print("First run (empty database):")
for p in MIGRATIONS:
    err = apply_file(conn, p, tolerate=True)
    check(f"{p.name} applies", err is None, f"-> {err}" if err else "")
print()

# ---- add the things that only exist in production -------------------------
conn.execute("INSERT INTO admin_users (email, password_hash, salt) "
             "VALUES ('cat@example.test', 'deadbeef', 'cafe')")
conn.execute("INSERT INTO devlogs (id, sort_date, display_date, title_en) "
             "VALUES (9001, '20260801', '1 August 2026', 'Written after seeding')")
conn.execute("INSERT INTO media (r2_key, url, filename) "
             "VALUES ('img/abc123.webp', '/media/img/abc123.webp', 'keyart.webp')")
conn.execute("UPDATE settings SET value = '{\"edited\":true}' WHERE key = 'homepage'")
conn.execute("INSERT INTO subscribers (email, status) "
             "VALUES ('someone@example.test', 'confirmed')")
conn.commit()

before = snapshot(conn)
homepage_before = conn.execute(
    "SELECT value FROM settings WHERE key='homepage'").fetchone()[0]
print("Live-ish content added. Row counts:")
for t, n in before.items():
    print(f"  {n:>4}  {t}")
print()

# ---- second run: this is the accident we are protecting against -----------
print("Second run (populated database — the dangerous case):")
errors = {}
for p in MIGRATIONS:
    err = apply_file(conn, p, tolerate=True)
    errors[p.name] = err
    if err:
        print(f"  note  {p.name} stopped early: {err}")
print()

after = snapshot(conn)
homepage_after = conn.execute(
    "SELECT value FROM settings WHERE key='homepage'").fetchone()[0]

print("Checks:")
check("no table was dropped",
      set(before) == set(after),
      f"missing: {set(before) - set(after)}" if set(before) - set(after) else "")

for t in before:
    if t in after:
        check(f"{t}: rows not lost", after[t] >= before[t],
              f"{before[t]} -> {after[t]}")

check("nothing grew except the new bootstrap flag",
      all(after.get(t, 0) == n for t, n in before.items() if t != "settings")
      and after.get("settings", 0) == before["settings"] + 1,
      str({t: (n, after.get(t)) for t, n in before.items() if after.get(t) != n}))

# A third pass must change nothing at all. If the migrations are truly
# idempotent the database has now reached a fixed point.
for p in MIGRATIONS:
    apply_file(conn, p, tolerate=True)
third = snapshot(conn)
check("third run changes nothing (fixed point)",
      third == after,
      str({t: (after.get(t), third.get(t)) for t in set(after) | set(third)
           if after.get(t) != third.get(t)}))

check("admin account survived",
      conn.execute("SELECT COUNT(*) FROM admin_users").fetchone()[0] == 1)

check("post-seed devlog survived",
      conn.execute("SELECT COUNT(*) FROM devlogs WHERE id=9001").fetchone()[0] == 1)

check("edited homepage settings not reverted to seed",
      homepage_after == homepage_before,
      "seed overwrote live value" if homepage_after != homepage_before else "")

check("uploaded media row survived",
      conn.execute("SELECT COUNT(*) FROM media").fetchone()[0] == 1)

check("newsletter subscriber survived",
      conn.execute("SELECT COUNT(*) FROM subscribers").fetchone()[0] == 1)

check("admin setup is latched shut",
      conn.execute("SELECT COUNT(*) FROM settings "
                   "WHERE key='admin_bootstrapped'").fetchone()[0] == 1)

ledger = {r[0] for r in conn.execute("SELECT filename FROM schema_migrations")}
check("ledger recorded every migration",
      ledger == {p.name for p in MIGRATIONS},
      f"ledger={sorted(ledger)}")

print()
if failures:
    print(f"{len(failures)} check(s) failed:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

print("All checks passed. Every migration is safe to re-run.")
if any(errors.values()):
    print("\nFiles that stop early on a second run (loud, but harmless):")
    for name, err in errors.items():
        if err:
            print(f"  {name}: {err}")
