#!/usr/bin/env bash
# Mutation harness for tools/test_cleanup.mjs and the two new checks in
# tools/test_admin_access.mjs
#
#   bash tools/mutate_cleanup.sh
#
# Breaks one thing at a time and confirms the suite notices. Compares
# PASS COUNTS, not exit codes: a suite that crashes half way through
# reports zero failures and reads exactly like a pass.
#
# Backups are PATH-FLATTENED, never basename - public/index.html and
# public/admin/index.html share one.
#
# Counting and replacing happen in ONE pass so MULTI-LINE anchors are
# legal, and an anchor must match exactly once. The swap helper is NODE,
# so this runs in Git Bash on Windows as well as in a container.

set -u
cd "$(dirname "$0")/.." || exit 1

BAK=$(mktemp -d)
SUITE="tools/test_cleanup.mjs"
RUN="node"
HELPER="$BAK/_swap.mjs"

cat > "$HELPER" <<'JSSUB'
import { readFileSync, writeFileSync } from 'node:fs';
const [path, frm, to] = process.argv.slice(2);
const text = readFileSync(path, 'utf8');
const n = text.split(frm).length - 1;
if (n !== 1) {
    process.stderr.write(`anchor matched ${n} times\n`);
    process.exit(1);
}
writeFileSync(path, text.replace(frm, to), 'utf8');
JSSUB

flat()    { echo "$1" | tr / _; }
save()    { cp "$1" "$BAK/$(flat "$1")"; }
restore() { cp "$BAK/$(flat "$1")" "$1"; }

baseline=0
caught=0
missed=0

rebase() {
    baseline=$($RUN "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
    baseline=${baseline:-0}
    echo "suite $SUITE - baseline PASSED: $baseline"
    echo
}

mutate() {
    local name="$1" file="$2" from="$3" to="$4"
    save "$file"
    if ! node "$HELPER" "$file" "$from" "$to" 2>/dev/null; then
        echo "  SKIP    $name - anchor must match exactly once"
        restore "$file"; missed=$((missed + 1)); return
    fi
    local now
    now=$($RUN "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
    now=${now:-0}
    restore "$file"
    if [ "$now" -lt "$baseline" ]; then
        echo "  CAUGHT  $name  ($now/$baseline)"; caught=$((caught + 1))
    else
        echo "  MISSED  $name  ($now/$baseline)"; missed=$((missed + 1))
    fi
}

rebase

echo "The nav link that vanished"
mutate "the hover fix is deleted" \
    "public/assets/css/core.css" \
    '.site-nav a.nav-link[aria-current="page"]:hover {
    color: var(--long-black);
}' \
    '.site-nav a.nav-link[aria-current="page"]:xhover {
    color: var(--long-black);
}'

mutate "the fix keeps the juniper text colour" \
    "public/assets/css/core.css" \
    '.site-nav a.nav-link[aria-current="page"]:hover {
    color: var(--long-black);
}' \
    '.site-nav a.nav-link[aria-current="page"]:hover {
    color: var(--frozen-juniper);
}'

mutate "the fix is widened to focus as well" \
    "public/assets/css/core.css" \
    '.site-nav a.nav-link[aria-current="page"]:hover {' \
    '.site-nav a.nav-link[aria-current="page"]:hover,
