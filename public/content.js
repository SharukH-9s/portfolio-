/* Shared content layer for all public pages.
 *
 * Exposes `window.Content`:
 *   data:      getProjects, getProject, getNotes, getNote, getPosts, getPost, getSkills
 *   markdown:  renderMarkdown (sanitized HTML string), renderMarkdownInto
 *   DOM:       el, safeUrl, externalLink, renderLanguages, renderPostCard,
 *              setMessage, setLoading, formatDate, setPageMeta
 *
 * All access to notes goes through getNotes()/getNote(), so notes can later move
 * to data/notes/{projectId}.json without touching the pages.
 */
(() => {
  'use strict';

  const PROJECTS_URL = 'data/projects.json';
  const BLOG_URL = 'data/blog.json';
  const SKILLS_URL = 'data/skills.json';
  const SITE_NAME = 'Mohaiminul Hassan Sharukh';

  const LANGUAGE_COLORS = {
    Rust: '#b7410e',
    TypeScript: '#3178c6',
    JavaScript: '#c9a400',
    Python: '#3572a5',
    'C#': '#178600',
    Shell: '#4eaa25',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Go: '#00add8',
    Dockerfile: '#384d54',
  };
  const FALLBACK_COLORS = ['#6b7280', '#0d9488', '#9333ea', '#db2777', '#ea580c'];

  /* ---------- DOM helpers ---------- */

  // Build DOM safely: all JSON-derived strings go through textContent / setAttribute.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) {
      if (child) node.append(child);
    }
    return node;
  }

  // Only allow http(s) links from data files; anything else is treated as empty.
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function externalLink(href, label) {
    return el(
      'a',
      { href, target: '_blank', rel: 'noopener noreferrer' },
      `${label} ↗`,
      el('span', { class: 'visually-hidden', text: ' (opens in a new tab)' })
    );
  }

  function formatPercent(value) {
    return String(Math.round(value * 10) / 10);
  }

  // ISO YYYY-MM-DD -> "Nov 1, 2026" (parsed as UTC so the day never shifts).
  function formatDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  function renderLanguages(languages) {
    const entries = Object.entries(languages && typeof languages === 'object' ? languages : {})
      .filter(([, pct]) => Number.isFinite(pct) && pct > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;

    const bar = el('div', { class: 'lang-bar', 'aria-hidden': 'true' });
    const legend = el('ul', { class: 'lang-legend', 'aria-label': 'Languages used' });

    entries.forEach(([name, pct], index) => {
      const color = LANGUAGE_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

      const segment = el('span', { class: 'lang-seg' });
      segment.style.width = `${pct}%`;
      segment.style.backgroundColor = color;
      bar.append(segment);

      const dot = el('span', { class: 'lang-dot', 'aria-hidden': 'true' });
      dot.style.backgroundColor = color;
      legend.append(el('li', {}, dot, `${name} ${formatPercent(pct)}%`));
    });

    const wrapper = el('div', { class: 'lang' });
    wrapper.append(bar, legend);
    return wrapper;
  }

  // Card for a blog post or project note. `item` has title/date/summary/tags.
  function renderPostCard(item, href, headingLevel = 2) {
    const card = el('article', { class: 'card post-card' });

    const title = el('h' + headingLevel, { class: 'card-title' });
    title.append(el('a', { href, text: item.title }));
    card.append(title);

    if (item.date) {
      card.append(
        el('p', { class: 'meta' }, el('time', { datetime: item.date, text: formatDate(item.date) }))
      );
    }
    if (item.summary) {
      card.append(el('p', { class: 'card-summary', text: item.summary }));
    }

    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.length) {
      const list = el('ul', { class: 'pills', 'aria-label': 'Tags' });
      tags.forEach((tag) => list.append(el('li', { class: 'pill', text: String(tag) })));
      card.append(list);
    }
    return card;
  }

  /* ---------- Page states ---------- */

  // actions: nodes (usually links/buttons) shown under the message.
  function setMessage(container, message, ...actions) {
    container.setAttribute('aria-busy', 'false');
    container.replaceChildren(
      el('div', { class: 'state-box' }, el('p', { text: message }), ...actions)
    );
  }

  function setLoading(container, label = 'Loading…') {
    container.setAttribute('aria-busy', 'true');
    const grid = el('div', { class: 'post-list', 'aria-hidden': 'true' });
    for (let i = 0; i < 2; i += 1) grid.append(el('div', { class: 'skeleton skeleton-short' }));
    container.replaceChildren(grid, el('p', { class: 'visually-hidden', text: label }));
  }

  function setPageMeta(title, description) {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;

    const setMeta = (selector, create, value) => {
      let node = document.head.querySelector(selector);
      if (!node && create) {
        node = create();
        document.head.append(node);
      }
      if (node) node.setAttribute('content', value);
    };

    if (description) {
      setMeta('meta[name="description"]', () => el('meta', { name: 'description' }), description);
      setMeta('meta[property="og:description"]', null, description);
    }
    setMeta('meta[property="og:title"]', null, fullTitle);
  }

  /* ---------- Data access ---------- */

  const cache = new Map();

  function loadJson(url) {
    if (!cache.has(url)) {
      const promise = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
          return response.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error(`${url} must contain an array`);
          return data;
        });
      // A failed load must not be cached, so "Try again" can actually retry.
      promise.catch(() => cache.delete(url));
      cache.set(url, promise);
    }
    return cache.get(url);
  }

  const isValidEntry = (item) =>
    item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    item.id &&
    typeof item.title === 'string' &&
    item.title;

  function validEntries(list, kind) {
    return list.filter((item) => {
      if (isValidEntry(item)) return true;
      console.warn(`Skipping invalid ${kind} entry:`, item);
      return false;
    });
  }

  // Newest first; ISO dates sort correctly as strings.
  const byDateDesc = (a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) || a.title.localeCompare(b.title);

  async function getProjects() {
    const orderOf = (p) => (Number.isFinite(p.order) ? p.order : Number.POSITIVE_INFINITY);
    const projects = validEntries(await loadJson(PROJECTS_URL), 'project');
    return [...projects].sort((a, b) => orderOf(a) - orderOf(b) || a.title.localeCompare(b.title));
  }

  async function getProject(id) {
    const projects = await getProjects();
    return projects.find((project) => project.id === id) || null;
  }

  async function getNotes(projectId) {
    const project = await getProject(projectId);
    if (!project || !Array.isArray(project.notes)) return [];
    return [...validEntries(project.notes, 'note')].sort(byDateDesc);
  }

  async function getNote(projectId, noteId) {
    const notes = await getNotes(projectId);
    return notes.find((note) => note.id === noteId) || null;
  }

  async function getPosts() {
    const posts = validEntries(await loadJson(BLOG_URL), 'post');
    return [...posts].sort(byDateDesc);
  }

  async function getPost(id) {
    const posts = await getPosts();
    return posts.find((post) => post.id === id) || null;
  }

  // Skill groups in file order: [{ group: 'Languages', items: ['Rust', ...] }]
  async function getSkills() {
    const groups = await loadJson(SKILLS_URL);
    return groups
      .filter((entry) => {
        const ok = entry && typeof entry.group === 'string' && entry.group && Array.isArray(entry.items);
        if (!ok) console.warn('Skipping invalid skills entry:', entry);
        return ok;
      })
      .map((entry) => ({
        group: entry.group,
        items: entry.items.filter((item) => typeof item === 'string' && item),
      }))
      .filter((entry) => entry.items.length);
  }

  /* ---------- Markdown ---------- */

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let hookInstalled = false;

  // Always: DOMPurify.sanitize(marked.parse(md)). Never insert marked output directly.
  function renderMarkdown(md) {
    const text = typeof md === 'string' ? md : '';
    if (!window.marked || !window.DOMPurify) {
      console.error('Markdown libraries (marked, DOMPurify) are not loaded.');
      return `<p>${escapeHtml(text)}</p>`;
    }

    if (!hookInstalled) {
      window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      hookInstalled = true;
    }

    const html = window.marked.parse(text, { gfm: true, async: false });
    return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
  }

  function renderMarkdownInto(container, md) {
    container.innerHTML = renderMarkdown(md);
    // Scrollable code blocks must be reachable by keyboard.
    container.querySelectorAll('pre').forEach((pre) => pre.setAttribute('tabindex', '0'));
  }

  window.Content = {
    el,
    safeUrl,
    externalLink,
    formatDate,
    renderLanguages,
    renderPostCard,
    setMessage,
    setLoading,
    setPageMeta,
    getProjects,
    getProject,
    getNotes,
    getNote,
    getPosts,
    getPost,
    getSkills,
    renderMarkdown,
    renderMarkdownInto,
  };
})();
