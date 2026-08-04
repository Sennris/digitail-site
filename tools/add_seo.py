#!/usr/bin/env python3
"""
Adds the SEO and link-preview tags to every public page.

Without Open Graph tags, a link posted in Discord, Bluesky, Slack or
anywhere else shows as a bare URL. With them it shows a title, a
description and the share card.
"""

import re, os

DEST = "/home/claude/digitail-site/public"
SITE = "https://www.digitailstudios.com"

# path -> (canonical slug, title, description)
PAGES = {
    "index.html": (
        "",
        "Digi Tail Studios | Indie Game Development from Aotearoa",
        "An indie game studio in Otautahi Christchurch, Aotearoa New Zealand. "
        "Honest devlogs, a game in the works, and a community that gives a fox."
    ),
    "game.html": (
        "game",
        "Our Game | Digi Tail Studios",
        "The game we're building at Digi Tail Studios. Follow along for "
        "development updates, mechanics, and the road to release."
    ),
    "devlogs.html": (
        "devlogs",
        "Dev Logs | Digi Tail Studios",
        "Real talk about game development. Our wins, our bugs, our late-night "
        "debugging sessions, and everything in between. No corporate polish."
    ),
    "about.html": (
        "about",
        "The Pack | Digi Tail Studios",
        "Meet the people behind Digi Tail Studios, an indie game studio built "
        "on putting human wellbeing ahead of output."
    ),
    "foxes.html": (
        "foxes",
        "Our Foxes | Digi Tail Studios",
        "We don't just like foxes in our games, we help protect them in the "
        "real world through digital adoption packages."
    ),
    "social.html": (
        "social",
        "Social Feed | Digi Tail Studios",
        "Our latest posts, videos and updates from across the internet, "
        "gathered in one place."
    ),
    "thankyou.html": (
        "thankyou",
        "Welcome to the Skulk | Digi Tail Studios",
        "You're on the list. Devlogs, playtest keys and studio updates "
        "are on their way."
    ),
}

JSON_LD = """    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Digi Tail Studios",
      "url": "%s/",
      "logo": "%s/og-image.png",
      "description": "Indie game development studio based in Otautahi Christchurch, Aotearoa New Zealand.",
      "email": "hello@digitailstudios.com",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Christchurch",
        "addressRegion": "Canterbury",
        "addressCountry": "NZ"
      }
    }
    </script>
""" % (SITE, SITE)


def block(slug, title, desc, is_home):
    url = f"{SITE}/{slug}" if slug else f"{SITE}/"
    noindex = '\n    <meta name="robots" content="noindex, follow">' if slug == "thankyou" else ""
    return f"""    <meta name="description" content="{desc}">
    <link rel="canonical" href="{url}">{noindex}

    <!-- Link previews: Discord, Bluesky, Slack, Mastodon, etc -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Digi Tail Studios">
    <meta property="og:locale" content="en_NZ">
    <meta property="og:locale:alternate" content="mi_NZ">
    <meta property="og:url" content="{url}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{desc}">
    <meta property="og:image" content="{SITE}/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Digi Tail Studios: indie game development from Aotearoa">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{desc}">
    <meta name="twitter:image" content="{SITE}/og-image.png">

    <meta name="theme-color" content="#1D0D12">
"""


print(f"{'page':<16}{'canonical':<12}{'meta':>6}{'og':>5}{'ld':>5}")
print("-" * 46)

for fname, (slug, title, desc) in PAGES.items():
    path = f"{DEST}/{fname}"
    if not os.path.exists(path):
        continue
    h = open(path, encoding="utf-8").read()

    # strip any previous run so this is safe to re-run
    h = re.sub(r'\n?    <meta name="description".*?<meta name="theme-color"[^>]*>\n', '\n', h, flags=re.S)
    h = re.sub(r'\n?    <script type="application/ld\+json">.*?</script>\n', '\n', h, flags=re.S)

    tags = block(slug, title, desc, fname == "index.html")
    if fname == "index.html":
        tags += JSON_LD

    # sits right after the viewport meta
    m = re.search(r'(<meta name="viewport"[^>]*>\n)', h)
    if m:
        h = h[:m.end()] + tags + h[m.end():]

    # screen-reader language sync on every page
    if 'lang-attr.js' not in h:
        h = h.replace('</body>', '    <script src="/assets/js/lang-attr.js"></script>\n</body>')

    # navigation needs a label when there is more than one nav landmark
    h = h.replace('<nav class="site-nav">', '<nav class="site-nav" aria-label="Main">')

    open(path, "w", encoding="utf-8").write(h)
    print(f"{fname:<16}{('/' + slug) if slug else '/':<12}"
          f"{'yes':>6}{'yes':>5}{('yes' if fname == 'index.html' else '-'):>5}")

print("-" * 46)
