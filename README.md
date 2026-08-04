# Digi Tail Studios website

Static site on Cloudflare Pages, moving toward a D1-backed CMS.

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
| 1 | D1 database plus read API | next |
| 2 | Write API plus admin login | |
| 3 | R2 image uploads | |
| 4 | Newsletter in D1 | |
| 5 | Design punch-up | |
| 6 | SEO, analytics, accessibility, backups | |

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

Visit `/admin/setup.html`. It only works when no admin account exists,
so to reset a forgotten password, clear the account first:

```
npx wrangler d1 execute digitail --remote --command="DELETE FROM admin_users"
```

Then go to `/admin/setup.html` and create it again.

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
