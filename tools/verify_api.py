#!/usr/bin/env python3
"""
Prove the API returns the same data the pages already get from the
.json files.

Mirrors each reader in src/index.js against a local SQLite copy of the
schema and seed, then deep-diffs the result against the original file.
If anything differs, the site would break after switching over, so this
must come back clean before any page is repointed.
"""

import json, sqlite3, os, sys

ROOT = "/home/claude/digitail-site"
SRC  = "/mnt/user-data/uploads"
DB   = "/tmp/verify.db"

if os.path.exists(DB):
    os.remove(DB)
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
con.executescript(open(f"{ROOT}/migrations/0001_initial.sql", encoding="utf-8").read())
con.executescript(open(f"{ROOT}/migrations/0002_seed.sql", encoding="utf-8").read())
con.commit()


def rows(sql):
    return [dict(r) for r in con.execute(sql).fetchall()]


def devlogs():
    tags = {}
    for t in rows("SELECT devlog_id, tag_name FROM devlog_tags ORDER BY devlog_id, position"):
        tags.setdefault(t["devlog_id"], []).append(t["tag_name"])
    return [{
        "id": r["id"], "sortDate": r["sort_date"], "displayDate": r["display_date"],
        "tags": tags.get(r["id"], []),
        "titleEn": r["title_en"], "titleMi": r["title_mi"],
        "snippetEn": r["snippet_en"], "snippetMi": r["snippet_mi"],
        "contentEn": r["content_en"], "contentMi": r["content_mi"],
        "image": r["image"],
    } for r in rows("SELECT * FROM devlogs WHERE published = 1 ORDER BY sort_date DESC, id DESC")]


def foxes():
    return [{
        "id": r["id"], "nameEn": r["name_en"], "nameMi": r["name_mi"], "year": r["year"],
        "packageEn": r["package_en"], "packageMi": r["package_mi"],
        "descEn": r["desc_en"], "descMi": r["desc_mi"],
        "bioEn": r["bio_en"], "bioMi": r["bio_mi"], "image": r["image"],
    } for r in rows("SELECT * FROM foxes ORDER BY id DESC")]


def team():
    return [{
        "id": r["id"], "nameEn": r["name_en"], "nameMi": r["name_mi"],
        "roleEn": r["role_en"], "roleMi": r["role_mi"],
        "bioEn": r["bio_en"], "bioMi": r["bio_mi"], "avatar": r["avatar"],
    } for r in rows("SELECT * FROM team ORDER BY sort_order, id")]


def social():
    tags = {}
    for t in rows("SELECT post_id, tag_name FROM social_tags ORDER BY post_id, position"):
        tags.setdefault(t["post_id"], []).append(t["tag_name"])
    return [{
        "id": r["id"], "platform": r["platform"], "title": r["title"], "date": r["date"],
        "url": r["url"], "thumbnail": r["thumbnail"], "description": r["description"],
        "tags": tags.get(r["id"], []),
    } for r in rows("SELECT * FROM social_posts ORDER BY date DESC, id DESC")]


def tags_():
    return [{"id": r["id"], "name": r["name"], "color": r["color"], "category": r["category"]}
            for r in rows("SELECT * FROM tags ORDER BY id")]


def setting(key):
    r = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(r["value"]) if r else None


READERS = {
    "devlogs": devlogs, "foxes": foxes, "team": team,
    "social": social, "tags": tags_,
    "homepage": lambda: setting("homepage"), "game": lambda: setting("game"),
}


def norm(o):
    """Order-insensitive for dict keys, order-sensitive for lists."""
    if isinstance(o, dict):
        return {k: norm(v) for k, v in sorted(o.items())}
    if isinstance(o, list):
        return [norm(v) for v in o]
    return o


def diff(a, b, path=""):
    out = []
    if type(a) is not type(b) and not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
        return [f"{path}: type {type(a).__name__} vs {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{path}.{k}: missing from API")
            elif k not in b:
                out.append(f"{path}.{k}: extra in API")
            else:
                out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{path}: length {len(a)} vs {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{path}[{i}]")
    elif a != b:
        sa, sb = str(a), str(b)
        out.append(f"{path}: {sa[:60]!r} vs {sb[:60]!r}")
    return out


print(f"{'content type':<14}{'file':>7}{'api':>7}   result")
print("-" * 64)
failures = 0

for name, reader in READERS.items():
    fname = f"{SRC}/{name}.json"
    if not os.path.exists(fname):
        print(f"{name:<14}{'-':>7}{'-':>7}   no source file, skipped")
        continue

    original = json.load(open(fname, encoding="utf-8"))
    api = reader()

    # The old files were in whatever order they were written. The API
    # sorts deliberately (newest first). Compare as sets keyed by id so
    # ordering differences don't register as data differences.
    if isinstance(original, list) and original and "id" in original[0]:
        o_by_id = {x["id"]: x for x in original}
        a_by_id = {x["id"]: x for x in api}
        problems = diff(norm(o_by_id), norm(a_by_id), name)
    else:
        problems = diff(norm(original), norm(api), name)

    n_o = len(original) if isinstance(original, list) else 1
    n_a = len(api) if isinstance(api, list) else 1

    if problems:
        failures += len(problems)
        print(f"{name:<14}{n_o:>7}{n_a:>7}   {len(problems)} DIFFERENCE(S)")
        for p in problems[:6]:
            print(f"                              {p}")
    else:
        print(f"{name:<14}{n_o:>7}{n_a:>7}   identical")

# ordering sanity check: newest devlog first
d = devlogs()
if d:
    ordered = all(d[i]["sortDate"] >= d[i+1]["sortDate"] for i in range(len(d)-1))
    print(f"\ndevlog ordering (newest first): {'correct' if ordered else 'WRONG'}")
    print(f"  newest: {d[0]['sortDate']}  {d[0]['titleEn'][:44]}")
    print(f"  oldest: {d[-1]['sortDate']}  {d[-1]['titleEn'][:44]}")
    if not ordered:
        failures += 1

print("\n" + "-" * 64)
print("RESULT:", "PASS - API output matches the existing files" if not failures
      else f"FAIL - {failures} difference(s)")
sys.exit(1 if failures else 0)
