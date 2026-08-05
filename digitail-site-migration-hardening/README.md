# Digi Tail Studios website

A Cloudflare Worker serving static assets, backed by a D1 database
with a browser-based admin panel. Push to `main` to deploy.

---

## Folder layout

```
public/                     everything that gets served
├── index.html              homepage
├── about.html              the pack
├── devlogs.html            dev logs
├── foxes.html              adopted foxes
├── game.html               Project Paper Crown
├── social.html             social feed
├── thankyou.html           newsletter confirmation
├── *.json                  content files (moving into D1 in Phase 1)
├── admin/
│   ├── index.html          content manager
│   └── admin-script.js
└── assets/
    ├── css/
    │   ├── core.css        THE DESIGN SYSTEM. Change things here.
    │   └── pages/*.css     per-page styles only
    ├── js/
    │   ├── site.js         shared behaviour (staged, see below)
    │   └── pages/*.js      per-page scripts
    └── fonts/              display webfont goes here
```

---

## Where to change things

**Colours, fonts, buttons, cards, shadows, the footer, anything that
appears on more than one page:** `public/assets/css/core.css`

It is organised into numbered sections with the palette at the top:

```css
--long-black:     #1D0D12
--extra-foam:     #DAD2CA
--frozen-juniper: #5DCCCA
--arctic-willow:  #B9CCCC
--flat-white:     #E5DABF
```

Change a value there and it updates across all 8 pages at once.

**Something that only affects one page:** `public/assets/css/pages/<page>.css`

---

## What Phase 0 changed

Every page used to carry its own copy of the whole design system inline.
That meant 8 copies of the same CSS, which had already drifted apart:
`.top-bar` had 4 different definitions, `.hero-section` had 4, `.container`
had 3.

Phase 0:

* Extracted the shared design system into `core.css`
* Removed 39 rules from page files that were byte-identical to `core.css`
* Moved all inline `<style>` and `<script>` blocks into external files
* Renamed the three `.top-bar` variants into `.top-bar`, `.top-bar--split`
  and `.top-bar--inline`, since they were three different components
  sharing one class name
* Added a `prefers-reduced-motion` block and visible keyboard focus states

Rendering is unchanged. Only rules that were exactly identical to the
`core.css` version were removed, so nothing can look different.

---

## Deliberately not done yet

`assets/js/site.js` contains consolidated versions of the language toggle,
scroll reveal and easter eggs, but **it is not wired into the pages yet**.

Reason: the shared JavaScript is interleaved with page-specific code
differently on every page. Three separate attempts to split it
automatically each produced broken output, caught by `node --check`.
Rather than ship something subtly broken, the page scripts were extracted
verbatim and the consolidation will be done one page at a time with the
syntax checker run after each.

The CSS consolidation was the important half of Phase 0 and that is done.

---

## Local preview

```bash
cd public
python3 -m http.server 8000
```

Then open http://localhost:8000

---

## Deploying

Pushing to `main` deploys automatically once the repo is connected to
Cloudflare Pages. See the setup steps you were given, or Cloudflare
dashboard: Workers and Pages, then your project, then Settings, then
Builds and deployments.

Build settings:

* Build command: *(leave empty)*
* Build output directory: `public`

---

## Roadmap

| Phase | What | Status |
|---|---|---|
| 0 | Consolidate CSS and JS, repo, deploy pipeline | CSS done, JS partial |
| 1 | D1 database plus read API | done |
| 2 | Write API plus admin login | done |
| 3 | R2 image uploads | done |
| 4 | Newsletter in D1 | not started |
| 5 | Design punch-up | done |
| 6 | SEO, analytics, accessibility, backups | done |

---

## Phase 1: the content database

Content now lives in Cloudflare D1 instead of `.json` files.

### API endpoints (read only for now)

| URL | Returns |
|---|---|
| `/api/content/devlogs` | all published devlogs, newest first |
| `/api/content/foxes` | adopted foxes |
| `/api/content/team` | the pack |
| `/api/content/social` | social posts, newest first |
| `/api/content/tags` | tag definitions |
| `/api/content/homepage` | homepage config, mascot, announcement, links |
| `/api/content/game` | game info |
| `/api/health` | quick check that the Worker is alive |

