# Super Essex Conference — Website

Static website for the **Super Essex Conference (SEC)** — 40 member high schools in
Essex County, New Jersey. **Live at https://secconferencenj.com**

This repo is fully self-contained. Everything the site serves is here; there is no
database and no separate backend.

---

## What it is

- A **static site** — plain HTML/CSS/JS, no framework, no build step.
- Content is **data-driven** from JSON files in `data/`.
- The **conference schedule** is aggregated automatically from **ArbiterLive** every
  3 hours by a GitHub Action and committed back to this repo.
- Hosted on **Netlify** (auto-deploys on every push to `main`).

## Run it locally

Requires **Node.js 18+**. No install needed just to preview:

```
node scripts/preview-server.js 9200
```

Then open **http://localhost:9200**.

## Repository layout

| Path | What it is |
|------|-----------|
| `index.html`, `schools.html`, `calendar.html`, `info.html`, `websites.html`, `links.html`, `videos.html` | The pages |
| `css/redesign*.css` | Styles |
| `js/redesign-*.js` | Front-end scripts that render the data-driven sections |
| `data/*.json` | **Editable content** (see below) |
| `data/schedule.json`, `data/schedule/` | **Generated** schedule data — do not hand-edit |
| `scripts/` | Node scripts: the schedule pipeline + image tools |
| `images/logos/optimized/<slug>.png` | School crests |
| `images/photos/` | Homepage hero photos |
| `images/sec-mark.svg`, `images/sec-logo.svg` | Brand marks |
| `.github/workflows/schedule.yml` | The 3-hour schedule auto-rebuild |
| `admin/` | Decap CMS config (staged, not yet activated) |

> **Note:** many CSS classes and JS selectors use an `njac-` prefix inherited from
> the original template (e.g. `.njac-today`). They are load-bearing — **do not rename
> them.** Only the *display text* was rebranded to SEC.

## Editing content (the common tasks)

- **Hero photo:** drop a JPG in `images/photos/`, add an entry to `data/slides.json`.
- **SEC Vision video:** add `{ "id": "<youtube-id>", "title": "…", "sport": "…" }` to
  `data/videos.json`. The first entry is the large feature.
- **Standings — turn a sport on for its season:** in `data/standings.json`, rename that
  sport's `"pendingSlug"` to `"slug"`.
- **Announcement pop-up:** in `data/announcement.json`, set `"active": true`, write the
  message, and change `"id"` to something new so returning visitors see it.
- **Athletic directors:** fill the `ad`/`email`/`phone` fields in `data/directory.json`.
- **Schools:** `data/schools.json` (name, slug, ArbiterLive schedule URL).

## Schedule pipeline (automatic)

All 40 schools are on **ArbiterLive**; each entity ID lives in
`scripts/arbiter-schools.json`.

- Full rebuild: `node scripts/build-schedule.js` → writes `data/schedule.json`
- Split for the site: `node scripts/split-schedule.js` → writes `data/schedule/`
  month files (this is what the calendar actually loads)

The schedule scripts use **Node built-ins only** — no `npm install` required.
`.github/workflows/schedule.yml` runs both every 3 hours and commits the result.
For that commit to succeed, the repo's **Settings → Actions → General → Workflow
permissions** must be set to **"Read and write."**

## Deploy

- **Netlify**, connected to this repo's `main` branch.
  Build command: *(none)* · Publish directory: `.`
- **Domain:** secconferencenj.com — GoDaddy DNS pointed at Netlify
  (A `@` → `75.2.60.5`, CNAME `www` → the Netlify subdomain). SSL is automatic.

## Regenerating brand images (rare)

`scripts/build-brand-images.js` needs the `sharp` library — run `npm i sharp` first.
Not needed for normal operation.

## Handing this off

To transfer ownership, give the new maintainer:
1. Access to this **GitHub repo**,
2. The **Netlify** site, and
3. The **GoDaddy** domain.

That's everything — the site is entirely contained in this repository.
