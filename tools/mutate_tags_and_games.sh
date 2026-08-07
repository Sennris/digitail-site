#!/usr/bin/env bash
# Mutation test for tools/test_tags_and_games.mjs.
# Path-flattened backups; compares PASS COUNTS, not just exit codes.
#   bash tools/mutate_tags_and_games.sh
set -u
cd "$(dirname "$0")/.."
SUITE="tools/test_tags_and_games.mjs"
BASELINE=$(node $SUITE 2>/dev/null | tail -1 | grep -oE '[0-9]+' | head -1)
node $SUITE >/dev/null 2>&1 || { echo "Suite fails before any mutation."; exit 1; }
echo "Baseline: $BASELINE checks pass."; echo
BK=$(mktemp -d); caught=0; missed=0; missed_list=()

mutate() {
    local label="$1" file="$2" old="$3" new="$4"
    local flat; flat=$(echo "$file" | tr / _); cp "$file" "$BK/$flat"
    python3 - "$file" "$old" "$new" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
if sys.argv[2] not in t:
    sys.stderr.write("ANCHOR-MISSING\n"); sys.exit(2)
p.write_text(t.replace(sys.argv[2], sys.argv[3], 1))
PY
    if [ $? -ne 0 ]; then
        echo "  ????     $label  (anchor not found)"; missed=$((missed+1))
        missed_list+=("$label [anchor]"); cp "$BK/$flat" "$file"; return
    fi
    local out passes code
    out=$(node $SUITE 2>&1); code=$?
    passes=$(echo "$out" | tail -1 | grep -oE '[0-9]+' | head -1); [ -z "$passes" ] && passes=0
    cp "$BK/$flat" "$file"
    if [ "$code" -ne 0 ] && [ "$passes" -lt "$BASELINE" ]; then
        echo "  CAUGHT   $label  ($passes/$BASELINE still passing)"; caught=$((caught+1))
    elif [ "$code" -ne 0 ]; then
        echo "  CRASH    $label"; missed=$((missed+1)); missed_list+=("$label [crash]")
    else
        echo "  MISSED   $label"; missed=$((missed+1)); missed_list+=("$label")
    fi
}

echo "The bilingual badge:"
mutate "the te reo span is dropped entirely" \
    public/assets/js/pages/devlogs.js \
    "span.append(en, mi);" "span.append(en);"
mutate "a blank te reo label leaves the badge empty" \
    public/assets/js/pages/devlogs.js \
    "mi.textContent = tagLabels.get(name.toLowerCase()) || name;" \
    "mi.textContent = tagLabels.get(name.toLowerCase()) || '';"
mutate "the lookup stops ignoring case" \
    public/assets/js/pages/devlogs.js \
    "mi.textContent = tagLabels.get(name.toLowerCase()) || name;" \
    "mi.textContent = tagLabels.get(name) || name;"
mutate "the te reo span shows English instead of the label" \
    public/assets/js/pages/devlogs.js \
    "mi.textContent = tagLabels.get(name.toLowerCase()) || name;" \
    "mi.textContent = name;"
mutate "the name is pasted into markup again" \
    public/assets/js/pages/devlogs.js \
    "en.textContent = name;" "en.innerHTML = name;"
mutate "the primary badge loses its class" \
    public/assets/js/pages/devlogs.js \
    "span.className = 'tag-badge' + (extraClass ? ' ' + extraClass : '');" \
    "span.className = 'tag-badge';"

echo
echo "One shared fetch:"
mutate "the filter buttons go back to their own fetch" \
    public/assets/js/pages/devlogs.js \
    "buildFilterButtons(tags);" \
    "fetch('/api/content/tags').then(r => r.json()).then(buildFilterButtons);"
mutate "a failed tags fetch is no longer caught" \
    public/assets/js/pages/devlogs.js \
    "            .catch(() => null);" "            ;"
mutate "a non-array tags result is trusted" \
    public/assets/js/pages/devlogs.js \
    "(Array.isArray(tags) ? tags : []).forEach" "(tags || []).forEach"
mutate "an empty filter row can be published" \
    public/assets/js/pages/devlogs.js \
    "if (!filterGroup || !Array.isArray(tags)) return;" "if (!filterGroup) return;"

echo
echo "The game tag seeder:"
mutate "duplicates are no longer skipped" \
    public/admin/admin-extras.js \
    "                if (taken) return;" "                if (false) return;"
mutate "the duplicate check becomes case-sensitive" \
    public/admin/admin-extras.js \
    "(t) => t.name && t.name.toLowerCase() === name.toLowerCase());" \
    "(t) => t.name && t.name === name);"
mutate "only primary tags are checked for duplicates" \
    public/admin/admin-extras.js \
    "const taken = data.tags.some(" \
    "const taken = data.tags.filter((t) => t.kind === 'primary').some("
mutate "untitled games are included" \
    public/admin/admin-extras.js \
    "                .filter(Boolean);" "                ;"
mutate "the title is no longer trimmed" \
    public/admin/admin-extras.js \
    "g.titleEn.trim()" "g.titleEn"
mutate "every new tag gets the same id" \
    public/admin/admin-extras.js \
    "                if (taken) return;
                const nextId = data.tags.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;" \
    "                if (taken) return;
                const nextId = 99;"
mutate "the new tag is created as secondary" \
    public/admin/admin-extras.js \
    "                    color: '#5DCCCA', category: 'general', kind: 'primary'," \
    "                    color: '#5DCCCA', category: 'general', kind: 'secondary',"
mutate "no games at all fails silently" \
    public/admin/admin-extras.js \
    "                showAlert('No games with a title yet. Name one in the Games tab first.', 'error');
                return;" "                return;"
mutate "a successful run stops telling her to publish" \
    public/admin/admin-extras.js \
    "                'Press 💾 Save to site to publish.', 'success');" \
    "                'Done.', 'success');"
mutate "a missing games list throws" \
    public/admin/admin-extras.js \
    "const games = Array.isArray(data.games) ? data.games : [];" \
    "const games = data.games;"
mutate "the button loses type=button" \
    public/admin/admin-extras.js \
    '<button type="button" class="btn-rugged" id="tags-from-games"' \
    '<button class="btn-rugged" id="tags-from-games"'

echo
echo "================================================================"
echo "$caught mutations caught, $missed missed."
[ "$missed" -gt 0 ] && printf '  not caught: %s\n' "${missed_list[@]}"
rm -rf "$BK"
[ "$missed" -eq 0 ]
