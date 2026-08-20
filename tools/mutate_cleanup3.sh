#!/usr/bin/env bash
# Mutation harness for tools/test_cleanup3.mjs
#
#   bash tools/mutate_cleanup3.sh
#
# Breaks one thing at a time and confirms the suite notices. Compares
# PASS COUNTS, not exit codes: a suite that crashes half way through
# reports zero failures and reads exactly like a pass.
#
# Backups are PATH-FLATTENED, never basename - public/index.html and
# public/admin/index.html would otherwise share one.
#
# ⚠️ Anchors carry SELECTORS and PROPERTY NAMES, never measurements. An
# anchor holding "15rem" went silently to SKIP the moment that width
# changed, earlier in this same cleanup.

set -u
cd "$(dirname "$0")/.." || exit 1

BAK=$(mktemp -d)
SUITE="tools/test_cleanup3.mjs"
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

echo "The mascot"
mutate "the hero text goes back to taking every spare pixel" \
    "public/assets/css/pages/index.css" \
    ".hero-text {
    flex: 0 1 auto;
}" \
    ".hero-text {
    flex: 1;
}"

mutate "the pair stops being centred" \
    "public/assets/css/pages/index.css" \
    "    justify-content: center;
    gap: 1.25rem;" \
    "    justify-content: space-between;
    gap: 1.25rem;"

mutate "the mascot floats instead of standing on the line" \
    "public/assets/css/pages/index.css" \
    "    align-items: flex-end;
    justify-content: center;" \
    "    align-items: center;
    justify-content: center;"

mutate "the name tag is never built" \
    "public/assets/js/pages/index.js" \
    "            if (m.name) {" \
    "            if (false) {"

mutate "the name tag is built for a mascot with no name" \
    "public/assets/js/pages/index.js" \
    "            if (m.name) {" \
    "            if (true) {"

mutate "the picture is dropped in favour of the name" \
    "public/assets/js/pages/index.js" \
    "            const parts = [img];" \
    "            const parts = [];"

mutate "the name is written as markup" \
    "public/assets/js/pages/index.js" \
    "                tag.textContent = m.name;" \
    "                tag.innerHTML = m.name;"

mutate "the name tag loses its styling" \
    "public/assets/css/pages/index.css" \
    ".hero-mascot__name {" \
    ".hero-mascot__nameX {"

echo
echo "The ticker preview"
mutate "the moving track is removed" \
    "public/admin/ticker-editor.js" \
    'id="ticker-preview-track"' \
    'id="ticker-preview-trackX"'

mutate "the preview goes back to a fixed speed" \
    "public/admin/ticker-editor.js" \
    "'ticker-scroll ' + (t.speed || 32) + 's linear infinite'" \
    "'ticker-scroll 32s linear infinite'"

# ASCII-only anchors from here down. In double quotes bash leaves
# \u2705 as six literal characters, so an anchor written that way can
# never match the emoji actually in the file - it reports SKIP and reads
# like a missing anchor rather than an escaping mistake.
mutate "only one copy of the text is written" \
    "public/admin/ticker-editor.js" \
    "        track.textContent = line + " \
    "        track.textContent = line; //"

mutate "an empty list animates a blank strip" \
    "public/admin/ticker-editor.js" \
    "            track.style.animation = 'none';" \
    "            track.style.animation = '';"

