#!/usr/bin/env python3
"""
Round trip test for the write path.

Mirrors the SQL in src/writers.js and src/index.js against a local
SQLite copy, then checks that whatever the admin panel saves comes back
out of the reader identical. This is the check that matters: a save that
quietly drops a field or a tag would corrupt real content.
"""

import json, sqlite3, os, sys, copy

ROOT = "/home/claude/digitail-site"
DB   = "/tmp/roundtrip.db"

if os.path.exists(DB):
    os.remove(DB)
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
for f in ["0001_initial.sql", "0002_seed.sql", "0003_auth.sql"]:
    con.executescript(open(f"{ROOT}/migrations/{f}", encoding="utf-8").read())
con.commit()

s = lambda v: "" if v is None else str(v)
n = lambda v: int(v) if str(v).lstrip("-").isdigit() else 0


# ---------- writers (mirror of src/writers.js) ----------

def put_devlogs(items):
    con.execute("DELETE FROM devlog_tags")
    con.execute("DELETE FROM devlogs")
    for d in items:
        con.execute(
            """INSERT INTO devlogs (id, sort_date, display_date, title_en, title_mi,
               snippet_en, snippet_mi, content_en, content_mi, image, published)
               VALUES (?,?,?,?,?,?,?,?,?,?,1)""",
            (n(d.get("id")), s(d.get("sortDate")), s(d.get("displayDate")),
             s(d.get("titleEn")), s(d.get("titleMi")), s(d.get("snippetEn")),
             s(d.get("snippetMi")), s(d.get("contentEn")), s(d.get("contentMi")),
             s(d.get("image"))))
        for i, t in enumerate(d.get("tags") or []):
            con.execute("INSERT INTO devlog_tags (devlog_id, tag_name, position) VALUES (?,?,?)",
                        (n(d.get("id")), s(t), i))
    con.commit()


def put_setting(key, value):
    con.execute("""INSERT INTO settings (key, value) VALUES (?,?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
                (key, json.dumps(value, ensure_ascii=False, separators=(',', ':'))))
    con.commit()


# ---------- readers (mirror of src/index.js) ----------

def get_devlogs():
    tags = {}
    for r in con.execute("SELECT devlog_id, tag_name FROM devlog_tags ORDER BY devlog_id, position"):
        tags.setdefault(r["devlog_id"], []).append(r["tag_name"])
    return [{
        "id": r["id"], "sortDate": r["sort_date"], "displayDate": r["display_date"],
        "tags": tags.get(r["id"], []),
        "titleEn": r["title_en"], "titleMi": r["title_mi"],
        "snippetEn": r["snippet_en"], "snippetMi": r["snippet_mi"],
        "contentEn": r["content_en"], "contentMi": r["content_mi"], "image": r["image"],
    } for r in con.execute(
        "SELECT * FROM devlogs WHERE published = 1 ORDER BY sort_date DESC, id DESC")]


def get_setting(key):
    r = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(r["value"]) if r else None


# ---------- the tests ----------

passed = failed = 0

def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}" + (f"\n          {detail}" if detail else ""))


def by_id(items):
    return {x["id"]: x for x in items}


print("WRITE PATH ROUND TRIP")
print("-" * 66)

# 1. save the existing content back unchanged, nothing should shift
before = get_devlogs()
put_devlogs(copy.deepcopy(before))
after = get_devlogs()
check("saving unchanged content changes nothing", by_id(before) == by_id(after),
      f"{len(before)} in, {len(after)} out")

# 2. edit a devlog
edited = copy.deepcopy(before)
edited[0]["titleEn"] = "Edited Title With 'quotes' and \"doubles\""
edited[0]["contentEn"] = "<p>HTML body with <strong>tags</strong> & an ampersand</p>"
put_devlogs(edited)
got = by_id(get_devlogs())[edited[0]["id"]]
check("edits persist, quotes and HTML survive",
      got["titleEn"] == edited[0]["titleEn"] and got["contentEn"] == edited[0]["contentEn"],
      f"got {got['titleEn']!r}")

# 3. add a new devlog with te reo and macrons
new = {
    "id": 999, "sortDate": "20260804", "displayDate": "4 August 2026",
    "tags": ["Code", "Art", "Bug"],
    "titleEn": "Brand New Devlog", "titleMi": "He Rātaka Hōu",
    "snippetEn": "snippet", "snippetMi": "kōrero poto",
    "contentEn": "content", "contentMi": "Ngā kōrero mō te whanaketanga",
    "image": "",
}
plus = copy.deepcopy(edited) + [new]
put_devlogs(plus)
back = by_id(get_devlogs())
check("new devlog saved", 999 in back)
check("macrons survive the round trip",
      back.get(999, {}).get("contentMi") == new["contentMi"],
      f"got {back.get(999, {}).get('contentMi')!r}")
check("tag order preserved", back.get(999, {}).get("tags") == ["Code", "Art", "Bug"],
      f"got {back.get(999, {}).get('tags')}")

# 4. delete a devlog
minus = [d for d in plus if d["id"] != 999]
put_devlogs(minus)
check("delete removes the devlog", 999 not in by_id(get_devlogs()))
orphans = con.execute("SELECT COUNT(*) AS n FROM devlog_tags WHERE devlog_id = 999").fetchone()["n"]
check("delete cleans up its tags too", orphans == 0, f"{orphans} orphaned tag rows")

# 5. nested settings object survives
hp = get_setting("homepage")
hp["hero"]["titleEn"] = "Changed Hero"
hp["communityLinks"][0]["textEn"] = "Line one\nLine two with a newline"
put_setting("homepage", hp)
back_hp = get_setting("homepage")
check("nested settings object round trips", back_hp == hp)
check("newlines inside settings survive",
      "\n" in back_hp["communityLinks"][0]["textEn"])

# 6. empty collection
put_devlogs([])
check("saving an empty list clears the table", get_devlogs() == [])
check("no tag rows left behind",
      con.execute("SELECT COUNT(*) AS n FROM devlog_tags").fetchone()["n"] == 0)

# 7. restore and confirm we're back where we started
put_devlogs(copy.deepcopy(before))
check("restore returns the original 20 devlogs", by_id(get_devlogs()) == by_id(before))

print("-" * 66)
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
