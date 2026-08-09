#!/usr/bin/env bash
#
# Mutation testing for Cloudflare Access as the admin login.
#
#   bash tools/mutate_admin_access.sh
#
# Every mutation removes one thing standing between the public internet
# and the ability to publish to digitailstudios.com. If the suite still
# passes, that check is not tested.
#
# node only, no python3. Path-flattened backups. PASS COUNTS compared.

set -u
cd "$(dirname "$0")/.." || exit 1

BAK_DIR="$(mktemp -d)"
TESTS="tools/test_admin_access.mjs"
FILES=("src/auth.js" "src/access.js" "src/index.js" "wrangler.toml" "public/admin/login.html")

flat() { echo "$1" | tr '/' '_'; }
backup_all() { for f in "${FILES[@]}"; do cp "$f" "$BAK_DIR/$(flat "$f").bak"; done; }
restore_all() { for f in "${FILES[@]}"; do cp "$BAK_DIR/$(flat "$f").bak" "$f"; done; }

pass_count() {
    node --experimental-sqlite "$TESTS" 2>/dev/null | grep -oE 'PASSED: [0-9]+' | grep -oE '[0-9]+' || echo "0"
}

backup_all
trap 'restore_all; rm -rf "$BAK_DIR"' EXIT

BASELINE="$(pass_count)"
echo "Baseline: $BASELINE checks passing"
echo
[ "$BASELINE" -eq 0 ] && { echo "The suite does not pass before mutation. Fix that first."; exit 1; }

CAUGHT=0
MISSED=0

apply_mutation() {
    MUT_FILE="$1" MUT_OLD="$2" MUT_NEW="$3" node -e '
        const fs = require("fs");
        const p = process.env.MUT_FILE;
        const parts = fs.readFileSync(p, "utf8").split(process.env.MUT_OLD);
        if (parts.length !== 2) {
            process.stderr.write("ANCHOR MATCHED " + (parts.length - 1) + " TIMES in " + p + "\n");
            process.exit(2);
        }
        fs.writeFileSync(p, parts[0] + process.env.MUT_NEW + parts[1]);
    '
}

mutate() {
    local desc="$1" file="$2" old="$3" new="$4"
    if ! apply_mutation "$file" "$old" "$new"; then
        echo "  SKIP    $desc (anchor did not match exactly once)"
        MISSED=$((MISSED + 1)); restore_all; return
    fi
    local got; got="$(pass_count)"
    if [ "$got" -lt "$BASELINE" ]; then
        echo "  caught  $desc  ($got/$BASELINE)"; CAUGHT=$((CAUGHT + 1))
    else
        echo "  MISSED  $desc  (still $got/$BASELINE)"; MISSED=$((MISSED + 1))
    fi
    restore_all
}

echo "Mutations:"

mutate "anyone on the team can publish, permission ignored" \
    "src/auth.js" \
    "    if (!person || !person.can_edit_site) return null;" \
    "    if (!person) return null;"

mutate "somebody who has left keeps their access" \
    "src/auth.js" \
    "            .prepare('SELECT id, email, can_edit_site FROM people WHERE email = ? AND active = 1')" \
    "            .prepare('SELECT id, email, can_edit_site FROM people WHERE email = ?')"

mutate "a valid token from anyone is enough, no team lookup" \
    "src/auth.js" \
    "    if (!person || !person.can_edit_site) return null;

    return { userId: null, email: person.email" \
    "    if (!person) return { userId: null, email: identity.email, viaAccess: true };

    return { userId: null, email: person.email"

# NOT mutated: the "if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)" guard
# in accessSession. src/access.js carries the same check, so removing this
# one changes no outcome and no test can catch it. It stays because it
# fails fast and survives somebody reordering the checks below it - at
# which point it stops being redundant. Listing a mutation that can never
# be caught would make this harness lie about its own coverage.
# (The same guard IS mutation-tested where it lives, in src/access.js.)

mutate "the password cookie is checked before Access" \
    "src/auth.js" \
    "    const viaAccess = await accessSession(request, env);
    if (viaAccess) return viaAccess;" \
    "    const viaAccess = null;
    if (viaAccess) return viaAccess;"

mutate "the signature is never verified" \
    "src/access.js" \
    "    if (!ok) return null;" \
    "    ok = true;"

mutate "the audience is not checked" \
    "src/access.js" \
    "    if (!audience.includes(aud)) return null;" \
    "    if (false) return null;"

mutate "the issuer is not checked" \
    "src/access.js" \
    "    if (payload.iss !== \`https://\${teamDomain}\`) return null;" \
    "    if (false) return null;"

mutate "expiry is not checked" \
    "src/access.js" \
    "    if (typeof payload.exp !== 'number' || payload.exp <= seconds) return null;" \
    "    if (false) return null;"

mutate "any algorithm is accepted" \
    "src/access.js" \
    "    if (!header || header.alg !== 'RS256' || !header.kid) return null;" \
    "    if (!header || !header.kid) return null;"

mutate "an Access login is handed a session cookie by keepalive" \
    "src/index.js" \
    "        if (session.viaAccess) {
            return new Response(JSON.stringify({ ok: true, viaAccess: true }), {" \
    "        if (false) {
            return new Response(JSON.stringify({ ok: true, viaAccess: true }), {"

mutate "an Access login is pinned a cookie when a page is served" \
    "src/index.js" \
    "            if (session.viaAccess) {
                const viaAccessPage = new Response(page.body, page);" \
    "            if (false) {
                const viaAccessPage = new Response(page.body, page);"

mutate "the session endpoint stops reporting how somebody signed in" \
    "src/index.js" \
    "viaAccess: !!session.viaAccess" \
    "viaAccess: false"

mutate "the website's aud drifts from the hub's" \
    "wrangler.toml" \
    'ACCESS_AUD = "89b16d953df151a6b1f0c82fcdf13fecd0bb783507a67b551081dc8da1f9cee1"' \
    'ACCESS_AUD = "a-different-application-entirely"'

mutate "the login page stops skipping itself" \
    "public/admin/login.html" \
    "                if (d && d.loggedIn && d.viaAccess) window.location.replace('/admin/');" \
    "                if (false) window.location.replace('/admin/');"

mutate "the copied verifier loses its warning" \
    "src/access.js" \
    " * IF YOU CHANGE ONE, CHANGE BOTH." \
    " * They are similar."

echo
echo "=============================================="
echo "  caught: $CAUGHT    missed/skipped: $MISSED"
echo "=============================================="

[ "$MISSED" -eq 0 ] || exit 1