mutate "the preview declares its own keyframes" \
    "public/admin/ticker-editor.js" \
    "    function fill() {" \
    "    const EXTRA = '@keyframes ticker-scroll { from { left: 0 } }';
    function fill() {"

echo
echo "The social page"
mutate "the thumbnail clips its own badge again" \
    "public/assets/css/pages/social.css" \
    "    font-style: italic;
    margin-bottom: 1rem;
    position: relative;" \
    "    font-style: italic;
    margin-bottom: 1rem;
    overflow: hidden;
    position: relative;"

mutate "the badge is tucked inside instead" \
    "public/assets/css/pages/social.css" \
    "    top: -10px;
    right: -10px;" \
    "    top: 10px;
    right: 10px;"

mutate "the picture is cropped again" \
    "public/assets/css/pages/social.css" \
    "    object-fit: contain;
    border-radius: 2px;" \
    "    object-fit: cover;
    border-radius: 2px;"

mutate "the tag filter is ignored" \
    "public/assets/js/pages/social.js" \
    "                const tagOk = currentTag === 'all'" \
    "                const tagOk = true || currentTag === 'all'"

mutate "the platform filter is ignored" \
    "public/assets/js/pages/social.js" \
    "                const platformOk = currentFilter === 'all' || p.platform === currentFilter;" \
    "                const platformOk = true;"

mutate "one filter replaces the other instead of narrowing" \
    "public/assets/js/pages/social.js" \
    "                return platformOk && tagOk;" \
    "                return platformOk || tagOk;"

mutate "an untagged post is dropped by every filter" \
    "public/assets/js/pages/social.js" \
    "                const tagOk = currentTag === 'all'
                    || (Array.isArray(p.tags)" \
    "                const tagOk = (Array.isArray(p.tags)"

mutate "the active button depends on a click again" \
    "public/assets/js/pages/social.js" \
    "                btn.classList.toggle('active', btn.dataset.value === value);" \
    "                btn.classList.toggle('active', btn === event.target);"

mutate "the empty tag row is shown anyway" \
    "public/assets/js/pages/social.js" \
    "            if (!tagContainer || !tags.length) return;" \
    "            if (!tagContainer) return;"

mutate "the All button loses its value stamp" \
    "public/assets/js/pages/social.js" \
    "            if (allBtn) allBtn.dataset.value = 'all';" \
    "            if (allBtn) allBtn.dataset.name = 'all';"

echo
echo "The admin"
mutate "the option colours are dropped" \
    "public/assets/css/pages/content-manager.css" \
    ".form-group select option,
.form-group select optgroup {" \
    ".form-group select optionX,
.form-group select optgroup {"

mutate "helper text goes back to the muted tone" \
    "public/assets/css/pages/content-manager.css" \
    "    font-size: 0.85rem;
    color: var(--extra-foam);
    opacity: 0.82;" \
    "    font-size: 0.85rem;
    color: var(--arctic-willow);
    opacity: 0.82;"

mutate "the card colour pin puts the muted tone back" \
    "public/assets/css/pages/content-manager.css" \
    "body .admin-main .card small {
    color: var(--extra-foam);" \
    "body .admin-main .card small {
    color: var(--arctic-willow);"

mutate "the bar stops following the page" \
    "public/assets/css/pages/content-manager.css" \
    "    position: sticky;
    top: 0;" \
    "    position: relative;
    top: 0;"

mutate "the sticky bar goes back to being see-through" \
    "public/assets/css/pages/content-manager.css" \
    "    background-color: #2A171D;" \
    "    background-color: rgba(185, 204, 204, 0.1);"

mutate "saving stops publishing" \
    "public/admin/admin-script.js" \
    "    updateStats(type);
    cancelEdit(type);
    publishNow(" \
    "    updateStats(type);
    cancelEdit(type);
    showAlert("

mutate "deleting stops publishing" \
    "public/admin/admin-script.js" \
    "        cancelEdit(type);
        publishNow(" \
    "        cancelEdit(type);
        showAlert("

mutate "a failed publish is swallowed" \
    "public/admin/admin-script.js" \
    "        .catch(function (e) {
            showAlert('Saved here, but publishing failed: ' + (e && e.message ? e.message : e), 'error');
        });" \
    "        .catch(function () {});"

mutate "one screen still asks for a second press" \
    "public/admin/admin-mascots.js" \
    "Publish everything in the bar at the top - it follows you down the page." \
    "Save to site at the top of the page to publish."

mutate "the publish button is removed entirely" \
    "public/admin/index.html" \
    'id="save-all-btn"' \
    'id="save-all-btnX"'

mutate "the games page card stops folding" \
    "public/admin/index.html" \
    '<details class="card card--foldable">' \
    '<div class="card card--foldable">'

mutate "the fold starts open" \
    "public/admin/index.html" \
    '<details class="card card--foldable">' \
    '<details class="card card--foldable" open>'

mutate "a field falls outside the fold" \
    "public/admin/index.html" \
    '<input type="text" id="gp-title-mi" data-gp-field="titleMi">' \
    '<input type="text" id="gp-title-miX" data-gp-field="titleMi">'

mutate "the social date note is removed" \
    "public/admin/admin-script.js" \
    "Filled in with today" \
    "A date, no explanation"

echo
echo "=============================================="
echo "  CAUGHT: $caught    MISSED: $missed"
echo "=============================================="
echo
echo "Not mutation-tested, and said so rather than faked:"
echo "  - whether the mascot now LOOKS like it is sitting beside the"
echo "    wordmark, and whether the ticker preview reads at the speed"
echo "    chosen. Both need eyes on a browser; nothing here renders."
echo "  - the <details> open and close behaviour. It is the browser's,"
echo "    which is the whole reason for using it rather than a toggle."

rm -rf "$BAK"
[ "$missed" -eq 0 ]
