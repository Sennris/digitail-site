#!/usr/bin/env bash
# Mutation test for tools/test_mascots.mjs.
#
# Eight tests in this project have passed while the thing they claimed to
# check was broken. So every assertion in the mascot suite gets proved here:
# break the code it covers, confirm the suite FAILS, restore.
#
# Two rules this harness follows, both from real accidents on this site:
#
#   - Backup names are PATH-FLATTENED, never basename. public/index.html and
#     public/admin/index.html share a basename, and a collision once restored
#     the admin page over the homepage.
#
#   - It compares PASS COUNTS, not just the exit code. A crash mid-suite also
#     exits non-zero, and would otherwise look like a mutation being caught
#     when the suite never actually ran.
#
#   bash tools/mutate_mascots.sh

set -u
cd "$(dirname "$0")/.."

BASELINE=$(node --experimental-sqlite tools/test_mascots.mjs 2>/dev/null | tail -1 | grep -oE '[0-9]+' | head -1)
if ! node --experimental-sqlite tools/test_mascots.mjs >/dev/null 2>&1; then
    echo "The suite does not pass before any mutation. Fix that first."
    exit 1
fi
echo "Baseline: $BASELINE checks pass."
echo

BACKUP_DIR=$(mktemp -d)
caught=0
missed=0
missed_list=()

