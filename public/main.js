(() => {
  'use strict';

  const PROJECTS_URL = 'data/projects.json';

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

  /* ---------- Helpers ---------- */

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

  /* ---------- Project card ---------- */

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

  function renderProjectCard(project) {
    const card = el('article', { class: 'card' });

    if (project.featured === true) {
      card.append(el('span', { class: 'badge', text: 'Featured' }));
    }

    const title = el('h3', { class: 'card-title' });
    title.append(
      el('a', { href: `project.html?id=${encodeURIComponent(project.id)}`, text: project.title })
    );
    card.append(title);

    if (project.summary) {
      card.append(el('p', { class: 'card-summary', text: project.summary }));
    }

    const languages = renderLanguages(project.languages);
    if (languages) card.append(languages);

    const tags = Array.isArray(project.tags) ? project.tags : [];
    if (tags.length) {
      const list = el('ul', { class: 'pills', 'aria-label': 'Tech stack' });
      tags.forEach((tag) => list.append(el('li', { class: 'pill', text: String(tag) })));
      card.append(list);
    }

    const highlights = Array.isArray(project.highlights) ? project.highlights.slice(0, 3) : [];
    if (highlights.length) {
      const list = el('ul', { class: 'card-highlights' });
      highlights.forEach((text) => list.append(el('li', { text: String(text) })));
      card.append(list);
    }

    const github = safeUrl(project.github_url);
    const demo = safeUrl(project.demo_url);
    if (github || demo) {
      const links = el('div', { class: 'card-links' });
      if (github) links.append(externalLink(github, 'GitHub'));
      if (demo) links.append(externalLink(demo, 'Live Demo'));
      card.append(links);
    }

    return card;
  }

  /* ---------- Projects section states ---------- */

  const content = document.getElementById('projects-content');

  function setContent(...nodes) {
    content.replaceChildren(...nodes);
  }

  function showLoading() {
    content.setAttribute('aria-busy', 'true');
    const grid = el('div', { class: 'project-grid', 'aria-hidden': 'true' });
    for (let i = 0; i < 3; i += 1) grid.append(el('div', { class: 'skeleton' }));
    setContent(grid, el('p', { class: 'visually-hidden', text: 'Loading projects…' }));
  }

  function showEmpty() {
    setContent(el('div', { class: 'state-box' }, el('p', { text: 'Projects coming soon.' })));
  }

  function showError() {
    const retry = el('button', { class: 'btn', type: 'button', text: 'Try again' });
    retry.addEventListener('click', loadProjects);
    setContent(
      el(
        'div',
        { class: 'state-box', role: 'alert' },
        el('p', { text: 'Sorry, the projects could not be loaded.' }),
        retry
      )
    );
  }

  function isValidProject(project) {
    return (
      project &&
      typeof project === 'object' &&
      typeof project.id === 'string' &&
      project.id &&
      typeof project.title === 'string' &&
      project.title
    );
  }

  function sortProjects(projects) {
    const orderOf = (p) => (Number.isFinite(p.order) ? p.order : Number.POSITIVE_INFINITY);
    return [...projects].sort((a, b) => orderOf(a) - orderOf(b) || a.title.localeCompare(b.title));
  }

  function updateProjectCount(count) {
    const chip = document.getElementById('stat-projects');
    if (!chip) return;
    chip.textContent = `${count} ${count === 1 ? 'Project' : 'Projects'}`;
    chip.hidden = false;
  }

  async function loadProjects() {
    showLoading();
    try {
      const response = await fetch(PROJECTS_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('projects.json must be an array');

      const projects = sortProjects(
        data.filter((project) => {
          if (isValidProject(project)) return true;
          console.warn('Skipping invalid project entry:', project);
          return false;
        })
      );

      updateProjectCount(projects.length);

      if (!projects.length) {
        showEmpty();
      } else {
        const grid = el('div', { class: 'project-grid' });
        projects.forEach((project) => grid.append(renderProjectCard(project)));
        setContent(grid);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      showError();
    } finally {
      content.setAttribute('aria-busy', 'false');
    }
  }

  /* ---------- Scroll fade-in ---------- */

  function initReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((node) => node.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.05 }
    );
    targets.forEach((node) => observer.observe(node));
  }

  initReveal();
  loadProjects();
})();