.site-nav a.nav-link[aria-current="page"]:focus {'

echo
echo "Remembering the language"
mutate "the stored choice is never applied" \
    "public/assets/js/lang-persist.js" \
    "            body.classList.add('lang-' + want);" \
    "            body.classList.add('lang-en');"

mutate "any stored value is accepted" \
    "public/assets/js/lang-persist.js" \
    "if (want === 'mi' || want === 'en') {" \
    "if (want) {"

mutate "a change is never written down" \
    "public/assets/js/lang-persist.js" \
    "            remember(now);" \
    "            void now;"

mutate "the storage key is misspelt" \
    "public/assets/js/lang-persist.js" \
    "var KEY = 'digitail-lang';" \
    "var KEY = 'digitail-language';"

mutate "storage is read without a guard" \
    "public/assets/js/lang-persist.js" \
    "        try { return localStorage.getItem(KEY); } catch (e) { return null; }" \
    "        return localStorage.getItem(KEY);"

mutate "the html lang attribute is left behind" \
    "public/assets/js/lang-persist.js" \
    "            document.documentElement.setAttribute('lang', want);" \
    "            void want;"

mutate "one page stops loading it" \
    "public/foxes.html" \
    '<script src="/assets/js/lang-persist.js"></script>' \
    ''

echo
echo "One language filled in, not the other"
mutate "the games heading is gated on English again" \
    "public/assets/js/pages/games.js" \
    "    if (title && (page.titleEn || page.titleMi)) {" \
    "    if (title && page.titleEn) {"

mutate "the English span stops falling back" \
    "public/assets/js/pages/games.js" \
    "        title.querySelector('.en').textContent = page.titleEn || page.titleMi;" \
    "        title.querySelector('.en').textContent = page.titleEn;"

mutate "the games intro is gated on English again" \
    "public/assets/js/pages/games.js" \
    "    if (introEn && (page.introEn || page.introMi)) {" \
    "    if (introEn && page.introEn) {"

mutate "the game page keeps the old one-sided rule" \
    "public/assets/js/pages/game.js" \
    "    if (enEl && (en || mi)) enEl.textContent = en || mi;" \
    "    if (enEl && en) enEl.textContent = en;"

mutate "the press heading keeps the old one-sided rule" \
    "public/assets/js/pages/press.js" \
    "    if (h && (kit.headingEn || kit.headingMi)) {" \
    "    if (h && kit.headingEn) {"

echo
echo "Press kit links"
mutate "the factsheet writes plain text again" \
    "public/assets/js/pages/press.js" \
    "    dd.appendChild(linkedValue(value));" \
    "    dd.textContent = value;"

mutate "any protocol is allowed through" \
    "public/assets/js/pages/press.js" \
    "    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';" \
    "    if (false) return '';"

mutate "the mailto branch is dropped" \
    "public/assets/js/pages/press.js" \
    "    const email = href ? '' : looksLikeEmail(value);" \
    "    const email = '';"

mutate "a plain sentence is linked anyway" \
    "public/assets/js/pages/press.js" \
    "    if (!href && !email) return document.createTextNode(value);" \
    "    if (false) return document.createTextNode(value);"

mutate "the source line is joined into one string again" \
    "public/assets/js/pages/press.js" \
    "                m.appendChild(linkedValue(bit));" \
    "                m.appendChild(document.createTextNode(bit));"

mutate "the factsheet link loses its colour" \
    "public/assets/css/pages/press.css" \
    '.press-list a,
.press-factsheet a {' \
    '.press-list a {'

echo
echo "Line breaks in the credits"
mutate "line breaks are dropped again" \
    "public/assets/js/pages/press.js" \
    "    String(text).split('\\n').forEach((line, i) => {" \
    "    String(text).split(/\\n\\s*\\n/).forEach((line, i) => {"

mutate "the break element is never added" \
    "public/assets/js/pages/press.js" \
    "        if (i) el.appendChild(document.createElement('br'));" \
    "        if (false) el.appendChild(document.createElement('br'));"

mutate "one break is added for every line" \
    "public/assets/js/pages/press.js" \
    "        if (i) el.appendChild(document.createElement('br'));" \
    "        el.appendChild(document.createElement('br'));"

mutate "the te reo half stops falling back" \
    "public/assets/js/pages/press.js" \
    "    linesInto(m, mi || en || '');" \
    "    linesInto(m, mi || '');"

mutate "prose goes back to the old paragraph builder" \
    "public/assets/js/pages/press.js" \
    "        wrap.appendChild(paraPair(enPara, miPara));" \
    "        wrap.appendChild(pair('p', null, enPara, miPara));"

echo
echo "Admin wording"
# Single quotes here on purpose. These anchors contain ${...} and a
# backtick; in double quotes bash expands both, hands the helper an empty
# string, and the result reads as "anchor not found" rather than as a bug
# in the code being tested.
mutate "the holding message always claims to be showing" \
    "public/admin/admin-games.js" \
    '<strong>Not showing right now.</strong>' \
    '<strong>Showing on the game page now.</strong>'

mutate "the section count is dropped" \
    "public/admin/admin-games.js" \
    'This game has ${count} ' \
    'This game has some '

mutate "the plural is always added" \
    "public/admin/admin-games.js" \
    "count === 1 ? " \
    "count === 99 ? "

mutate "the editor goes back to a fixed sentence" \
    "public/admin/admin-games.js" \
    '<div class="helper-text">${holdingState(g)}</div>' \
    '<div class="helper-text">Shown in place of the sections while there are none.</div>'

mutate "the display date note is removed" \
    "public/admin/admin-script.js" \
    "What visitors read under the title." \
    "A date."

mutate "the sort date note is removed" \
    "public/admin/admin-script.js" \
    "Decides the order posts appear in, newest first." \
    "A date."

echo
echo "The setting that makes downloads work"
SUITE="tools/test_admin_access.mjs"
RUN="node --experimental-sqlite"
rebase

mutate "run_worker_first is removed" \
    "wrangler.toml" \
    'run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]' \
    ''

mutate "only /admin/* is listed, not /admin" \
    "wrangler.toml" \
    'run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]' \
    'run_worker_first = [ "/admin/*", "/api/*", "/media/*" ]'

mutate "media is left off, so downloads still 404" \
    "wrangler.toml" \
    'run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]' \
    'run_worker_first = [ "/admin", "/admin/*", "/api/*" ]'

mutate "the setting is only there as a comment" \
    "wrangler.toml" \
    'run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]' \
    '# run_worker_first = [ "/admin", "/admin/*", "/api/*", "/media/*" ]'

echo
echo "=============================================="
echo "  CAUGHT: $caught    MISSED: $missed"
echo "=============================================="
echo
echo "Not mutation-tested, and said so rather than faked:"
echo "  - the 'no change, no work' guard in the class observer. Removing"
echo "    it writes the same value to storage a second time, which no"
echo "    test can tell apart from writing it once."
echo "  - the <head> placement of lang-persist.js. Moving the tag to the"
echo "    end of <body> still leaves it loaded on every page; the"
echo "    difference is a flicker on screen, which nothing here can see."

rm -rf "$BAK"
[ "$missed" -eq 0 ]
