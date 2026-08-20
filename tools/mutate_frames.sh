#!/usr/bin/env bash
# Mutation harness for tools/test_frames.mjs
#
#   bash tools/mutate_frames.sh
#
# Breaks one thing at a time and confirms the suite notices. Compares
# PASS COUNTS, not exit codes: a suite that crashes half way through
# reports zero failures and reads exactly like a pass.
#
# Backups are PATH-FLATTENED, never basename.
# Anchors carry SELECTORS and PROPERTY NAMES, never measurements - an
# anchor with a number in it rots the moment the number changes.

set -u
cd "$(dirname "$0")/.." || exit 1

BAK=$(mktemp -d)
SUITE="tools/test_frames.mjs"
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

echo "The frames go back to a fixed height"
mutate "the homepage frame is pinned again" \
    "public/assets/css/pages/index.css" \
    "    min-height: 180px;
    height: auto;" \
    "    height: 250px;"

mutate "the foxes frame is pinned again" \
    "public/assets/css/pages/foxes.css" \
    "    min-height: 200px;
    height: auto;" \
    "    height: 250px;"

mutate "the fox popup frame is pinned again" \
    "public/assets/css/pages/foxes.css" \
    "    min-height: 250px;
    height: auto;
    margin-bottom: 2rem;" \
    "    height: 350px;
    margin-bottom: 2rem;"

mutate "the social frame is pinned again" \
    "public/assets/css/pages/social.css" \
    "    min-height: 160px;
    height: auto;" \
    "    height: 200px;"

mutate "the team card frame is pinned again" \
    "public/assets/css/pages/about.css" \
    "    min-height: 210px;
    height: auto;" \
    "    height: 210px;"

mutate "the older duplicate rule brings its height back" \
    "public/assets/css/pages/about.css" \
    ".player-avatar {
    width: 100%;
    background-color: #1D0D12;" \
    ".player-avatar {
    width: 100%;
    height: 240px;
    background-color: #1D0D12;"

mutate "the devlogs reference itself is broken" \
    "public/assets/css/pages/devlogs.css" \
    "    min-height: 180px;
    height: auto;" \
    "    height: 180px;"

