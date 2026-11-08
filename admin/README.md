# Admin (local only)

Built in Phase 3. This folder is outside `public/`, so Vercel never deploys it.

## Run

From the repo root (`portfolio/`):

```
npx serve . -l 5500
```

Open `http://localhost:5500/admin/index.html`. `file://` will not work because the admin `fetch`es `../public/data/*.json`.

## Workflow

1. The admin loads `public/data/*.json` as the baseline.
2. Import a repo from GitHub, edit projects, write notes and posts, and manage skill groups (add, rename, reorder, delete). Every change autosaves a draft to `localStorage`.
3. The sidebar shows whether the draft differs from live. "Discard draft" resets to live.
4. Export `projects.json` / `blog.json` / `skills.json` (validated first; errors block export), or in Chromium use "Write to folder…" and pick `public/data/`.
5. Commit and push. Vercel redeploys.

## Notes

- Re-importing a repo that is already in the list only refreshes `languages` and `readme_excerpt`. Notes, highlights, order, summary and description are never touched.
- The optional GitHub token is kept in `sessionStorage` only and is never exported.
- Drafts live in one browser's `localStorage` and can be wiped. Git is the source of truth: export and commit often.
- IDs are permanent (they are in public URLs), so the editor locks them after the first save.
