#!/usr/bin/env bash
# Mutation harness for tools/test_fanart.mjs
#
#   bash tools/mutate_fanart.sh
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

set -u
cd "$(dirname "$0")/.." || exit 1

BAK=$(mktemp -d)
SUITE="tools/test_fanart.mjs"
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

baseline=$(node --experimental-sqlite "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
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
    now=$(node --experimental-sqlite "$SUITE" 2>/dev/null | grep -oP 'PASSED: \K[0-9]+')
    now=${now:-0}
    restore "$file"
    if [ "$now" -lt "$baseline" ]; then
        echo "  CAUGHT  $name  ($now/$baseline)"; caught=$((caught + 1))
    else
        echo "  MISSED  $name  ($now/$baseline)"; missed=$((missed + 1))
    fi
}

# --- links -----------------------------------------------------------
mutate "the protocol check is dropped" src/fanart.js \
  "    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;" \
  "    if (false) return null;"

mutate "a bad link is blanked instead of refused" src/fanart.js \
  "    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;" \
  "    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';"

mutate "the URL parser is swapped for a string test" src/fanart.js \
  "    let parsed;
    try { parsed = new URL(text); } catch { return null; }" \
  "    let parsed;
    try { parsed = { protocol: text.slice(0, text.indexOf(':') + 1), href: text }; } catch { return null; }"

# --- text ------------------------------------------------------------
mutate "newlines survive in a name" src/fanart.js \
  "    return value.replace(/[\\r\\n\\t]/g, ' ').trim().slice(0, limit);" \
  "    return value.trim().slice(0, limit);"

mutate "a non-string becomes the word undefined" src/fanart.js \
  "    if (typeof value !== 'string') return '';" \
  "    if (typeof value !== 'string') return String(value);"

# --- consent ---------------------------------------------------------
mutate "THE PERMISSION TICK IS NO LONGER CHECKED" src/fanart.js \
  "    if (body.consent !== true) {" \
  "    if (false) {"

mutate "a truthy consent value counts" src/fanart.js \
  "    if (body.consent !== true) {" \
  "    if (!body.consent) {"

mutate "THE BROWSER SUPPLIES THE CONSENT WORDING" src/fanart.js \
  "            // OUR wording, never theirs.
            CONSENT_TEXT," \
  "            body.consentText || CONSENT_TEXT,"

mutate "the consent wording drifts from the page" src/fanart.js \
  "    + 'ask for it to be taken down at any time.';" \
  "    + 'ask for it to be removed whenever I like.';"

# --- submitting ------------------------------------------------------
mutate "Turnstile stops gating the form" src/fanart.js \
  "    if (!check.ok) {" \
  "    if (false) {"

mutate "a nameless submission is accepted" src/fanart.js \
  "    if (!artistName) return fail('Please tell us how you would like to be credited.');" \
  "    if (false) return fail('Please tell us how you would like to be credited.');"

mutate "a submission with no art link is accepted" src/fanart.js \
  "    if (!artUrl) return fail('Please give us a link to your art.');" \
  "    if (false) return fail('Please give us a link to your art.');"

mutate "a malformed art link is let through as blank" src/fanart.js \
  "    if (artUrl === null) return fail('That art link does not look like a web address.');" \
  "    if (false) return fail('That art link does not look like a web address.');"

mutate "a junk email is stored" src/fanart.js \
  "    if (contactEmail && !looksLikeEmail(contactEmail)) {" \
  "    if (false) {"

# --- publishing ------------------------------------------------------
mutate "publishing lets the caller supply the artist name" src/fanart.js \
  "        row.artist_name,
        row.credit_link,
        row.title," \
  "        body.artistName || row.artist_name,
        row.credit_link,
        row.title,"

mutate "publishing does not mark the submission done" src/fanart.js \
  "    await env.DB.prepare(\"UPDATE fan_art_submissions SET status = 'published' WHERE id = ?\")" \
  "    await env.DB.prepare(\"UPDATE fan_art_submissions SET status = 'new' WHERE id = ?\")"

mutate "a piece can be published with no image" src/fanart.js \
  "    if (!image) return fail('Upload the image before publishing.');" \
  "    if (false) return fail('Upload the image before publishing.');"