Each returns exactly the same JSON shape the old files did. That is
verified by `tools/verify_api.py`, which rebuilds the database locally
and deep-diffs every endpoint against the original file.

### Files

```
src/index.js                 the Worker: API plus static asset serving
migrations/0001_initial.sql  schema
migrations/0002_seed.sql     your existing content, generated
tools/make_seed.py           regenerates the seed from .json files
tools/verify_api.py          proves API output matches the old files
```

### The old .json files

They are still sitting in `public/` and nothing reads them anymore.
Leave them there until the site is confirmed working on the database,
then they can be deleted. They are your rollback.

---

## Phase 2: admin login and saving

The admin panel now loads live content and saves straight to the database.
No more importing and downloading JSON files.

### How it works

* Open `/admin/` and you get a login page if you aren't signed in
* Once in, the panel loads everything from the API automatically
* **Save to site** writes it back. That's the whole workflow.

### API

| Method | URL | Auth |
|---|---|---|
| GET | `/api/content/<type>` | public |
| PUT | `/api/content/<type>` | login required |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | - |
| GET | `/api/auth/me` | - |

### Security

* Passwords hashed with PBKDF2-SHA256, 210,000 iterations, random salt
* Sessions are HMAC-signed, HttpOnly, Secure, SameSite=Strict, 12 hour expiry
* 5 failed logins from one IP triggers a 15 minute lockout
* Login responses take the same time whether or not the email exists
* `SESSION_SECRET` lives in a Cloudflare secret, never in this repo

### A note on how saving works

The admin panel keeps each content type as a whole list in memory, so
saving replaces the whole collection in one transaction rather than
updating single rows. Simple and safe at this scale. If the devlog count
ever reaches the thousands, `src/writers.js` is the file to revisit.

### Setting up or resetting your password

Visit `/admin/setup.html`. It only works when the site has never been
set up. See **Migrations > Resetting a forgotten password** below —
clearing `admin_users` alone is no longer enough, on purpose.

### Why the iteration count looks low

PBKDF2 runs at 8,000 iterations rather than the 200,000+ you would use
on a normal server. Two hard constraints:

* Cloudflare Workers rejects PBKDF2 above 100,000 iterations outright
* The Workers free plan allows 10ms of CPU per request, which caps this
  at roughly 10,000 iterations in practice

To compensate, every password is peppered with `SESSION_SECRET` before
hashing. That secret lives in Cloudflare, never in the database, so a
stolen copy of the database cannot be brute forced offline. Combined
with the 5-attempts-per-15-minutes lockout, this is sound for a
single-admin site.

**Because the pepper is `SESSION_SECRET`, changing that secret
invalidates your password.** If you ever rotate it, reset the account
via `/admin/setup.html` afterwards.

### Tests

```
python3 tools/verify_api.py    # API output matches the original files
python3 tools/test_writes.py   # saving and reloading preserves everything
```

---

## Phase 3: image uploads

Images live in an R2 bucket and are served back through the Worker at
`/media/<key>`. No second domain, no public bucket to configure.

### Using it

Every image field in the admin panel now has an **Upload image** button
and a **Library** button. You can also drag a file straight onto the
field. The URL fills itself in.

The Library lets you reuse anything already uploaded.

### Compression

Images are resized and converted to WebP **in your browser** before
upload: longest side capped at 1600px, quality 0.85. A 6MB phone photo
lands as roughly 200KB. If WebP comes out larger than the original, the
original is kept instead.

GIFs are passed through untouched so animation survives.

### Caching

Object keys include a hash of the file contents, so the same URL always
means the same bytes. They're served `immutable` with a one year cache
and answer conditional requests with a 304.

### API

| Method | URL | Auth |
|---|---|---|
| POST | `/api/media/upload` | login required |
| GET | `/api/media` | login required |
| DELETE | `/api/media/<id>` | login required |
| GET | `/media/<key>` | public |

### Limits

10MB per file, JPG / PNG / WebP / GIF / AVIF. R2's free tier gives you
10GB, which at ~200KB per image is somewhere north of 40,000 pictures.

---

## Phase 5: the design pass

### Typography

| Role | Font | Why |
|---|---|---|
| Display | Bricolage Grotesque 800 | quirky and characterful without being childish |
| Body | Nunito | rounded terminals, cosy, very readable |
| Mono | JetBrains Mono | the techy edge, used for labels and taglines |

