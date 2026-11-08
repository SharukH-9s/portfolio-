/* Local-only admin panel. Never deployed (Vercel output dir is public/).
 *
 * Loads public/data/*.json as the baseline, edits a working copy ("draft") that is
 * autosaved to localStorage, and exports pretty-printed JSON for committing.
 */
(() => {
  'use strict';

  const { el, renderMarkdownInto } = window.Content;

  const LIVE_URLS = {
    projects: '../public/data/projects.json',
    blog: '../public/data/blog.json',
    skills: '../public/data/skills.json',
  };
  const DRAFT_KEY = 'portfolio-admin-draft-v1';
  const TOKEN_KEY = 'portfolio-admin-gh-token'; // sessionStorage only, never exported
  const SLUG_RE = /^[a-z0-9-]+$/;
  const MAX_HIGHLIGHTS = 5;

  const PROJECT_KEYS = [
    'id', 'title', 'github_url', 'demo_url', 'summary', 'description', 'highlights', 'tags',
    'languages', 'readme_excerpt', 'featured', 'order', 'updated', 'notes',
  ];
  const ENTRY_KEYS = ['id', 'title', 'date', 'summary', 'content', 'tags'];

  /* ---------- Utilities ---------- */

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function slugify(text) {
    return String(text)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  }

  function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  const splitLines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  function splitTags(text) {
    const seen = new Set();
    return text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase())) return false;
        seen.add(s.toLowerCase());
        return true;
      });
  }

  const byDateDesc = (a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) || String(a.id).localeCompare(String(b.id));

  const byOrder = (a, b) => {
    const orderOf = (p) => (Number.isFinite(p.order) ? p.order : Number.POSITIVE_INFINITY);
    return orderOf(a) - orderOf(b) || String(a.title).localeCompare(String(b.title));
  };

  /* ---------- Normalisation, serialisation, validation ---------- */

  const str = (v) => (typeof v === 'string' ? v : '');
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

  function normalizeEntry(raw) {
    const e = raw && typeof raw === 'object' ? raw : {};
    return {
      ...e,
      id: str(e.id),
      title: str(e.title),
      date: str(e.date),
      summary: str(e.summary),
      content: str(e.content),
      tags: strList(e.tags),
    };
  }

  function normalizeProject(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
      ...p,
      id: str(p.id),
      title: str(p.title),
      github_url: str(p.github_url),
      demo_url: str(p.demo_url),
      summary: str(p.summary),
      description: str(p.description),
      highlights: strList(p.highlights),
      tags: strList(p.tags),
      languages: p.languages && typeof p.languages === 'object' && !Array.isArray(p.languages) ? p.languages : {},
      readme_excerpt: str(p.readme_excerpt),
      featured: p.featured === true,
      order: Number.isFinite(p.order) ? p.order : 0,
      updated: str(p.updated),
      notes: (Array.isArray(p.notes) ? p.notes : []).map(normalizeEntry),
    };
  }

  function ordered(obj, keys) {
    const out = {};
    keys.forEach((k) => {
      if (k in obj) out[k] = obj[k];
    });
    Object.keys(obj).forEach((k) => {
      if (!(k in out)) out[k] = obj[k];
    });
    return out;
  }

  function serializeEntries(list) {
    return [...list].sort(byDateDesc).map((e) => ordered(e, ENTRY_KEYS));
  }

  function serializeProjects(list) {
    return [...list].sort(byOrder).map((p) => ({
      ...ordered(p, PROJECT_KEYS),
      notes: serializeEntries(p.notes || []),
    }));
  }

  // Pretty JSON, 2-space indent, short primitive arrays and `languages` kept inline
  // so diffs against the hand-written seed files stay small.
  function formatJson(value, key = '', indent = '') {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    const inner = `${indent}  `;

    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      const primitive = value.every((v) => v === null || typeof v !== 'object');
      if (primitive && key !== 'highlights') {
        const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
        if (inline.length <= 80) return inline;
      }
      return `[\n${value.map((v) => inner + formatJson(v, '', inner)).join(',\n')}\n${indent}]`;
    }

    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    if (key === 'languages') {
      return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    }
    return `{\n${entries
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, k, inner)}`)
      .join(',\n')}\n${indent}}`;
  }

  function normalizeSkills(list) {
    return (Array.isArray(list) ? list : [])
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({ group: str(g.group), items: strList(g.items) }));
  }

  // One group per line, in file order, matching the hand-written seed file.
  function skillsJson(groups) {
    if (!groups.length) return '[]\n';
    const lines = groups.map(
      (g) => `  { "group": ${JSON.stringify(g.group)}, "items": [${g.items.map((i) => JSON.stringify(i)).join(', ')}] }`
    );
    return `[\n${lines.join(',\n')}\n]\n`;
  }

  function validateSkills(groups) {
    const problems = [];
    groups.forEach((g, index) => {
      const label = `Skill group ${index + 1} ("${g.group || 'unnamed'}")`;
      if (!g.group.trim()) problems.push(`${label}: name is required.`);
      if (!g.items.length) problems.push(`${label}: add at least one skill.`);
      if (g.items.some((i) => !i.trim())) problems.push(`${label}: skills cannot be empty.`);
      findDuplicates(g.items.map((i) => i.toLowerCase())).forEach((d) => problems.push(`${label}: duplicate skill "${d}".`));
    });
    findDuplicates(groups.map((g) => g.group.trim().toLowerCase())).forEach((d) => problems.push(`Duplicate skill group "${d}".`));
    return problems;
  }

  const toJsonText = (value) => `${formatJson(value)}\n`;
  const projectsJson = (projects) => toJsonText(serializeProjects(projects));
  const blogJson = (posts) => toJsonText(serializeEntries(posts));

  function validateEntry(entry, label) {
    const problems = [];
    if (!entry.id) problems.push(`${label}: id is required.`);
    else if (!SLUG_RE.test(entry.id)) problems.push(`${label}: id must match [a-z0-9-]+.`);
    if (!entry.title.trim()) problems.push(`${label}: title is required.`);
    if (!isIsoDate(entry.date)) problems.push(`${label}: date must be a valid YYYY-MM-DD.`);
    if (!entry.content.trim()) problems.push(`${label}: content is empty.`);
    return problems;
  }

  function findDuplicates(ids) {
    const seen = new Set();
    const dups = new Set();
    ids.forEach((id) => (seen.has(id) ? dups.add(id) : seen.add(id)));
    return [...dups];
  }

  function validateProject(p) {
    const label = `Project "${p.id || p.title || '(new)'}"`;
    const problems = [];
    if (!p.id) problems.push(`${label}: id is required.`);
    else if (!SLUG_RE.test(p.id)) problems.push(`${label}: id must match [a-z0-9-]+.`);
    if (!p.title.trim()) problems.push(`${label}: title is required.`);
    if (p.github_url && !parseRepoUrl(p.github_url)) {
      problems.push(`${label}: GitHub URL must look like https://github.com/owner/repo.`);
    }
    if (p.demo_url && !isHttpUrl(p.demo_url)) problems.push(`${label}: demo URL must start with http:// or https://.`);
    if (p.highlights.length > MAX_HIGHLIGHTS) problems.push(`${label}: at most ${MAX_HIGHLIGHTS} highlights (has ${p.highlights.length}).`);
    if (Object.values(p.languages).some((v) => !Number.isFinite(v) || v < 0)) {
      problems.push(`${label}: languages must map names to percentages.`);
    }
    if (p.updated && !isIsoDate(p.updated)) problems.push(`${label}: updated must be YYYY-MM-DD.`);
    findDuplicates(p.notes.map((n) => n.id)).forEach((id) => problems.push(`${label}: duplicate note id "${id}".`));
    p.notes.forEach((n) => problems.push(...validateEntry(n, `${label} note "${n.id || n.title}"`)));
    return problems;
  }

  function validateProjects(projects) {
    const problems = projects.flatMap(validateProject);
    findDuplicates(projects.map((p) => p.id)).forEach((id) => problems.push(`Duplicate project id "${id}".`));
    return problems;
  }

  function validateBlog(posts) {
    const problems = posts.flatMap((p) => validateEntry(p, `Post "${p.id || p.title}"`));
    findDuplicates(posts.map((p) => p.id)).forEach((id) => problems.push(`Duplicate post id "${id}".`));
    return problems;
  }

  /* ---------- GitHub import ---------- */

  function parseRepoUrl(input) {
    const match = String(input || '')
      .trim()
      .match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
    if (!match || match[2] === '.' || match[2] === '..') return null;
    return { owner: match[1], repo: match[2] };
  }

  const repoKey = (url) => {
    const parsed = parseRepoUrl(url);
    return parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : '';
  };

  async function ghFetch(path, accept) {
    const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`https://api.github.com${path}`, { headers });
    } catch {
      throw Object.assign(new Error('Network error: could not reach api.github.com. Check your connection.'), { status: 0 });
    }
    if (response.ok) return response;

    let message;
    if (response.status === 404) {
      message = 'Not found. The repository does not exist or is private.';
    } else if (response.status === 401) {
      message = 'GitHub rejected the token (401). Clear or replace it and try again.';
    } else if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('X-RateLimit-Reset'));
      const when = reset ? new Date(reset * 1000).toLocaleTimeString() : 'later';
      message =
        response.headers.get('X-RateLimit-Remaining') === '0' || response.status === 429
          ? `GitHub rate limit reached. Resets at ${when}. A personal access token raises the limit.`
          : 'GitHub refused the request (403).';
    } else {
      message = `GitHub returned HTTP ${response.status}.`;
    }
    throw Object.assign(new Error(message), { status: response.status });
  }

  // Bytes -> percent, 1 decimal, entries < 1% dropped.
  function languagesToPercent(bytes) {
    const entries = Object.entries(bytes || {}).filter(([, n]) => Number.isFinite(n) && n > 0);
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    const out = {};
    if (!total) return out;
    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, n]) => {
        const pct = Math.round((n / total) * 1000) / 10;
        if (pct >= 1) out[name] = pct;
      });
    return out;
  }

  function readmeExcerpt(markdown, limit = 300) {
    let text = String(markdown || '').replace(/\r/g, '');
    text = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/^\s*#\s+.*$/m, ' ') // first H1 is the project title
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ') // linked badges
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
  }

  async function fetchRepoInfo(url) {
    const parsed = parseRepoUrl(url);
    if (!parsed) throw new Error('Not a GitHub repository URL. Example: https://github.com/owner/repo');
    const base = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

    const [langResponse, readmeText] = await Promise.all([
      ghFetch(`${base}/languages`, 'application/vnd.github+json').then((r) => r.json()),
      ghFetch(`${base}/readme`, 'application/vnd.github.raw+json')
        .then((r) => r.text())
        .catch((error) => {
          if (error.status === 404) return ''; // repo may simply have no README
          throw error;
        }),
    ]);

    return {
      ...parsed,
      github_url: `https://github.com/${parsed.owner}/${parsed.repo}`,
      languages: languagesToPercent(langResponse),
      readme_excerpt: readmeExcerpt(readmeText),
    };
  }

  /* ---------- State & persistence ---------- */

  let live = { projects: [], blog: [], skills: [] };
  let draft = { projects: [], blog: [], skills: [] };
  let liveText = { projects: '', blog: '', skills: '' };
  let exportedText = { projects: null, blog: null, skills: null };
  const KINDS = ['projects', 'blog', 'skills'];
  let route = { name: 'projects' };
  let formDirty = false;

  const view = document.getElementById('view');
  const statusBox = document.getElementById('status');
  const problemsBox = document.getElementById('problems');
  const indicator = document.getElementById('draft-indicator');

  function persistDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    } catch (error) {
      showStatus('Could not autosave the draft (localStorage unavailable). Export your work.', true);
    }
  }

  const draftText = (kind) => {
    if (kind === 'projects') return projectsJson(draft.projects);
    if (kind === 'blog') return blogJson(draft.blog);
    return skillsJson(draft.skills);
  };

  const differs = (kind) => draftText(kind) !== liveText[kind];

  const hasUnexported = (kind) => differs(kind) && draftText(kind) !== exportedText[kind];

  function updateIndicator() {
    const changed = KINDS.filter(differs).map((kind) => `${kind}.json`);
    indicator.classList.toggle('differs', changed.length > 0);
    indicator.textContent = changed.length
      ? `Draft differs from live: ${changed.join(', ')}`
      : 'Draft matches live data.';
  }

  function commit() {
    persistDraft();
    updateIndicator();
  }

  function showStatus(message, isError = false) {
    statusBox.replaceChildren(message ? el('p', { class: `msg${isError ? ' error' : ''}`, text: message }) : '');
  }

  function showProblems(list) {
    problemsBox.replaceChildren();
    if (!list || !list.length) {
      problemsBox.hidden = true;
      return;
    }
    problemsBox.append(
      el('strong', { text: `Fix ${list.length} problem${list.length === 1 ? '' : 's'}:` }),
      el('ul', {}, ...list.map((p) => el('li', { text: p })))
    );
    problemsBox.hidden = false;
  }

  window.addEventListener('beforeunload', (event) => {
    if (formDirty || KINDS.some(hasUnexported)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ---------- Rendering helpers ---------- */

  function field(label, control, hint, className = '') {
    return el('label', { class: `field ${className}`.trim() }, el('span', { text: label }), control, hint ? el('small', { text: hint }) : null);
  }

  const input = (props) => el('input', { type: 'text', autocomplete: 'off', ...props });

  function button(label, onClick, className = '', extra = {}) {
    const node = el('button', { type: 'button', class: className, ...extra, text: label });
    node.addEventListener('click', onClick);
    return node;
  }

  function emptyState(message) {
    return el('div', { class: 'state-box' }, el('p', { text: message }));
  }

  function heading(text) {
    return el('h2', { text });
  }

  function itemRow(main, actions) {
    return el('li', { class: 'item' }, el('div', { class: 'item-main' }, ...main), el('div', { class: 'item-actions' }, ...actions));
  }

  /* ---------- Navigation ---------- */

  function navigate(next, { force = false } = {}) {
    if (!force && formDirty && !window.confirm('You have unsaved changes in this form. Discard them?')) return;
    formDirty = false;
    route = next;
    showProblems([]);
    render();
  }

  function render() {
    const navName = { projects: 'projects', 'project-edit': 'projects', notes: 'projects', 'note-edit': 'projects', import: 'import', blog: 'blog', 'post-edit': 'blog', skills: 'skills' }[route.name];
    document.querySelectorAll('[data-nav]').forEach((b) => {
      if (b.dataset.nav === navName) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    view.setAttribute('aria-busy', 'false');
    const renderers = {
      projects: renderProjects,
      import: renderImport,
      'project-edit': renderProjectEditor,
      notes: renderNotes,
      'note-edit': renderNoteEditor,
      blog: renderBlog,
      'post-edit': renderPostEditor,
      skills: renderSkills,
    };
    view.replaceChildren(renderers[route.name]());
    updateIndicator();
  }

  view.addEventListener('input', (event) => {
    if (event.target.closest && event.target.closest('form[data-track]')) formDirty = true;
  });

  const findProject = (id) => draft.projects.find((p) => p.id === id);

  /* ---------- Projects list ---------- */

  function moveProject(id, delta) {
    const list = [...draft.projects].sort(byOrder);
    const index = list.findIndex((p) => p.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    list.forEach((p, i) => {
      p.order = i + 1;
    });
    commit();
    render();
  }

  function renderProjects() {
    const list = [...draft.projects].sort(byOrder);
    const wrap = el('div');
    wrap.append(
      heading('Projects'),
      el('div', { class: 'toolbar' },
        button('+ Import from GitHub', () => navigate({ name: 'import' }), 'primary'),
        button('+ New project (manual)', () => navigate({ name: 'project-edit', id: null, prefill: null }))
      )
    );
    if (!list.length) {
      wrap.append(emptyState('No projects yet. Import one from GitHub.'));
      return wrap;
    }

    const ul = el('ul', { class: 'item-list' });
    list.forEach((project, index) => {
      const title = el('div', { class: 'item-title' }, project.title || project.id);
      if (project.featured) title.append(el('span', { class: 'badge', text: 'Featured' }));
      ul.append(
        itemRow(
          [title, el('div', { class: 'item-meta', text: `${project.id} · ${project.notes.length} note${project.notes.length === 1 ? '' : 's'} · order ${project.order}` })],
          [
            button('↑', () => moveProject(project.id, -1), '', { 'aria-label': `Move ${project.title} up`, ...(index === 0 ? { disabled: '' } : {}) }),
            button('↓', () => moveProject(project.id, 1), '', { 'aria-label': `Move ${project.title} down`, ...(index === list.length - 1 ? { disabled: '' } : {}) }),
            button('Featured', () => {
              project.featured = !project.featured;
              commit();
              render();
            }, '', { 'aria-pressed': String(project.featured), 'aria-label': `Featured: ${project.title}` }),
            button('Edit', () => navigate({ name: 'project-edit', id: project.id }), '', { 'aria-label': `Edit ${project.title}` }),
            button('Notes ▸', () => navigate({ name: 'notes', projectId: project.id }), '', { 'aria-label': `Notes for ${project.title}` }),
            button('Delete', () => {
              const noteCount = project.notes.length;
              const extra = noteCount ? ` Its ${noteCount} note(s) will be deleted too.` : '';
              if (!window.confirm(`Delete project "${project.title}"?${extra}`)) return;
              draft.projects = draft.projects.filter((p) => p.id !== project.id);
              draft.projects.sort(byOrder).forEach((p, i) => {
                p.order = i + 1;
              });
              commit();
              showStatus(`Deleted "${project.title}".`);
              render();
            }, 'danger', { 'aria-label': `Delete ${project.title}` })
          ]
        )
      );
    });
    wrap.append(ul);
    return wrap;
  }

  /* ---------- GitHub import view ---------- */

  function tokenField() {
    const tokenInput = el('input', { type: 'password', autocomplete: 'off', value: sessionStorage.getItem(TOKEN_KEY) || '' });
    tokenInput.addEventListener('change', () => {
      const value = tokenInput.value.trim();
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    });
    return field('GitHub token (optional)', tokenInput, 'Raises the rate limit from 60 to 5,000 requests/hour. Kept in sessionStorage only; never exported.');
  }

  // Refreshes languages + readme_excerpt only; everything else is left untouched.
  function mergeReimport(project, info) {
    project.languages = info.languages;
    project.readme_excerpt = info.readme_excerpt;
    project.updated = today();
  }

  function renderImport() {
    const wrap = el('div');
    const urlInput = input({ type: 'url', placeholder: 'https://github.com/owner/repo', inputmode: 'url' });
    const submit = el('button', { type: 'submit', class: 'primary', text: 'Fetch' });
    const form = el('form', { novalidate: '' }, field('Repository URL', urlInput, 'Accepts .git, trailing slash, and /tree/branch URLs.'), tokenField(), submit);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showProblems([]);
      if (!parseRepoUrl(urlInput.value)) {
        showProblems(['Enter a GitHub repository URL like https://github.com/owner/repo.']);
        return;
      }
      submit.disabled = true;
      showStatus('Fetching from GitHub…');
      try {
        const info = await fetchRepoInfo(urlInput.value);
        const existing = draft.projects.find((p) => repoKey(p.github_url) === `${info.owner}/${info.repo}`.toLowerCase());
        if (existing) {
          mergeReimport(existing, info);
          commit();
          navigate({ name: 'projects' }, { force: true });
          showStatus(`Refreshed languages and README excerpt for "${existing.title}". Notes, highlights, order, summary and description were not touched.`);
        } else {
          navigate({ name: 'project-edit', id: null, prefill: info }, { force: true });
          showStatus('Imported. Fill in the summary and highlights, then save.');
        }
      } catch (error) {
        submit.disabled = false;
        showStatus('');
        showProblems([error.message]);
      }
    });

    wrap.append(heading('Import from GitHub'), form);
    return wrap;
  }

  /* ---------- Project editor ---------- */

  function renderProjectEditor() {
    const existing = route.id ? findProject(route.id) : null;
    if (route.id && !existing) return emptyState('Project not found.');
    const isNew = !existing;
    const info = route.prefill;

    const base = existing
      ? clone(existing)
      : normalizeProject({
          id: info ? slugify(info.repo) : '',
          title: info ? info.repo : '',
          github_url: info ? info.github_url : '',
          languages: info ? info.languages : {},
          readme_excerpt: info ? info.readme_excerpt : '',
          order: draft.projects.reduce((max, p) => Math.max(max, p.order), 0) + 1,
          updated: today(),
        });

    let meta = { languages: base.languages, readme_excerpt: base.readme_excerpt };

    const f = {
      id: input({ value: base.id, ...(isNew ? {} : { disabled: '' }), spellcheck: 'false' }),
      title: input({ value: base.title }),
      github: input({ type: 'url', value: base.github_url, placeholder: 'https://github.com/owner/repo' }),
      demo: input({ type: 'url', value: base.demo_url, placeholder: 'Leave empty to hide the link' }),
      summary: input({ value: base.summary }),
      description: el('textarea', { rows: '6', text: base.description }),
      highlights: el('textarea', { rows: '5', text: base.highlights.join('\n') }),
      tags: input({ value: base.tags.join(', ') }),
      order: input({ type: 'number', value: String(base.order), step: '1' }),
      featured: el('input', { type: 'checkbox', ...(base.featured ? { checked: '' } : {}) }),
      excerpt: el('textarea', { rows: '3', text: base.readme_excerpt }),
    };
    const languagesText = el('p', { class: 'hint' });
    const showLanguages = () => {
      const entries = Object.entries(meta.languages);
      languagesText.textContent = entries.length ? entries.map(([k, v]) => `${k} ${v}%`).join(' · ') : 'No language data yet.';
    };
    showLanguages();

    if (isNew) {
      let idTouched = !!base.id;
      f.id.addEventListener('input', () => {
        idTouched = true;
      });
      f.title.addEventListener('input', () => {
        if (!idTouched) f.id.value = slugify(f.title.value);
      });
    }

    const refresh = button('Refresh languages & excerpt from GitHub', async () => {
      showProblems([]);
      refresh.disabled = true;
      try {
        const fetched = await fetchRepoInfo(f.github.value);
        meta = { languages: fetched.languages, readme_excerpt: fetched.readme_excerpt };
        f.excerpt.value = fetched.readme_excerpt;
        showLanguages();
        formDirty = true;
        showStatus('Fetched. Click Save to keep the refreshed values.');
      } catch (error) {
        showProblems([error.message]);
      } finally {
        refresh.disabled = false;
      }
    });

    const form = el(
      'form',
      { 'data-track': '', novalidate: '' },
      el('div', { class: 'form-grid' },
        field('ID (slug)', f.id, isNew ? 'Lowercase letters, digits, hyphens. Permanent: it appears in URLs.' : 'IDs are permanent and cannot be changed.'),
        field('Title', f.title),
        field('GitHub URL', f.github),
        field('Demo URL', f.demo),
        field('Summary (one line, shown on the card)', f.summary, '', 'wide'),
        field('Description (full, markdown allowed)', f.description, '', 'wide'),
        field(`Highlights (one per line, max ${MAX_HIGHLIGHTS}; card shows the first 3)`, f.highlights, '', 'wide'),
        field('Tech stack tags (comma-separated)', f.tags, '', 'wide'),
        field('Display order', f.order),
        field('Featured', f.featured, '', 'inline'),
        field('README excerpt', f.excerpt, 'Refreshed from GitHub; editable.', 'wide')
      ),
      el('p', {}, el('strong', { text: 'Languages: ' }), languagesText),
      el('div', { class: 'toolbar' },
        el('button', { type: 'submit', class: 'primary', text: isNew ? 'Add project' : 'Save project' }),
        button('Cancel', () => navigate({ name: 'projects' })),
        refresh
      )
    );

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const order = Number(f.order.value);
      const project = {
        ...base,
        id: isNew ? f.id.value.trim() : base.id,
        title: f.title.value.trim(),
        github_url: f.github.value.trim(),
        demo_url: f.demo.value.trim(),
        summary: f.summary.value.trim(),
        description: f.description.value.trim(),
        highlights: splitLines(f.highlights.value),
        tags: splitTags(f.tags.value),
        languages: meta.languages,
        readme_excerpt: f.excerpt.value.trim(),
        featured: f.featured.checked,
        order: Number.isFinite(order) && f.order.value !== '' ? order : base.order,
        updated: today(),
      };

      const problems = validateProject(project);
      if (isNew && draft.projects.some((p) => p.id === project.id)) problems.push(`A project with id "${project.id}" already exists.`);
      if (problems.length) {
        showProblems(problems);
        return;
      }

      if (isNew) draft.projects.push(project);
      else draft.projects[draft.projects.findIndex((p) => p.id === base.id)] = project;
      commit();
      formDirty = false;
      navigate({ name: 'projects' }, { force: true });
      showStatus(`${isNew ? 'Added' : 'Saved'} "${project.title}". Draft autosaved.`);
    });

    return el('div', {}, heading(isNew ? 'New project' : `Edit: ${base.title}`), form);
  }

  /* ---------- Entry (note / post) lists & editor ---------- */

  function renderEntryList({ title, entries, newLabel, onNew, onEdit, onDelete, back }) {
    const wrap = el('div');
    wrap.append(heading(title));
    const toolbar = el('div', { class: 'toolbar' }, button(newLabel, onNew, 'primary'));
    if (back) toolbar.append(back);
    wrap.append(toolbar);

    const list = [...entries].sort(byDateDesc);
    if (!list.length) {
      wrap.append(emptyState('Nothing here yet.'));
      return wrap;
    }
    const ul = el('ul', { class: 'item-list' });
    list.forEach((entry) => {
      ul.append(
        itemRow(
          [el('div', { class: 'item-title', text: entry.title || entry.id }), el('div', { class: 'item-meta', text: `${entry.id} · ${entry.date}` })],
          [
            button('Edit', () => onEdit(entry), '', { 'aria-label': `Edit ${entry.title}` }),
            button('Delete', () => {
              if (window.confirm(`Delete "${entry.title}"?`)) onDelete(entry);
            }, 'danger', { 'aria-label': `Delete ${entry.title}` })
          ]
        )
      );
    });
    wrap.append(ul);
    return wrap;
  }

  // Split-pane editor shared by notes and blog posts.
  function renderEntryEditor({ heading: headingText, entry, siblings, onSave, onCancel }) {
    const isNew = !entry;
    const base = entry ? clone(entry) : normalizeEntry({ date: today() });

    const f = {
      title: input({ value: base.title }),
      id: input({ value: base.id, ...(isNew ? {} : { disabled: '' }), spellcheck: 'false' }),
      date: el('input', { type: 'date', value: base.date }),
      summary: input({ value: base.summary }),
      tags: input({ value: base.tags.join(', ') }),
      content: el('textarea', { class: 'mono', spellcheck: 'true', text: base.content }),
    };
    const preview = el('div', { class: 'preview', 'aria-label': 'Preview' });

    let frame = 0;
    const updatePreview = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderMarkdownInto(preview, f.content.value));
    };
    f.content.addEventListener('input', updatePreview);
    renderMarkdownInto(preview, f.content.value);

    if (isNew) {
      let idTouched = false;
      f.id.addEventListener('input', () => {
        idTouched = true;
      });
      f.title.addEventListener('input', () => {
        if (!idTouched) f.id.value = slugify(f.title.value);
      });
    }

    const form = el(
      'form',
      { 'data-track': '', novalidate: '' },
      el('div', { class: 'form-grid' },
        field('Title', f.title),
        field('ID (slug)', f.id, isNew ? 'Auto-generated from the title; permanent once saved.' : 'IDs are permanent and cannot be changed.'),
        field('Date', f.date),
        field('Tags (comma-separated)', f.tags),
        field('Summary (one line)', f.summary, '', 'wide')
      ),
      el('div', { class: 'split' },
        el('div', {}, el('label', { class: 'pane-label', text: 'Markdown' }, f.content)),
        el('div', {}, el('span', { class: 'pane-label', text: 'Preview (sanitized, same as the public site)' }), preview)
      ),
      el('div', { class: 'toolbar' },
        el('button', { type: 'submit', class: 'primary', text: isNew ? 'Add' : 'Save' }),
        button('Cancel', onCancel)
      )
    );

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = {
        ...base,
        id: isNew ? f.id.value.trim() : base.id,
        title: f.title.value.trim(),
        date: f.date.value,
        summary: f.summary.value.trim(),
        content: f.content.value,
        tags: splitTags(f.tags.value),
      };
      const problems = validateEntry(next, 'This entry');
      if (isNew && siblings.some((s) => s.id === next.id)) problems.push(`An entry with id "${next.id}" already exists here.`);
      if (problems.length) {
        showProblems(problems);
        return;
      }
      onSave(next, isNew);
    });

    return el('div', {}, heading(headingText), form);
  }

  /* ---------- Notes (per project) ---------- */

  function renderNotes() {
    const project = findProject(route.projectId);
    if (!project) return emptyState('Project not found.');
    return renderEntryList({
      title: `Notes: ${project.title}`,
      entries: project.notes,
      newLabel: '+ New note',
      onNew: () => navigate({ name: 'note-edit', projectId: project.id, id: null }),
      onEdit: (note) => navigate({ name: 'note-edit', projectId: project.id, id: note.id }),
      onDelete: (note) => {
        project.notes = project.notes.filter((n) => n.id !== note.id);
        commit();
        showStatus(`Deleted note "${note.title}".`);
        render();
      },
      back: button('← Projects', () => navigate({ name: 'projects' })),
    });
  }

  function renderNoteEditor() {
    const project = findProject(route.projectId);
    if (!project) return emptyState('Project not found.');
    const note = route.id ? project.notes.find((n) => n.id === route.id) : null;
    if (route.id && !note) return emptyState('Note not found.');
    return renderEntryEditor({
      heading: note ? `Edit note: ${note.title}` : `New note for ${project.title}`,
      entry: note,
      siblings: project.notes,
      onCancel: () => navigate({ name: 'notes', projectId: project.id }),
      onSave: (next, isNew) => {
        if (isNew) project.notes.push(next);
        else project.notes[project.notes.findIndex((n) => n.id === next.id)] = next;
        project.updated = today();
        commit();
        navigate({ name: 'notes', projectId: project.id }, { force: true });
        showStatus(`${isNew ? 'Added' : 'Saved'} note "${next.title}". Draft autosaved.`);
      },
    });
  }

  /* ---------- Blog ---------- */

  function renderBlog() {
    return renderEntryList({
      title: 'Blog posts',
      entries: draft.blog,
      newLabel: '+ New post',
      onNew: () => navigate({ name: 'post-edit', id: null }),
      onEdit: (post) => navigate({ name: 'post-edit', id: post.id }),
      onDelete: (post) => {
        draft.blog = draft.blog.filter((p) => p.id !== post.id);
        commit();
        showStatus(`Deleted post "${post.title}".`);
        render();
      },
    });
  }

  function renderPostEditor() {
    const post = route.id ? draft.blog.find((p) => p.id === route.id) : null;
    if (route.id && !post) return emptyState('Post not found.');
    return renderEntryEditor({
      heading: post ? `Edit post: ${post.title}` : 'New post',
      entry: post,
      siblings: draft.blog,
      onCancel: () => navigate({ name: 'blog' }),
      onSave: (next, isNew) => {
        if (isNew) draft.blog.push(next);
        else draft.blog[draft.blog.findIndex((p) => p.id === next.id)] = next;
        commit();
        navigate({ name: 'blog' }, { force: true });
        showStatus(`${isNew ? 'Added' : 'Saved'} post "${next.title}". Draft autosaved.`);
      },
    });
  }

  /* ---------- Skills ---------- */

  function renderSkills() {
    // Local working copy; synced from the DOM before any structural change.
    let groups = clone(draft.skills);
    const wrap = el('div');
    const rows = el('div');
    const form = el('form', { 'data-track': '', novalidate: '' });

    const sync = () => {
      rows.querySelectorAll('[data-skill-row]').forEach((row, i) => {
        groups[i] = {
          group: row.querySelector('[data-name]').value,
          items: splitTags(row.querySelector('[data-items]').value),
        };
      });
    };

    const change = (fn) => {
      sync();
      fn();
      formDirty = true;
      draw();
    };

    function draw() {
      rows.replaceChildren();
      if (!groups.length) rows.append(emptyState('No skill groups. The public page will show "Skills coming soon."'));
      groups.forEach((g, i) => {
        const name = input({ value: g.group, 'data-name': '' });
        const items = input({ value: g.items.join(', '), 'data-items': '' });
        const label = g.group || `group ${i + 1}`;
        rows.append(
          el('fieldset', { class: 'skill-group', 'data-skill-row': '' },
            el('legend', { text: `Group ${i + 1}` }),
            el('div', { class: 'form-grid' },
              field('Group name', name),
              field('Skills (comma-separated)', items)
            ),
            el('div', { class: 'item-actions' },
              button('↑', () => change(() => { [groups[i - 1], groups[i]] = [groups[i], groups[i - 1]]; }), '', { 'aria-label': `Move ${label} up`, ...(i === 0 ? { disabled: '' } : {}) }),
              button('↓', () => change(() => { [groups[i + 1], groups[i]] = [groups[i], groups[i + 1]]; }), '', { 'aria-label': `Move ${label} down`, ...(i === groups.length - 1 ? { disabled: '' } : {}) }),
              button('Delete group', () => {
                if (window.confirm(`Delete the "${label}" group?`)) change(() => groups.splice(i, 1));
              }, 'danger', { 'aria-label': `Delete group ${label}` })
            )
          )
        );
      });
    }

    form.append(
      rows,
      el('div', { class: 'toolbar' },
        button('+ Add group', () => change(() => groups.push({ group: '', items: [] }))),
        el('span', { class: 'spacer' }),
        el('button', { type: 'submit', class: 'primary', text: 'Save skills' })
      )
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      sync();
      const next = groups.map((g) => ({ group: g.group.trim(), items: g.items }));
      const problems = validateSkills(next);
      if (problems.length) {
        showProblems(problems);
        return;
      }
      showProblems([]);
      draft.skills = next;
      commit();
      formDirty = false;
      groups = clone(next);
      draw();
      updateIndicator();
      showStatus('Saved skills. Draft autosaved.');
    });

    draw();
    wrap.append(heading('Skills'), el('p', { class: 'hint', text: 'Groups and skills appear on the homepage in this order.' }), form);
    return wrap;
  }

  /* ---------- Export ---------- */

  function buildExport(kind) {
    const problems = {
      projects: () => validateProjects(draft.projects),
      blog: () => validateBlog(draft.blog),
      skills: () => validateSkills(draft.skills),
    }[kind]();
    if (problems.length) {
      showProblems([`Cannot export ${kind}.json until these are fixed:`, ...problems]);
      return null;
    }
    showProblems([]);
    return draftText(kind);
  }

  function download(kind) {
    const text = buildExport(kind);
    if (text === null) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = el('a', { href: url, download: `${kind}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportedText[kind] = text;
    showStatus(`Exported ${kind}.json. Replace public/data/${kind}.json, then commit and push.`);
  }

  async function writeToFolder() {
    const texts = {};
    for (const kind of KINDS) {
      texts[kind] = buildExport(kind);
      if (texts[kind] === null) return;
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const [name, text] of KINDS.map((kind) => [`${kind}.json`, texts[kind]])) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      }
      exportedText = { ...texts };
      live = clone(draft);
      liveText = { ...texts };
      updateIndicator();
      showStatus(`Wrote projects.json, blog.json and skills.json to "${dir.name}". Commit and push to publish.`);
    } catch (error) {
      if (error.name !== 'AbortError') showStatus(`Could not write files: ${error.message}`, true);
    }
  }

  function discardDraft() {
    if (!window.confirm('Discard all draft changes and reset to the live data?')) return;
    draft = clone(live);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    formDirty = false;
    navigate({ name: 'projects' }, { force: true });
    showStatus('Draft discarded. Showing live data.');
  }

  /* ---------- Boot ---------- */

  async function loadLive(kind) {
    const response = await fetch(LIVE_URLS[kind], { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${LIVE_URLS[kind]}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`${LIVE_URLS[kind]} must contain an array`);
    return data;
  }

  function loadStoredDraft() {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (stored && Array.isArray(stored.projects) && Array.isArray(stored.blog)) {
        return {
          projects: stored.projects.map(normalizeProject),
          blog: stored.blog.map(normalizeEntry),
          // Drafts saved before skills existed have no skills key: fall back to live.
          skills: Array.isArray(stored.skills) ? normalizeSkills(stored.skills) : clone(live.skills),
        };
      }
    } catch {
      /* corrupt draft: fall back to live */
    }
    return null;
  }

  async function boot() {
    document.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => navigate({ name: b.dataset.nav }))
    );
    document.getElementById('export-projects').addEventListener('click', () => download('projects'));
    document.getElementById('export-blog').addEventListener('click', () => download('blog'));
    document.getElementById('export-skills').addEventListener('click', () => download('skills'));
    document.getElementById('discard-draft').addEventListener('click', discardDraft);
    if (typeof window.showDirectoryPicker === 'function') {
      const writeButton = document.getElementById('write-folder');
      writeButton.hidden = false;
      writeButton.addEventListener('click', writeToFolder);
    }

    try {
      const [projects, blog, skills] = await Promise.all([loadLive('projects'), loadLive('blog'), loadLive('skills')]);
      live = { projects: projects.map(normalizeProject), blog: blog.map(normalizeEntry), skills: normalizeSkills(skills) };
    } catch (error) {
      view.setAttribute('aria-busy', 'false');
      view.replaceChildren(
        el('div', { class: 'state-box' },
          el('p', { text: `Could not load the live data: ${error.message}` }),
          el('p', { class: 'hint', text: 'Serve the repo root over HTTP (npx serve . -l 5500) and open /admin/index.html. file:// will not work. Exporting is disabled so live data cannot be overwritten with an empty draft.' })
        )
      );
      document.querySelectorAll('.sidebar button').forEach((b) => {
        b.disabled = true;
      });
      return;
    }

    liveText = { projects: projectsJson(live.projects), blog: blogJson(live.blog), skills: skillsJson(live.skills) };
    const stored = loadStoredDraft();
    draft = stored || clone(live);
    if (stored && KINDS.some(differs)) {
      showStatus('Restored your autosaved draft from this browser.');
    }
    render();
  }

  boot();
})();