echo
echo "The pictures get trimmed again"
mutate "the homepage picture is stretched to fill" \
    "public/assets/css/pages/index.css" \
    ".image-placeholder img {
    width: 100%;
    height: auto;" \
    ".image-placeholder img {
    width: 100%;
    height: 100%;"

mutate "the foxes picture is cropped again" \
    "public/assets/css/pages/foxes.css" \
    "    object-fit: contain;
    border-radius: 2px;" \
    "    object-fit: cover;
    border-radius: 2px;"

mutate "the social picture is cropped again" \
    "public/assets/css/pages/social.css" \
    "    height: auto;
    display: block;
    object-fit: contain;
    border-radius: 2px;" \
    "    height: 100%;
    display: block;
    object-fit: cover;
    border-radius: 2px;"

mutate "the team photo is cropped again" \
    "public/assets/css/pages/about.css" \
    ".player-avatar img {
    width: 100%;
    height: auto;
    object-fit: contain;" \
    ".player-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;"

mutate "the bio photo is cropped again" \
    "public/assets/css/pages/about.css" \
    ".modal-avatar img {
    width: 100%;
    height: auto;" \
    ".modal-avatar img {
    width: 100%;
    height: 100%;"

mutate "the games art is cropped again" \
    "public/assets/css/pages/games.css" \
    ".game-plank__art img {
    width: 100%;
    height: auto;
    object-fit: contain;" \
    ".game-plank__art img {
    width: 100%;
    height: 100%;
    object-fit: cover;"

mutate "the aspect ratio goes back onto the frame itself" \
    "public/assets/css/pages/games.css" \
    ".game-plank__art {
    border: var(--border-width)" \
    ".game-plank__art {
    aspect-ratio: 16 / 10;
    border: var(--border-width)"

mutate "the empty games box loses its shape" \
    "public/assets/css/pages/games.css" \
    ".game-plank__art.is-empty {
    aspect-ratio: 16 / 10;" \
    ".game-plank__art.is-empty {"

mutate "game page screenshots are cropped again" \
    "public/assets/css/pages/game.css" \
    ".screenshot-image {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;" \
    ".screenshot-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;"

mutate "an inline height is pinned in the markup again" \
    "public/index.html" \
    '<div class="image-placeholder" id="home-social-image">' \
    '<div class="image-placeholder" id="home-social-image" style="height: 180px;">'

mutate "the min-height floor is removed" \
    "public/assets/css/pages/social.css" \
    "    min-height: 160px;" \
    ""

echo
echo "The badge and the grid"
# The margin gained a bottom value on 20 Aug and this anchor still
# carried the old three-value shape, so it stopped matching and went to
# SKIP. Anchored on the two properties that define the fix instead of on
# a margin whose numbers are expected to be tuned.
mutate "the badge is pinned to a fixed offset again" \
    "public/assets/css/pages/about.css" \
    "    position: relative;
    z-index: 5;
    width: fit-content;" \
    "    position: absolute;
    top: 218px;
    left: 50%;"

mutate "cards stretch to the tallest in the row again" \
    "public/assets/css/pages/about.css" \
    "    align-items: start;
}" \
    "}"

echo
echo "The footer link"
mutate "one page still sends people to the admin" \
    "public/press.html" \
    '<a href="https://hub.digitailstudios.com/" class="footer-privacy" rel="nofollow">Studio login</a>' \
    '<a href="/admin/" class="footer-privacy" rel="nofollow">Studio login</a>'

mutate "the te reo link is left pointing elsewhere" \
    "public/about.html" \
    '<a href="https://hub.digitailstudios.com/" class="footer-privacy" rel="nofollow">Takiuru</a>' \
    '<a href="/admin/" class="footer-privacy" rel="nofollow">Takiuru</a>'

echo
echo "Get in touch"
mutate "the subject is dropped" \
    "public/assets/js/pages/press.js" \
    "            ? 'mailto:' + address + '?subject=' + encodeURIComponent('Press enquiry - Digi Tail Studios')" \
    "            ? 'mailto:' + address"

mutate "the subject is pasted in raw" \
    "public/assets/js/pages/press.js" \
    "encodeURIComponent('Press enquiry - Digi Tail Studios')" \
    "'Press enquiry - Digi Tail Studios'"

mutate "the line explaining what happens is removed" \
    "public/assets/js/pages/press.js" \
    "        hint.className = 'press-contact__hint';" \
    "        hint.className = 'press-contact__quiet';"

mutate "the admin stops naming the Google Group" \
    "public/admin/admin-press.js" \
    "'Put the studio Google Group address here, not a personal one. The press '" \
    "'Put an address here. The press '"

echo
echo "The role badge"
mutate "the reorder is dropped, so the badge lands on the name" \
    "public/assets/css/pages/about.css" \
    ".card-front > p              { order: 2; }" \
    ".card-front > p              { order: 9; }"

mutate "the photo is ordered after the badge" \
    "public/assets/css/pages/about.css" \
    ".card-front > .player-avatar { order: 1; }" \
    ".card-front > .player-avatar { order: 3; }"

mutate "Read bio jumps above the name" \
    "public/assets/css/pages/about.css" \
    ".card-front > .flip-hint     { order: 4; }" \
    ".card-front > .flip-hint     { order: 0; }"

mutate "the badge stops leaving room beneath it" \
    "public/assets/css/pages/about.css" \
    "    margin: -1.05rem auto 0.5rem;" \
    "    margin: -1.05rem auto 0;"

mutate "the markup is reordered as well, cancelling the CSS out" \
    "public/assets/js/pages/about.js" \
    "                            <h3>" \
    "                            <p></p><h3>"

echo
echo "=============================================="
echo "  CAUGHT: $caught    MISSED: $missed"
echo "=============================================="
echo
echo "Not mutation-tested, and said so rather than faked:"
echo "  - that the frames LOOK right at a real window width. Nothing in"
echo "    this repo renders a page; the test asserts the rule, not the"
echo "    result."
echo "  - the mailto actually opening a mail app, which is the operating"
echo "    system's job, not ours."

rm -rf "$BAK"
[ "$missed" -eq 0 ]