Loaded from Google Fonts with `subset=latin,latin-ext` so macrons
(ā ē ī ō ū) are covered. **Check a te reo page after deploying.** If any
macron renders in a different face to the letters around it, tell me and
I'll swap the display font.

### What changed

* **Grain and dot grid on the background.** Flat `#1D0D12` was most of why
  it read as unfinished. There's now a film grain overlay and a faint dot
  grid underneath.
* **Cards cycle through the palette.** Every card used to be Arctic
  Willow. They now alternate Arctic Willow, Flat White and Extra Foam,
  each with its own rotation angle.
* **Fluid type.** Headings use `clamp()`, so the homepage title is
  genuinely huge on desktop and still fits a phone.
* **Two-colour text shadows** on headings, teal then black, rather than
  a flat black offset.
* **A real navigation bar,** sticky, on every page. The homepage had none.
* **A scrolling ticker** under the homepage nav. Pauses on hover.
* **Placeholders that look deliberate:** diagonal stripes in the palette
  with a paw in the corner, rather than an empty dashed box.
* **Staggered reveals.** Add `.stagger` to a grid and its children arrive
  in sequence instead of all at once.
* **Springier hover states.** Cards lift, straighten and scale slightly.
* **Skip-to-content link** and visible focus rings throughout.

### Finishing the Phase 0 consolidation

51 drifted rules were removed from the page stylesheets so `core.css`
could actually take effect. Those pages had their own conflicting copies
of `.card`, `.image-placeholder`, `footer`, `.btn-rugged` and others.
`content-manager.css` was left alone, since the admin panel's `.card` is
a genuinely different component.

### Where to tune it

All in `core.css`:

* Loudness of the grain: `body::after { opacity }`
* Card rotation angles: the `.card:nth-child()` rules
* Ticker speed: the `ticker-scroll` animation duration
* Heading size: `--size-mega`

---

## Phase 5.1: fixes from the first review

### Two bugs traced back to Phase 0

The original CSS splitter keyed rules by selector in a dictionary and did
not separate `@media` blocks from top-level rules. So a mobile override
like `.card { transform: rotate(0deg) }` silently destroyed the real
top-level `.card` rule that carried `display: flex; flex-direction: column`.

That is why the devlog cards fell apart and why the Steam wishlist button
rendered as a plain underlined link: `.btn-massive` lost its definition
the same way.

The page stylesheets have been **rebuilt from the original HTML** with a
parser that respects the media-query boundary, and the split is now done
by CSS **property** rather than by selector: `core.css` owns the visual
properties, each page keeps its own layout and structure. Regenerate with
`tools/rebuild_page_css.py` if it is ever needed again.

### Also fixed

* **Grain is visible now.** It was set to `mix-blend-mode: overlay`, which
  on a near-black background cancels itself out almost entirely.
* **Language toggle moved into the nav.** The old `.top-bar` was
  absolutely positioned at `top: 0` and collided with the new sticky nav.
  The "Back to Den" link went with it, since the nav has a home link.
* **Fox year badge is a sticker.** It hangs off the top-right corner of
  the photo instead of sitting inside it.
* **Community banners drift** across the page with coloured left spines
  instead of being identical full-width bars.

### Asymmetry

New utilities in `core.css` section 18:

| Class | Effect |
|---|---|
| `.split-asym` | Two columns, 1.35fr / 0.85fr, second one dropped 4.5rem |
| `.split-asym--flip` | Same, mirrored |
| `.stack-drift` | Each child steps further across the page |
| `.offset-left` / `.offset-right` | Pull a block out of the column |
| `.statement` | Big off-centre heading; wrap words in `<em>` for a highlight slab |
| `.sticker-label` | Corner label that hangs half outside its parent |

All of them collapse to a single column under 900px.

Applied so far to the homepage "den" tagline and the foxes charity
section. Any other section can take them by adding the class.

### Ticker

No longer hardcoded. It reads from the homepage settings, so it is edited
in the admin panel: **Homepage tab, at the top**. One message per line,
a show/hide toggle, a speed slider and a live preview.

---

## Phase 5.3

### Team card colours stopped striping

