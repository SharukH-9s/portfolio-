# Portfolio — Mohaiminul Hassan Sharukh

Plain HTML + CSS + vanilla JS, data-driven from JSON. Hosted on Vercel.

## Layout

```
public/   deployed site (Vercel Output Directory = public)
admin/    local-only admin tool, never deployed
```

Content lives in `public/data/projects.json` (projects + embedded notes) and `public/data/blog.json`.

## Run locally

`fetch()` doesn't work on `file://`, so use a static server from this folder:

```sh
npx serve .
# or
python -m http.server 5500
```

Then open `http://localhost:5500/public/` (with `npx serve`, pass `-l 5500`; note it redirects `/public/index.html` and breaks relative paths, so use the `/public/` URL). Admin is at `/admin/index.html` (from Phase 3).
Use relative paths in public pages so they work under `/public/` locally and at `/` on Vercel.

## Data rules

- `id`: lowercase slug `[a-z0-9-]+`, unique; permanent because it appears in URLs. Note ids are unique within their project.
- `date`: ISO `YYYY-MM-DD`.
- `highlights`: max 5 (cards show the first 3).
- `languages`: percent numbers summing to about 100. Use `{}` if unknown; the UI hides the bar.
- `github_url` / `demo_url`: empty string hides the link.
- `order`: ascending display order.

`TODO` markers in the seed data are placeholders to replace with real content.

## Before going live

- `public/assets/Sharukh-CV.pdf` is a placeholder; replace it with your real CV.

- `public/project.html` is a stub until Phase 2.

## Deploy (Vercel)

Framework Preset: Other. Build Command: empty. Output Directory: `public`.

## Phases

See `# Portfolio Site Plan.md` in the parent folder.