mutate "alt text is allowed to be empty" src/fanart.js \
  "        cleanText(body.altText, MAX_TITLE) || \`Fan art by \${row.artist_name}\`," \
  "        cleanText(body.altText, MAX_TITLE),"

mutate "the permission trail is not written" src/fanart.js \
  "        \`Submitted through the website form on \${row.submitted_at}, permission ticked \${row.consent_at}.\`," \
  "        ''," \

# --- the public reader -----------------------------------------------
mutate "THE PUBLIC READER IS POINTED AT THE SUBMISSIONS TABLE" src/index.js \
  "            'SELECT * FROM fan_art WHERE enabled = 1 ORDER BY position, id').all();" \
  "            'SELECT * FROM fan_art_submissions ORDER BY id').all();"

mutate "taken-down pieces are served again" src/index.js \
  "            'SELECT * FROM fan_art WHERE enabled = 1 ORDER BY position, id').all();" \
  "            'SELECT * FROM fan_art ORDER BY position, id').all();"

mutate "the permission note is handed to the public" src/index.js \
  "            altText: r.alt_text || ''," \
  "            altText: r.alt_text || '', permission_note: r.permission_note,"

mutate "the admin gate moves below the admin routes" src/index.js \
  "        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        try {
            if (parts[2] === 'submissions' && !parts[3] && request.method === 'GET') {" \
  "        try {
            if (parts[2] === 'submissions' && !parts[3] && request.method === 'GET') {"

# --- the credit stays put --------------------------------------------
mutate "the gallery writer starts accepting a new artist name" src/writers.js \
  "        \`UPDATE fan_art
            SET title = ?, image = ?, alt_text = ?, enabled = ?, position = ?," \
  "        \`UPDATE fan_art
            SET artist_name = ?, title = ?, image = ?, alt_text = ?, enabled = ?, position = ?,"

mutate "the admin offers the credit as an editable field" public/admin/admin-fanart.js \
  "            credit.appendChild(el('span', ' — credit is fixed from the submission', 'muted'));" \
  "            credit.appendChild(el('span', ' — editable', 'muted'));"

# --- the page --------------------------------------------------------
mutate "THE GALLERY GOES BACK TO BUILDING MARKUP FROM STRANGERS' TEXT" public/assets/js/pages/fanart.js \
  "            link.textContent = item.artistName;" \
  "            link.innerHTML = item.artistName;"

mutate "outbound credit links lose noopener" public/assets/js/pages/fanart.js \
  "            link.rel = 'noopener noreferrer nofollow';" \
  "            link.rel = 'nofollow';"

mutate "THE REVEAL GOES BACK INSIDE THE FETCH (the invisible form bug)" public/assets/js/pages/fanart.js \
  "    reveal();

    /* ---------- the gallery ---------- */" \
  "
    /* ---------- the gallery ---------- */"

mutate "the reveal stops picking up newly rendered cards" public/assets/js/pages/fanart.js \
  "            reveal(grid);" \
  "            void grid;"

mutate "the Turnstile widget is never reset" public/assets/js/pages/fanart.js \
  "                    if (window.turnstile) window.turnstile.reset();
                    return;" \
  "                    return;"

mutate "the consent box stops being required in the markup" public/fanart.html \
  '<input type="checkbox" id="fa-consent" name="consent" required>' \
  '<input type="checkbox" id="fa-consent" name="consent">'

mutate "the Turnstile widget is removed from the form" public/fanart.html \
  '<div class="cf-turnstile" data-sitekey="0x4AAAAAAEG1e3La0sGXIWkv" data-action="fanart-submit"></div>' \
  '<div data-sitekey="0x4AAAAAAEG1e3La0sGXIWkv"></div>'

mutate "the takedown promise disappears from the page" public/fanart.html \
  "If yours is already up and you would like it changed or taken down, email us and we will." \
  "Thanks for sending it in."

mutate "the privacy page stops declaring the form" public/privacy.html \
  "        <h2>If you send us fan art</h2>" \
  "        <h2>Something else entirely</h2>"

echo
echo "  caught $caught, missed $missed"
rm -rf "$BAK"
[ "$missed" -eq 0 ]