The colourways were on a 3-cycle and the grid is 3 columns, so every
column came out one flat colour. They are now on a **7-cycle**, and
rotation is on a separate **5-cycle**. 7, 5 and 3 share no factors, so
colour and tilt both walk across the rows and never line up with the
columns or with each other. The rarity stripe also flips direction on
even cards.

### Foil sweep

Was 0.65s, fast enough that you registered a flicker without seeing what
happened. Now 1.5s on an ease-out curve, with a wider, brighter band
(a white core, a teal trailing edge and soft falloff on both sides) so
the light visibly travels across the card.

### Two bugs fixed

* **Bio panel leaking below the cards.** `.card-back` sat at `top: 100%`
  and depended on `overflow: hidden` to stay out of sight. The corner
  number badge needs `overflow: visible`, which exposed it. It is now
  hidden with `opacity` and `visibility` instead of being clipped, and
  fades up rather than sliding.
* **"Click for bio" was a lie.** The flip was hover-only. Cards now
  toggle on click too, which also means it works on phones, where hover
  does not exist.

### Hero title keyline

Flat White sitting directly against Frozen Juniper vibrates at the edge
and is tiring to look at. There is now a 2px Long Black keyline drawn all
the way around the letterforms, between the cream and the teal shadow,
so the two bright colours never touch. The highlighter slabs in
`.statement` got a matching 2px outline.

---

## Phase 5.4

### Admin "Back to Site" went nowhere useful

The link was `href="index.html"`, which from inside `/admin/` resolves
to `/admin/index.html` — the admin homepage. It is now `href="/"`.

### Charity section on the foxes page

Three separate problems:

* **Glare.** It was a solid `rgba(93, 204, 202, 0.95)` panel filling most
  of the viewport. That much saturated teal behind cream text is
  genuinely fatiguing, and it was the only block of its kind on an
  otherwise dark site. It is now dark like everything else, with the teal
  as a border, a soft corner wash and the heading slab.
* **Alignment.** The section had `text-align: center` and the paragraph
  had `margin: 0 auto`, so the body copy centred itself inside a column
  that sat beside a left-aligned heading. Both now left aligned.
* **Stray disclaimer.** The legal note was a third child of a two-column
  grid, so it dropped into column one. It now spans the full width with
  a dashed rule above it.

The columns were also flipped to `.split-asym--flip`, so the long
paragraph gets the wide column and the short heading gets the narrow one,
rather than the other way round.

The black-outlined slab behind "PACK" is untouched.

---

## Phase 5.5

* **Globe emoji removed from the language button.** It wasn't rendering
  on Windows anyway, so it was just an empty box taking up space.
* **Card stripes are consistent now.** Even cards used to invert the
  gradient, so odd cards read as a teal bar with black ticks and even
  cards as a black bar with teal ticks. Against the dark page those
  looked like completely different stripe lengths rather than a
  deliberate variation. Every card gets the same stripe; the variety
  comes from the colour and rotation cycles instead.

---

## Phase 6: SEO, link previews, 404, accessibility

### Link previews

Every page now carries Open Graph and Twitter Card tags. A link posted in
Discord, Bluesky, Slack or Mastodon shows a title, a description and the
share card instead of a bare URL.

`public/og-image.png` (1200x630) is a **placeholder** built in the studio
palette. Replace it with real key art when you have some, keeping the same
filename and dimensions and nothing else needs to change. Regenerate the
placeholder with `python3 tools/make_og_image.py`.

To re-run the tag injection after editing descriptions:

```
python3 tools/add_seo.py
```

Descriptions live at the top of that file, one per page. It strips its own
previous output first, so it is safe to run repeatedly.

### Search engines

* `robots.txt` allows everything except `/admin/` and `/api/`
* `sitemap.xml` lists the six public pages
* Every page has a canonical URL on `www.digitailstudios.com`, so the
  `www` and non-`www` versions don't compete with each other
* `thankyou.html` is `noindex` — it should never appear in search results
* The homepage carries Organization structured data

### 404

`public/404.html`, served automatically thanks to
`not_found_handling = "404-page"` in `wrangler.toml`. Bilingual, has the
nav, a wandering fox, and links back into the site.

### Accessibility

* **`<html lang>` now follows the language toggle.** The toggle only
  swapped a class on `<body>`, so a screen reader was announcing te reo
  Māori using English pronunciation rules. `assets/js/lang-attr.js`
  watches the body class and keeps the attribute in step.
