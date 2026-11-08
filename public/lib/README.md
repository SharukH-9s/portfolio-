# Vendored libraries

Not yet downloaded. They are first needed in Phase 2 (markdown rendering) and Phase 3 (admin preview).

Download pinned versions from the repo root:

```sh
curl -L -o public/lib/marked.min.js  https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
curl -L -o public/lib/purify.min.js  https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
```

Then record the versions here:

| File | Version |
|---|---|
| `marked.min.js` | 12.0.2 |
| `purify.min.js` | 3.1.6 |

Always render markdown as `DOMPurify.sanitize(marked.parse(md))`.
