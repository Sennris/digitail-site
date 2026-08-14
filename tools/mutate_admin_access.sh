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
FILES=("src/auth.js" "src/access.js" "src/index.js" "wrangler.toml" "public/admin/index.html")

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
    "    if (!person.can_edit_site) return { ok: false, reason: 'not-an-editor', email: person.email };" \
    "    if (false) return { ok: false, reason: 'not-an-editor', email: person.email };"

mutate "somebody who has left keeps their access" \
    "src/auth.js" \
    "            .prepare('SELECT id, email, can_edit_site FROM people WHERE email = ? AND active = 1')" \
    "            .prepare('SELECT id, email, can_edit_site FROM people WHERE email = ?')"

mutate "a valid token from anyone is enough, no team lookup" \
    "src/auth.js" \
    "    if (!person) return { ok: false, reason: 'not-on-team', email: identity.email };" \
    "    if (!person) person = { id: 0, email: identity.email, can_edit_site: 1 };"

# NOT mutated: the "if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)" guard
# in accessSession. src/access.js carries the same check, so removing this
# one changes no outcome and no test can catch it. It stays because it
# fails fast and survives somebody reordering the checks below it - at
# which point it stops being redundant. Listing a mutation that can never
# be caught would make this harness lie about its own coverage.
# (The same guard IS mutation-tested where it lives, in src/access.js.)

mutate "a refusal is quietly turned into a session" \
    "src/auth.js" \
    "    return result.ok ? result.session : null;" \
    "    return result.session || { email: 'unknown', viaAccess: true };"

mutate "every refusal collapses into one reason" \
    "src/auth.js" \
    "    if (!identity) return { ok: false, reason: 'no-token' };" \
    "    if (!identity) return { ok: false, reason: 'not-on-team' };"

mutate "an unconfigured Worker lets everyone in" \
    "src/auth.js" \
    "        return { ok: false, reason: 'not-configured' };" \
    "        return { ok: true, session: { email: 'nobody', viaAccess: true } };"

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

mutate "a cookie is minted again when an admin page is served" \
    "src/index.js" \
    "            fresh.headers.set('Cache-Control', 'no-store');" \
    "            fresh.headers.set('Cache-Control', 'no-store');
            fresh.headers.append('Set-Cookie', 'dt_session=x');"

mutate "the deleted login route comes back" \
    "src/index.js" \
    "    return fail('Unknown auth action', 404);" \
    "    if (action === 'login') return fail('gone', 410);
    return fail('Unknown auth action', 404);"

mutate "the admin gate exempts a path again" \
    "src/index.js" \
    "        if (url.pathname.startsWith('/admin')) {" \
    "        if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login')) {"

mutate "the website's aud drifts from the hub's" \
    "wrangler.toml" \
    'ACCESS_AUD = "89b16d953df151a6b1f0c82fcdf13fecd0bb783507a67b551081dc8da1f9cee1"' \
    'ACCESS_AUD = "a-different-application-entirely"'

mutate "Sign out goes back to clearing a cookie of ours" \
    "public/admin/index.html" \
    '<a class="btn-rugged" href="/cdn-cgi/access/logout">' \
    '<a class="btn-rugged" href="/admin/login.html">' 

mutate "the copied verifier loses its warning" \
    "src/access.js" \
    " * IF YOU CHANGE ONE, CHANGE BOTH." \
    " * They are similar."

echo
echo "=============================================="
echo "  caught: $CAUGHT    missed/skipped: $MISSED"
echo "=============================================="

[ "$MISSED" -eq 0 ] || exit 1