* Alt text on team avatars and social thumbnails; admin preview images
  explicitly marked decorative so screen readers skip them
* `aria-label="Main"` on the nav
* Skip-to-content link on every page
* Visible focus rings and a `prefers-reduced-motion` block (added earlier)

### Analytics, one manual step

Cloudflare Web Analytics is free, needs no cookie banner, and is not
wired up yet because it needs a token from your dashboard:

1. Cloudflare dashboard, **Analytics & Logs**, **Web Analytics**
2. **Add a site**, enter `digitailstudios.com`
3. Copy the `<script>` snippet it gives you
4. Paste it just before `</body>` in each page in `public/`

Or send me the token and I'll wire it in.

---

## Phase 6.1: accessibility

### On the "accessibility mode" question

There isn't one, deliberately. A separate accessible version means the
main site stays broken and disabled visitors get a second-class
experience that drifts out of sync. Overlay widgets (AccessiBe, UserWay
and similar) are worse again and are actively campaigned against by the
people they claim to help.

Instead: the site itself works for everyone, and there is a small
**Display options** panel in the nav for the things the design invented
that no OS setting knows about.

### Display options

| Option | Effect | Defaults from |
|---|---|---|
| Reduce motion | Stops the ticker, kills reveals and the foil sweep | `prefers-reduced-motion` |
| Reduce visual noise | Removes grain and dot grid, straightens tilted cards | `prefers-contrast` |
| Larger text | Scales the whole site to 118% | off |

Saved to localStorage. If the visitor's OS already asks for reduced
motion, they get it without opening the panel.

Also honoured automatically:

* `prefers-contrast: more` — noise off, borders thickened
* `forced-colors: active` (Windows High Contrast) — everything drawn with
  backgrounds and shadows keeps a real border, so nothing vanishes

### Things that were unusable without a mouse

* **Team bios.** The flip was a click handler on a `<div>`. Keyboard and
  screen reader users could not open a single bio. The hint is now a real
  `<button>` with `aria-expanded` and `aria-controls`. Clicking the card
  still works.
* **Hidden paws.** `<span>` elements with click handlers. Now buttons
  with accessible names, so the easter egg is findable by keyboard.
* **Modals.** No Escape key, no focus trap, no focus return. All three
  now handled, plus `role="dialog"` and `aria-labelledby`.

### Contrast

Measured every colour pair in the palette. Nine of ten pass AAA:

| | ratio |
|---|---|
| Body text on Long Black | 12.56:1 |
| Teal on Long Black | 9.79:1 |
| Black on Arctic Willow | 11.24:1 |
| Button labels | 9.79:1 |

One failure, now fixed: the bio hint was 0.66rem at 55% opacity, giving
3.58:1 against the card. It is now a bordered button at 11.24:1.

### Touch targets

WCAG 2.2 requires 24x24 CSS pixels minimum on interactive elements. Nav
links, buttons and the paws were all under. Now enforced in `core.css`
section 24.

---

## Phase 6.2: the fix list

### 1. Click anywhere on a card

`assets/js/card-click.js`. Every card on every page opens when clicked
anywhere, and the button keeps doing exactly what it did. Three rules
stop this being annoying:

* a click on a real link or button is left alone, so nested links go
  where they say
* a click that follows a text selection is ignored, so you can still
  select and copy from a card
* the card is never given a fake button role, so keyboard users tab to
  the real button as before

### 2. Adopt box centred

`.charity-section` is a single centred column now instead of two.

### 3. Ticker

It wasn't broken, your data was older than the feature. Homepage settings
saved before the ticker existed have no `ticker` key, so the strip stayed
hidden. It now falls back to defaults when the key is missing. Open the
admin homepage tab and hit **Save to site** once and your own version is
stored properly.

### 4. Team bios open in a modal

Same pattern as the devlogs page, so both behave identically. The card
flip is gone. Escape closes, clicking the backdrop closes, focus returns
to where it was.

### 5. Two-axis devlog tags

| | what it is | looks like |
|---|---|---|
| **Primary** | which game, or studio news | solid teal, hard shadow |
| **Secondary** | what kind of update | dashed teal outline |

