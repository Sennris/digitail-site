#!/usr/bin/env python3
"""
Rebuild the page stylesheets from the original HTML, correctly this time.

Two bugs being fixed:

  1. The Phase 0 parser keyed rules by selector in a dict and did not
     separate @media blocks, so a mobile override like
     `.card { transform: rotate(0deg) }` silently destroyed the real
     top-level `.card` rule that carried `display: flex`.

  2. The design pass then stripped whole selectors from the page CSS so
     core.css could take over. That threw away layout along with colour.

The fix: split by PROPERTY, not by selector. core.css owns the visual
properties. The page keeps anything structural.
"""

import re, os

SRC  = "/mnt/user-data/uploads"
DEST = "/home/claude/digitail-site/public/assets/css/pages"
PAGES = ["index", "about", "devlogs", "foxes", "game", "social", "thankyou"]

# Selectors core.css now styles. For these, drop visual properties from
# the page copy but keep everything structural.
CORE_OWNED = re.compile(
    r'^(\.card|\.card:hover|\.card h3|\.card p|\.card \.pre-title|'
    r'\.image-placeholder|\.hero-section|\.hero-section h1|\.hero-section p|'
    r'footer|\.btn-rugged|\.btn-rugged:hover|\.read-more|\.read-more:hover|'
    r'\.card:nth-child\([^)]*\))$'
)

VISUAL = re.compile(
    r'^(background|background-[\w-]+|color|border|border-[\w-]+|box-shadow|'
    r'font|font-[\w-]+|text-[\w-]+|letter-spacing|line-height|transform|'
    r'transition|opacity|backdrop-filter|filter|animation|animation-[\w-]+)$'
)


def split_top_and_at(css):
    """Return (top_level_css, [at_blocks]) without conflating the two."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    at_blocks, out, i, n = [], [], 0, len(css)
    while i < n:
        if css[i] == '@':
            j, depth, started = i, 0, False
            while j < n:
                if css[j] == '{':
                    depth += 1
                    started = True
                elif css[j] == '}':
                    depth -= 1
                    if started and depth == 0:
                        j += 1
                        break
                j += 1
            at_blocks.append(css[i:j])
            i = j
        else:
            out.append(css[i])
            i += 1
    return "".join(out), at_blocks


def rules_of(css):
    """Ordered list of (selector, [(prop, value), ...]). Duplicates kept."""
    result = []
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css, re.S):
        sel = " ".join(m.group(1).split())
        if not sel:
            continue
        decls = []
        for d in m.group(2).split(';'):
            if ':' not in d:
                continue
            prop, _, val = d.partition(':')
            decls.append((prop.strip(), val.strip()))
        if decls:
            result.append((sel, decls))
    return result


print(f"{'page':<12}{'rules in':>10}{'kept':>7}{'props dropped':>16}")
print("-" * 46)

for name in PAGES:
    path = f"{SRC}/{name}.html"
    if not os.path.exists(path):
        continue
    html = open(path, encoding="utf-8").read()
    css = "\n".join(re.findall(r'<style>(.*?)</style>', html, re.S))

    top, at_blocks = split_top_and_at(css)
    rules = rules_of(top)

    out = [f"/* {name}.html - page specific styles.\n"
           f"   Visual design lives in ../core.css. This file keeps layout,\n"
           f"   structure and anything unique to this page. */\n\n"]

    kept_rules = dropped_props = 0
    for sel, decls in rules:
        if CORE_OWNED.match(sel):
            decls = [(p, v) for p, v in decls if not VISUAL.match(p)]
            dropped_props += 1
        if not decls:
            continue
        kept_rules += 1
        body = "\n".join(f"    {p}: {v};" for p, v in decls)
        out.append(f"{sel} {{\n{body}\n}}\n\n")

    # media and keyframes blocks go through untouched, in their own section
    if at_blocks:
        out.append("\n/* ---- responsive and animation blocks ---- */\n\n")
        out.extend(b.strip() + "\n\n" for b in at_blocks)

    open(f"{DEST}/{name}.css", "w", encoding="utf-8").write("".join(out))
    print(f"{name:<12}{len(rules):>10}{kept_rules:>7}{dropped_props:>16}")

print("-" * 46)
print("Page CSS rebuilt from the original sources.")