restore_all() {
    for b in "$BACKUP_DIR"/*; do
        [ -e "$b" ] || continue
        orig=$(basename "$b" | tr '_' '/')
        :
    done
}

# mutate <label> <file> <python-replacement-expression>
mutate() {
    local label="$1" file="$2" old="$3" new="$4"
    local flat
    flat=$(echo "$file" | tr / _)
    cp "$file" "$BACKUP_DIR/$flat"

    python3 - "$file" "$old" "$new" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
if sys.argv[2] not in t:
    sys.stderr.write("ANCHOR-MISSING\n"); sys.exit(2)
p.write_text(t.replace(sys.argv[2], sys.argv[3], 1))
PY
    if [ $? -ne 0 ]; then
        echo "  ????  $label  (anchor not found - the mutation did not apply)"
        missed=$((missed+1)); missed_list+=("$label [anchor]")
        cp "$BACKUP_DIR/$flat" "$file"
        return
    fi

    local out passes code
    out=$(node --experimental-sqlite tools/test_mascots.mjs 2>&1)
    code=$?
    passes=$(echo "$out" | tail -1 | grep -oE '^[0-9]+' | head -1)
    [ -z "$passes" ] && passes=$(echo "$out" | tail -1 | grep -oE '[0-9]+' | head -1)
    [ -z "$passes" ] && passes=0

    cp "$BACKUP_DIR/$flat" "$file"

    if [ "$code" -ne 0 ] && [ "$passes" -lt "$BASELINE" ]; then
        echo "  CAUGHT   $label  ($passes/$BASELINE still passing)"
        caught=$((caught+1))
    elif [ "$code" -ne 0 ]; then
        echo "  CRASH    $label  (suite died rather than failing a check)"
        missed=$((missed+1)); missed_list+=("$label [crash]")
    else
        echo "  MISSED   $label  - the suite passed with this broken"
        missed=$((missed+1)); missed_list+=("$label")
    fi
}

echo "The overlap rule:"
mutate "shortest range no longer wins (longest wins instead)" \
    public/assets/js/pages/index.js \
    "if (span < bestSpan) { best = covering[i]; bestSpan = span; }" \
    "if (span > bestSpan) { best = covering[i]; bestSpan = span; }"

mutate "ties fall to the LAST in the list instead of the first" \
    public/assets/js/pages/index.js \
    "if (span < bestSpan) { best = covering[i]; bestSpan = span; }" \
    "if (span <= bestSpan) { best = covering[i]; bestSpan = span; }"

mutate "an undated mascot no longer counts as infinite" \
    public/assets/js/pages/index.js \
    "if (!d) return Infinity;" \
    "if (!d) return 1;"

mutate "the range no longer includes its last day" \
    public/assets/js/pages/index.js \
    "if (d.start <= d.end) return today >= d.start && today <= d.end;" \
    "if (d.start <= d.end) return today >= d.start && today < d.end;"

mutate "a range can no longer wrap the year end" \
    public/assets/js/pages/index.js \
    "return m.repeatsYearly ? (today >= d.start || today <= d.end) : false;" \
    "return false;"

mutate "a backwards one-off silently wraps instead of matching nothing" \
    public/assets/js/pages/index.js \
    "return m.repeatsYearly ? (today >= d.start || today <= d.end) : false;" \
    "return (today >= d.start || today <= d.end);"

mutate "a wrapping span is measured the long way round" \
    public/assets/js/pages/index.js \
    "return (b >= a ? b - a : b - a + 365) + 1;" \
    "return (b - a) + 1;"

mutate "repeats-yearly stops trimming the year off" \
    public/assets/js/pages/index.js \
    "return { start: start.slice(-5), end: end.slice(-5) };" \
    "return { start: start, end: end };"

mutate "a one-off is treated as repeating" \
    public/assets/js/pages/index.js \
    "if (m.repeatsYearly) {
                return { start: start.slice(-5), end: end.slice(-5) };" \
    "if (true) {
                return { start: start.slice(-5), end: end.slice(-5) };"

mutate "one date on its own no longer means one day" \
    public/assets/js/pages/index.js \
    "if (!end) end = start;" \
    "if (!end) end = '12-31';"

echo
echo "The switches:"
mutate "the forced override is ignored" \
    public/assets/js/pages/index.js \
    "const forced = live.find((m) => m.forced);
            if (forced) return forced;" \
    "const forced = null;
            if (forced) return forced;"

mutate "switched-off mascots are shown anyway" \
    public/assets/js/pages/index.js \
    ".filter((m) => m && m.enabled !== false);" \
    ".filter((m) => Boolean(m));"

echo
echo "The render:"
mutate "the name is pasted into markup again" \
    public/assets/js/pages/index.js \
    "const img = document.createElement('img');
            img.src = m.image;
            img.alt = m.name || 'Studio mascot';
            el.replaceChildren(img);" \
    "el.innerHTML = '<img src=\"' + m.image + '\" alt=\"' + (m.name || 'Studio mascot') + '\">';"

mutate "a nameless mascot gets an empty alt" \
    public/assets/js/pages/index.js \
    "img.alt = m.name || 'Studio mascot';" \
    "img.alt = m.name;"

mutate "the old size class is left on" \
    public/assets/js/pages/index.js \
    "MASCOT_SIZES.forEach((s) => el.classList.remove('mascot-' + s));" \
    "void 0;"

mutate "an unknown size falls back to nothing" \
    public/assets/js/pages/index.js \
    "el.classList.add('mascot-' + (MASCOT_SIZES.indexOf(m.size) >= 0 ? m.size : 'medium'));" \
    "el.classList.add('mascot-' + m.size);"

mutate "a mascot with no image renders anyway" \
    public/assets/js/pages/index.js \
    "if (!el || !m || !m.image) return;" \
    "if (!el || !m) return;"

echo
echo "The CSS:"
mutate "the large size loses its phone rule" \
    public/assets/css/pages/index.css \
    "            .hero-mascot.mascot-large  { width: 150px; height: 150px; }" \
    ""

mutate "the small size is never defined" \
    public/assets/css/pages/index.css \
    ".hero-mascot.mascot-small  { width: 130px; height: 130px; }" \
    ""

echo
echo "The admin module:"
mutate "the admin's copy of the rule drifts from the site's" \
    public/admin/admin-mascots.js \
    "if (span < bestSpan) { best = covering[i]; bestSpan = span; }" \
    "if (span > bestSpan) { best = covering[i]; bestSpan = span; }"

mutate "the admin reads window.data again" \
    public/admin/admin-mascots.js \
    "if (typeof data === 'undefined') return null;
        return data;" \
    "return window.data || null;"

mutate "the list render loses its signature guard" \
    public/admin/admin-mascots.js \
    "if (panel.dataset.mascotsSignature === sig) return;
        panel.dataset.mascotsSignature = sig;" \
    "void sig;"

mutate "the editor render loses its signature guard" \
    public/admin/admin-mascots.js \
    "if (!force && mount.dataset.editorSignature === sig) return;
        mount.dataset.editorSignature = sig;" \
    "void sig;"

mutate "the wrapper moves inside boot()" \
    public/admin/admin-mascots.js \
    "installWrapper();

    // Belt and braces" \
    "// moved into boot

    // Belt and braces"

mutate "a rendered button loses type=button" \
    public/admin/admin-mascots.js \
    '<button type="button" class="game-row-name"' \
    '<button class="game-row-name"'

mutate "the name stops being escaped" \
    public/admin/admin-mascots.js \
    '${esc(name)}' \
    '${name}'

mutate "the rollback copy stops being kept in step" \
    public/admin/admin-mascots.js \
    "d.homepage.mascot = {" \
    "const unused = {"

echo
echo "The server:"
mutate "the mascots reader is unregistered" \
    src/index.js \
    "    mascots: getMascots," \
    ""

mutate "the mascots writer is unregistered" \
    src/writers.js \
    "    mascots:   (db, body) => putMascots(db, body)," \
    ""

mutate "a missing table 500s instead of returning null" \
    src/index.js \
    "    } catch {
        return null;   // migration 0012 has not been run yet
    }" \
    "    } finally {
        void 0;
    }"

mutate "two mascots can be forced on at once" \
    src/writers.js \
    "forced && m === forced ? 1 : 0," \
    "m.forced ? 1 : 0,"

mutate "an unrecognised size is stored as typed" \
    src/writers.js \
    "['small', 'medium', 'large'].includes(s(m.size)) ? s(m.size) : 'medium'," \
    "s(m.size)," 

mutate "the mirror points at the first row, not the always-on one" \
    src/writers.js \
    "const pick = live.find((m) => !s(m.dateStart) && !s(m.dateEnd)) || live[0] || null;" \
    "const pick = live[0] || null;"

mutate "the mirror includes switched-off mascots" \
    src/writers.js \
    "const live = items.filter((m) => m && m.enabled !== false);" \
    "const live = items.filter((m) => Boolean(m));"

mutate "the mirror claims it can auto-switch" \
    src/writers.js \
    "        autoSwitch: false," \
    "        autoSwitch: true,"

echo
echo "The save guard:"
mutate "a 500 counts as a successful load again" \
    public/admin/api-adapter.js \
    "                if (r.status === 404) return { answered: true, rows: [] };
                return { answered: false, rows: [] };" \
    "                return { answered: true, rows: [] };"

mutate "a dropped connection counts as a successful load" \
    public/admin/api-adapter.js \
    ".catch(() => ({ answered: false, rows: [] }));" \
    ".catch(() => ({ answered: true, rows: [] }));"

mutate "a 404 is treated as a failure (the migration message is lost)" \
    public/admin/api-adapter.js \
    "                if (r.status === 404) return { answered: true, rows: [] };" \
    "                if (r.status === 404) return { answered: false, rows: [] };"

mutate "mascots drop out of the guarded list" \
    public/admin/api-adapter.js \
    "    const loadedOk = { games: false, pressItems: false, pressAssets: false,
                       mascots: false };" \
    "    const loadedOk = { games: false, pressItems: false, pressAssets: false };"

echo
echo "The removed slots:"
mutate "collectHomepageInfo reads a removed input again" \
    public/admin/admin-script.js \
    "    // The mascot is deliberately NOT collected here." \
    "    data.homepage.mascotCurrent = document.getElementById('hp-mascot-current').value;
    // The mascot is deliberately NOT collected here."

mutate "the module is no longer loaded by the admin page" \
    public/admin/index.html \
    '    <script src="admin-mascots.js"></script>
' \
    ""

echo
echo "The migration:"
mutate "the move can overwrite an edited table" \
    migrations/0012_mascots.sql \
    "  AND NOT EXISTS (SELECT 1 FROM mascots);" \
    ";"

mutate "the everyday mascot arrives with dates" \
    migrations/0012_mascots.sql \
    "       'medium', '', '', 1, 0, 1, 0" \
    "       'medium', '01-01', '12-31', 1, 0, 1, 0"

mutate "the christmas slot is dropped from the move" \
    migrations/0012_mascots.sql \
    "json_extract(value, '\$.mascot.versions.christmas.name')" \
    "'Christmas'"

mutate "the ledger entry is removed" \
    migrations/0012_mascots.sql \
    "INSERT OR IGNORE INTO schema_migrations (filename, note)
VALUES ('0012_mascots.sql', 'applied directly');" \
    ""

mutate "the everyday mascot is never moved across at all" \
    migrations/0012_mascots.sql \
    "  AND json_extract(value, '\$.mascot.versions.default') IS NOT NULL" \
    "  AND 1 = 0"

mutate "the halloween dates stop coming from her blob" \
    migrations/0012_mascots.sql \
    "COALESCE(json_extract(value, '\$.mascot.versions.halloween.activeDates[0]'), '10-25')," \
    "'10-25',"

echo
echo "================================================================"
echo "$caught mutations caught, $missed missed."
if [ "$missed" -gt 0 ]; then
    printf '  not caught: %s\n' "${missed_list[@]}"
fi
rm -rf "$BACKUP_DIR"
[ "$missed" -eq 0 ]