Managed in the admin under **Tags**: two lists, rename, recolour, add and
remove. Each devlog form has a picker for each. Your existing tags were
promoted rather than replaced — the ones under the `devlog` category
became secondary tags, since that is what they already were, and `News`
became a primary tag called `Studio News`. Nothing was deleted.

Add your game as a primary tag once it has a name.

### 6. Admin accounts

Admin panel, **Settings**: lists everyone with access, add by email and
password, remove anyone but yourself. Two guards in the API: you cannot
delete your own account while signed in, and you cannot delete the last
remaining one. Account changes apply immediately, no "Save to site"
needed.

---

## Phase 6.3: admin performance

The admin panel had become unusably slow. Not the network, a bug in
`admin-extras.js`.

`refreshPickers()` rewrote the tag `<select>` contents on every call, and
it was called from a MutationObserver callback. Rewriting the DOM inside
an observer callback retriggers that same observer, so it looped
endlessly and pinned a CPU core.

Two fixes:

1. **Guard the write.** `refreshPickers()` now compares against what is
   already there and returns without touching the DOM if nothing would
   change. No mutation means no retrigger.
2. **Debounce every observer.** All five (`admin-extras`, `media-upload`,
   `ticker-editor`, `a11y`, `card-click`) now coalesce to one pass per
   animation frame instead of running a full `querySelectorAll` on every
   individual DOM change. `admin-extras` and `ticker-editor` also
   disconnect once their panels exist, since there is nothing left to
   watch for.

Rule for anything added later: **a MutationObserver callback must never
write to the DOM unconditionally.** Check first, or disconnect while
writing.

---

## Phase 6.4

### Tag manager was invisible

It looked for a `tags-tab` or `settings-tab`. Neither exists — the tabs
are devlogs, foxes, game, homepage, social and team. The panel mounts on
the **devlogs tab** now, which is where you'd look for devlog tags
anyway. Admin accounts are on the **homepage tab**.

Both fall back to the first `*-tab` element they find, so renaming a tab
won't make them vanish again.

### A missed migration no longer blocks every save

Saving writes all collections in one go, so a missing column in `devlogs`
stopped foxes, team, tags, homepage and the ticker from saving too. One
unrun migration bricked the whole admin.

`putDevlogs` and `putTags` now catch a missing-column error, retry
without the new fields, and report what needs running. You lose the two
tags until the migration is applied; you don't lose the ability to save.

### Migrations to run

Check what your database has:

```
npx wrangler d1 execute digitail --remote --command="SELECT name FROM pragma_table_info('devlogs')"
```

If `primary_tag` isn't listed:

```
npx wrangler d1 execute digitail --remote --file=./migrations/0005_tags_and_users.sql
```

---

## Migrations

Check what the database has already had applied:

```
npx wrangler d1 execute digitail --remote --command="SELECT filename, applied_at FROM schema_migrations"
```

Then run only what is missing:

```
npx wrangler d1 execute digitail --remote --file=./migrations/000N_whatever.sql
```

Every migration except `0005` is safe to run twice — tables are
`IF NOT EXISTS`, seed rows are `INSERT OR IGNORE`, and nothing drops
anything. `0005` adds columns, which SQLite cannot guard, so a second
run stops with `duplicate column name` before changing anything. Check
the ledger first and you will not hit it.

This was not always true. Until August 2026 the schema files each opened
with `DROP TABLE IF EXISTS`, so running `0001` against the live database
would have destroyed all content, and running `0003` would have deleted
the admin account **and reopened `/admin/setup.html` to the public**.
Those DROPs now live in `tools/DANGER_reset_database.sql`, out of the
migrations folder and named so nobody runs one by accident.

Verify after changing any migration:

```
python3 tools/test_migrations.py
node --experimental-sqlite tools/test_setup_gate.mjs
```

The first builds a database, adds content that only exists in
production, re-applies everything and checks nothing was lost. The
second drives the real Worker handler against a real database to
confirm account creation stays locked once the site has been set up.

### Resetting a forgotten password

Setup is latched by an `admin_bootstrapped` row in `settings`, which
deliberately survives `admin_users` being dropped. Clear both:

```
npx wrangler d1 execute digitail --remote --command="DELETE FROM admin_users"
npx wrangler d1 execute digitail --remote --command="DELETE FROM settings WHERE key = 'admin_bootstrapped'"
```

Then visit `/admin/setup.html`.
