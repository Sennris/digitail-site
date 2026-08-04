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
