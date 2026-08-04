#!/usr/bin/env python3
"""Turn the existing .json content files into a D1 seed migration."""

import json, os

SRC = "/mnt/user-data/uploads"
OUT = "/home/claude/digitail-site/migrations/0002_seed.sql"


def q(v):
    if v is None:
        return "''"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def load(name):
    p = f"{SRC}/{name}.json"
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


lines = ["-- ============================================================",
         "-- Seed data migrated from the original JSON content files",
         "-- Generated, do not hand edit. Re-run tools/make_seed.py instead.",
         "-- ============================================================", ""]

# ---- tags ----
tags = load("tags") or []
if tags:
    lines.append("-- tags")
    for t in tags:
        lines.append("INSERT INTO tags (id, name, color, category) VALUES "
                     f"({q(t['id'])}, {q(t.get('name'))}, {q(t.get('color', '#5DCCCA'))}, "
                     f"{q(t.get('category', 'general'))});")
    lines.append("")

# ---- devlogs ----
devlogs = load("devlogs") or []
if devlogs:
    lines.append("-- devlogs")
    for d in devlogs:
        lines.append(
            "INSERT INTO devlogs (id, sort_date, display_date, title_en, title_mi, "
            "snippet_en, snippet_mi, content_en, content_mi, image) VALUES ("
            f"{q(d['id'])}, {q(d.get('sortDate', ''))}, {q(d.get('displayDate', ''))}, "
            f"{q(d.get('titleEn', ''))}, {q(d.get('titleMi', ''))}, "
            f"{q(d.get('snippetEn', ''))}, {q(d.get('snippetMi', ''))}, "
            f"{q(d.get('contentEn', ''))}, {q(d.get('contentMi', ''))}, "
            f"{q(d.get('image', ''))});")
    lines.append("")
    lines.append("-- devlog tags")
    for d in devlogs:
        for i, t in enumerate(d.get("tags", []) or []):
            lines.append("INSERT INTO devlog_tags (devlog_id, tag_name, position) VALUES "
                         f"({q(d['id'])}, {q(t)}, {i});")
    lines.append("")

# ---- foxes ----
foxes = load("foxes") or []
if foxes:
    lines.append("-- foxes")
    for f in foxes:
        lines.append(
            "INSERT INTO foxes (id, name_en, name_mi, year, package_en, package_mi, "
            "desc_en, desc_mi, bio_en, bio_mi, image) VALUES ("
            f"{q(f['id'])}, {q(f.get('nameEn', ''))}, {q(f.get('nameMi', ''))}, "
            f"{q(f.get('year', 0))}, {q(f.get('packageEn', ''))}, {q(f.get('packageMi', ''))}, "
            f"{q(f.get('descEn', ''))}, {q(f.get('descMi', ''))}, "
            f"{q(f.get('bioEn', ''))}, {q(f.get('bioMi', ''))}, {q(f.get('image', ''))});")
    lines.append("")

# ---- team ----
team = load("team") or []
if team:
    lines.append("-- team")
    for i, t in enumerate(team):
        lines.append(
            "INSERT INTO team (id, name_en, name_mi, role_en, role_mi, bio_en, bio_mi, "
            "avatar, sort_order) VALUES ("
            f"{q(t['id'])}, {q(t.get('nameEn', ''))}, {q(t.get('nameMi', ''))}, "
            f"{q(t.get('roleEn', ''))}, {q(t.get('roleMi', ''))}, "
            f"{q(t.get('bioEn', ''))}, {q(t.get('bioMi', ''))}, "
            f"{q(t.get('avatar', ''))}, {i});")
    lines.append("")

# ---- social ----
social = load("social") or []
if social:
    lines.append("-- social posts")
    for s in social:
        lines.append(
            "INSERT INTO social_posts (id, platform, title, date, url, thumbnail, "
            "description) VALUES ("
            f"{q(s['id'])}, {q(s.get('platform', ''))}, {q(s.get('title', ''))}, "
            f"{q(s.get('date', ''))}, {q(s.get('url', ''))}, "
            f"{q(s.get('thumbnail', ''))}, {q(s.get('description', ''))});")
        for i, t in enumerate(s.get("tags", []) or []):
            lines.append("INSERT INTO social_tags (post_id, tag_name, position) VALUES "
                         f"({q(s['id'])}, {q(t)}, {i});")
    lines.append("")
else:
    lines.append("-- social posts: none yet\n")

# ---- settings blobs ----
lines.append("-- settings (nested config objects kept whole)")
for key, fname in [("homepage", "homepage"), ("game", "game")]:
    obj = load(fname)
    if obj is not None:
        blob = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
        lines.append(f"INSERT INTO settings (key, value) VALUES ({q(key)}, {q(blob)});")

open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"wrote {OUT}")
print(f"  tags     {len(tags)}")
print(f"  devlogs  {len(devlogs)}  (+{sum(len(d.get('tags') or []) for d in devlogs)} tag links)")
print(f"  foxes    {len(foxes)}")
print(f"  team     {len(team)}")
print(f"  social   {len(social)}")
print(f"  settings 2 (homepage, game)")
