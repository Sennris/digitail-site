#!/usr/bin/env bash
#
# Mutation testing for the traffic history feature.
#
#   bash tools/mutate_traffic.sh
#
# Breaks the code one way at a time and confirms tools/test_traffic.mjs
# NOTICES. A test that keeps passing with the code broken is not a test.
# Eight checks on this project have passed for the wrong reason, so this
# runs before the feature is trusted.
#
# Three rules learned the hard way, all obeyed here:
#
#   - Backups are PATH-FLATTENED, never basename. public/index.html and
#     public/admin/index.html share a basename; a basename backup once
#     restored the admin page over the homepage.
#
#   - PASS COUNTS are compared, not exit codes. A crash mid-suite
#     reports zero failures and looks like a pass.
#
#   - Everything here runs on NODE, not python3. This is run from Git
#     Bash on Windows, which has no python3. A harness that cannot run
#     on the machine that needs it is not a harness.

set -u

cd "$(dirname "$0")/.." || exit 1

BAK_DIR="$(mktemp -d)"
TESTS="tools/test_traffic.mjs"

FILES=(
    "src/analytics.js"
    "src/index.js"
    "wrangler.toml"
    "public/admin/index.html"
    "public/admin/admin-traffic.js"
)

flat() { echo "$1" | tr '/' '_'; }

backup_all() {
    for f in "${FILES[@]}"; do
        cp "$f" "$BAK_DIR/$(flat "$f").bak"
    done
}

restore_all() {
    for f in "${FILES[@]}"; do
        cp "$BAK_DIR/$(flat "$f").bak" "$f"
    done
}

pass_count() {
    node --experimental-sqlite "$TESTS" 2>/dev/null \
        | grep -oE 'PASSED: [0-9]+' | grep -oE '[0-9]+' || echo "0"
}

backup_all
trap 'restore_all; rm -rf "$BAK_DIR"' EXIT

BASELINE="$(pass_count)"
echo "Baseline: $BASELINE checks passing"
echo

if [ "$BASELINE" -eq 0 ]; then
    echo "The suite does not pass before mutation. Fix that first."
    exit 1
fi

CAUGHT=0
MISSED=0

# The replacement is done in node with a plain string split, not a
# regex, so no character in the anchors needs escaping. The anchors and
# the file path go through the environment rather than the command line
# for the same reason.
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

# $1 = description, $2 = file, $3 = anchor, $4 = replacement
mutate() {
    local desc="$1" file="$2" old="$3" new="$4"

    if ! apply_mutation "$file" "$old" "$new"; then
        echo "  SKIP    $desc (anchor did not match exactly once)"
        MISSED=$((MISSED + 1))
        restore_all
        return
    fi

    local got
    got="$(pass_count)"
    if [ "$got" -lt "$BASELINE" ]; then
        echo "  caught  $desc  ($got/$BASELINE)"
        CAUGHT=$((CAUGHT + 1))
    else
        echo "  MISSED  $desc  (still $got/$BASELINE)"
        MISSED=$((MISSED + 1))
    fi
    restore_all
}

echo "Mutations:"

mutate "rule 1: a GraphQL error is treated as success" \
    "src/analytics.js" \
    "        return { ok: false, error: \`Cloudflare API error: \${first && first.message ? first.message : 'unknown'}\` };" \
    "        return { ok: true, byDate: new Map() };"

mutate "rule 1: an HTTP failure is treated as success" \
    "src/analytics.js" \
    "        return { ok: false, error: \`Cloudflare returned HTTP \${res.status}\` };" \
    "        return { ok: true, byDate: new Map() };"

mutate "rule 1: a failed refresh writes anyway" \
    "src/analytics.js" \
    "        // Rule 1. Nothing is written. The table keeps whatever it had.
        return { ok: false, error: result.error };" \
    "        result.byDate = new Map();"

mutate "rule 2: an existing row can be blanked" \
    "src/analytics.js" \
    "            if (existing.has(date)) continue;" \
    "            if (false) continue;"

mutate "rule 3: absent days are skipped instead of stored as zero" \
    "src/analytics.js" \
    "            // Rule 3: a successful answer that omits a day means zero." \
    "            continue; //"

mutate "rule 4: today is treated as a complete day" \
    "src/analytics.js" \
    "    return addDays(utcDate(now), -1);" \
    "    return utcDate(now);"

mutate "backfill only ever asks about yesterday" \
    "src/analytics.js" \
    "    const earliest = addDays(end, -(RETENTION_DAYS - 1));" \
    "    const earliest = end;"

mutate "missing secrets no longer stop the call" \
    "src/analytics.js" \
    "        return { ok: false, error: 'CF_ANALYTICS_TOKEN, CF_ACCOUNT_ID or CF_SITE_TAG is not set on this Worker' };" \
    "        return { ok: true, byDate: new Map() };"

mutate "the query filters on the public site token instead of the site tag" \
    "src/analytics.js" \
    "        filter: { siteTag: \$siteTag, date_geq: \$start, date_leq: \$end }" \
    "        filter: { date_geq: \$start, date_leq: \$end }"

mutate "the CSV header loses its UTC label" \
    "src/analytics.js" \
    "    const lines = ['date_utc,page_views,visits'];" \
    "    const lines = ['day,page_views,visits'];"

mutate "bad JSON in detail_json is no longer caught" \
    "src/analytics.js" \
    "            try { return r.detail_json ? JSON.parse(r.detail_json) : {}; }
            catch { return {}; }" \
    "            return r.detail_json ? JSON.parse(r.detail_json) : {};"

mutate "the analytics endpoints stop requiring a login" \
    "src/index.js" \
    "        const session = await requireAuth(request, env);
        if (!session) return fail('Not logged in', 401);

        if (parts[2] === 'refresh' && request.method === 'POST') {" \
    "        if (parts[2] === 'refresh' && request.method === 'POST') {"

mutate "the scheduled handler is removed" \
    "src/index.js" \
    "    async scheduled(event, env, ctx) {" \
    "    async notScheduled(event, env, ctx) {"

mutate "a second cron trigger is added" \
    "wrangler.toml" \
    'crons = ["17 3 * * *"]' \
    'crons = ["17 3 * * *", "17 15 * * *"]'

mutate "the Traffic tab loses its estimates warning" \
    "public/admin/index.html" \
    "<strong>These are estimates.</strong>" \
    "<strong>Here are the numbers.</strong>"

mutate "the Traffic tab loses its UTC label" \
    "public/admin/index.html" \
    "Dates are <strong>UTC</strong>, not New" \
    "Dates are <strong>local</strong>, not New"

mutate "the traffic table goes back to innerHTML" \
    "public/admin/admin-traffic.js" \
    "        var tbody = el('tbody');" \
    "        box.innerHTML = '';
        var tbody = el('tbody');"

echo
echo "=============================================="
echo "  caught: $CAUGHT    missed/skipped: $MISSED"
echo "=============================================="

[ "$MISSED" -eq 0 ] || exit 1
