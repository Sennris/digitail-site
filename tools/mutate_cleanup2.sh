#!/usr/bin/env bash
# Mutation harness for tools/test_cleanup2.mjs
#
#   bash tools/mutate_cleanup2.sh
#
# Breaks one thing at a time and confirms the suite notices. Compares
# PASS COUNTS, not exit codes: a suite that crashes half way through
# reports zero failures and reads exactly like a pass.
#
# Backups are PATH-FLATTENED, never basename.
#
# Counting and replacing happen in ONE pass so MULTI-LINE anchors are
# legal, and an anchor must match exactly once. The swap helper is NODE,
# so this runs in Git Bash on Windows as well as in a container.
#
# ⚠️ Anchors carry SELECTORS and PROPERTY NAMES, never measurements. An
# anchor with "15rem" in it went silently to SKIP the moment that width
# changed, on 14 Aug, in this same project.

set -u
cd "$(dirname "$0")/.." || exit 1

BAK=$(mktemp -d)
SUITE="tools/test_cleanup2.mjs"
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

baseline=$(node "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
baseline=${baseline:-0}
echo "baseline PASSED: $baseline"
echo

flat()    { echo "$1" | tr / _; }
save()    { cp "$1" "$BAK/$(flat "$1")"; }
restore() { cp "$BAK/$(flat "$1")" "$1"; }

caught=0
missed=0

mutate() {
    local name="$1" file="$2" from="$3" to="$4"
    save "$file"
    if ! node "$HELPER" "$file" "$from" "$to" 2>/dev/null; then
        echo "  SKIP    $name - anchor must match exactly once"
        restore "$file"; missed=$((missed + 1)); return
    fi
    local now
    now=$(node "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
    now=${now:-0}
    restore "$file"
    if [ "$now" -lt "$baseline" ]; then
        echo "  CAUGHT  $name  ($now/$baseline)"; caught=$((caught + 1))
    else
        echo "  MISSED  $name  ($now/$baseline)"; missed=$((missed + 1))
    fi
}

echo "The fox photo"
mutate "the URL goes back to being printed as text" \
    "public/assets/js/pages/foxes.js" \
    "                            : \`<img src=\"\${escapeAttr(fox.image)}\" alt=\"\${escapeAttr(fox.nameEn || 'Fox')}\">\`)" \
    "                            : fox.image)"

mutate "the src is left unescaped" \
    "public/assets/js/pages/foxes.js" \
    "src=\"\${escapeAttr(fox.image)}\"" \
    "src=\"\${fox.image}\""

mutate "the escaper stops escaping quotes" \
    "public/assets/js/pages/foxes.js" \
    "        .replace(/\"/g, '&quot;')" \
    "        .replace(/\"/g, '\"')"

mutate "the alt text is dropped" \
    "public/assets/js/pages/foxes.js" \
    "alt=\"\${escapeAttr(fox.nameEn || 'Fox')}\"" \
    "alt=\"\""

mutate "the placeholder is lost when there is no photo" \
    "public/assets/js/pages/foxes.js" \
    '`<span class="en">[ Photo Placeholder ]</span><span class="mi">[ Pikitia Placeholder ]</span>`' \
    "''"

mutate "older hand-written markup is mangled" \
    "public/assets/js/pages/foxes.js" \
    "                        ? (String(fox.image).trim().startsWith('<')" \
    "                        ? (false"

echo
echo "The team cards"
mutate "the card photo is cropped again" \
    "public/assets/css/pages/about.css" \
    "    object-fit: contain;
    border-radius: 4px;" \
    "    object-fit: cover;
    border-radius: 4px;"

mutate "the bio photo is cropped again" \
    "public/assets/css/pages/about.css" \
    "    object-fit: contain;
    display: block;
    padding: 0.5rem;" \
    "    object-fit: cover;
    display: block;
    padding: 0.5rem;"

mutate "the sizing goes back into an inline style" \
    "public/assets/js/pages/about.js" \
    "'<img src=\"' + member.avatar + '\" alt=\"' + member.nameEn + '\">'" \
    "'<img src=\"' + member.avatar + '\" alt=\"' + member.nameEn + '\" style=\"object-fit:cover;\">'"

mutate "the sweep parks at full strength again" \
    "public/assets/css/pages/about.css" \
    "    animation: foil-sweep 1.5s cubic-bezier(0.25, 0.6, 0.3, 1) forwards;" \
    "    opacity: 1;
    background-position: -55% 0;"

mutate "the sweep never fades out at the end" \
    "public/assets/css/pages/about.css" \
    "    100% { opacity: 0; background-position: -55% 0; }" \
    "    100% { opacity: 1; background-position: -55% 0; }"

mutate "the sweep loops forever" \
    "public/assets/css/pages/about.css" \
    "    animation: foil-sweep 1.5s cubic-bezier(0.25, 0.6, 0.3, 1) forwards;" \
    "    animation: foil-sweep 1.5s cubic-bezier(0.25, 0.6, 0.3, 1) infinite;"

mutate "the white band goes back to washing the card out" \
    "public/assets/css/pages/about.css" \
    "        rgba(255, 255, 255, 0.34) 48%," \
    "        rgba(255, 255, 255, 0.70) 48%,"

mutate "reduced motion is ignored" \
    "public/assets/css/pages/about.css" \
    "@media (prefers-reduced-motion: reduce) {
    .player-card:hover::after { animation: none; opacity: 0; }
}" \
    ""

mutate "the reduce-noise toggle stops reaching it" \
    "public/assets/css/pages/about.css" \
    ".pref-reduce-noise .player-card:hover::after {" \
    ".pref-reduce-noise .player-card:focus::after {"

echo
echo "The 404 page"
mutate "the press link is removed again" \
    "public/404.html" \
    '        <a class="nav-link" href="/press.html">press</a>' \
    ''

mutate "games goes back to game" \
    "public/404.html" \
    '<a class="nav-link" href="/games.html">games</a>' \
    '<a class="nav-link" href="/game.html">game</a>'

mutate "a link points at a page that does not exist" \
    "public/404.html" \
    '<a class="nav-link" href="/foxes.html">foxes</a>' \
    '<a class="nav-link" href="/foxs.html">foxes</a>'

mutate "the links go relative, as on every other page" \
    "public/404.html" \
    '<a class="nav-link" href="/about.html">about</a>' \
    '<a class="nav-link" href="about.html">about</a>'

mutate "an extra page nobody else links to is added" \
    "public/404.html" \
    '<a class="nav-link" href="/press.html">press</a>' \
    '<a class="nav-link" href="/press.html">press</a>
        <a class="nav-link" href="/privacy.html">privacy</a>'

echo
echo "Housekeeping"
mutate "a page starts loading the dead file again" \
    "public/foxes.html" \
    '<script src="/assets/js/lang-persist.js"></script>' \
    '<script src="/assets/js/lang-persist.js"></script>
    <script src="/assets/js/site.js"></script>'

mutate "a second copy of the language key appears" \
    "public/assets/js/lang-attr.js" \
    "(function () {" \
    "(function () {
    var UNUSED = 'digitail-lang';"

echo
echo "=============================================="
echo "  CAUGHT: $caught    MISSED: $missed"
echo "=============================================="
echo
echo "Not mutation-tested, and said so rather than faked:"
echo "  - that the photo now LOOKS right rather than merely being an"
echo "    <img> with the correct src, and that the sweep reads as a"
echo "    shine rather than a flash. Both need eyes on a browser."
echo "  - site.js being deleted. There is no file left to mutate; the"
echo "    check is that it is absent, which only a re-creation would"
echo "    break, and re-creating it is not a mutation of anything."

rm -rf "$BAK"
[ "$missed" -eq 0 ]
