(() => {
  'use strict';

  const {
    el,
    safeUrl,
    externalLink,
    renderLanguages,
    renderPostCard,
    renderMarkdownInto,
    setMessage,
    setLoading,
    setPageMeta,
    getProject,
    getNotes,
  } = window.Content;

  const root = document.getElementById('project-root');
  const TABS = ['overview', 'notes'];

  function showNotFound() {
    setPageMeta('Project not found');
    setMessage(
      root,
      'Sorry, that project does not exist.',
      el('a', { class: 'btn btn-primary', href: 'index.html#projects', text: 'See all projects' })
    );
  }

  function showError() {
    const retry = el('button', { class: 'btn', type: 'button', text: 'Try again' });
    retry.addEventListener('click', load);
    setMessage(root, 'Sorry, this project could not be loaded.', retry);
  }

  function section(title, ...nodes) {
    return el('section', { class: 'detail-section' }, el('h2', { text: title }), ...nodes);
  }

  function buildOverview(project) {
    const panel = el('div', { id: 'panel-overview', class: 'panel' });

    const prose = el('div', { class: 'prose' });
    renderMarkdownInto(prose, project.description || project.summary || '');
    panel.append(prose);

    const highlights = Array.isArray(project.highlights) ? project.highlights : [];
    if (highlights.length) {
      const list = el('ul', { class: 'card-highlights' });
      highlights.forEach((text) => list.append(el('li', { text: String(text) })));
      panel.append(section('Highlights', list));
    }

    const languages = renderLanguages(project.languages);
    if (languages) panel.append(section('Languages', languages));

    const tags = Array.isArray(project.tags) ? project.tags : [];
    if (tags.length) {
      const list = el('ul', { class: 'pills', 'aria-label': 'Tech stack' });
      tags.forEach((tag) => list.append(el('li', { class: 'pill', text: String(tag) })));
      panel.append(section('Tech stack', list));
    }
    return panel;
  }

  function buildNotes(project, notes) {
    const panel = el('div', { id: 'panel-notes', class: 'panel' });
    if (!notes.length) {
      panel.append(el('div', { class: 'state-box' }, el('p', { text: 'No notes for this project yet.' })));
      return panel;
    }
    const list = el('div', { class: 'post-list' });
    notes.forEach((note) => {
      const href =
        `post.html?source=project&project=${encodeURIComponent(project.id)}` +
        `&id=${encodeURIComponent(note.id)}`;
      list.append(renderPostCard(note, href));
    });
    panel.append(list);
    return panel;
  }

  function render(project, notes) {
    setPageMeta(project.title, project.summary);

    const header = el('header', { class: 'page-header' }, el('h1', { text: project.title }));
    if (project.summary) header.append(el('p', { class: 'lead', text: project.summary }));

    const github = safeUrl(project.github_url);
    const demo = safeUrl(project.demo_url);
    if (github || demo) {
      const links = el('div', { class: 'detail-links' });
      if (github) links.append(externalLink(github, 'GitHub'));
      if (demo) links.append(externalLink(demo, 'Live Demo'));
      header.append(links);
    }

    const tabs = el('nav', { class: 'tabs', 'aria-label': 'Project sections' });
    const overviewTab = el('a', { class: 'tab', href: '#overview', 'data-tab': 'overview', text: 'Overview' });
    const notesTab = el(
      'a',
      { class: 'tab', href: '#notes', 'data-tab': 'notes' },
      `Notes (${notes.length})`
    );
    tabs.append(overviewTab, notesTab);

    const panels = {
      overview: buildOverview(project),
      notes: buildNotes(project, notes),
    };

    root.replaceChildren(header, tabs, panels.overview, panels.notes);
    root.setAttribute('aria-busy', 'false');

    // Hash-driven tabs: linkable and back-button friendly. Panel ids differ from
    // the hash values, so the browser doesn't jump-scroll when the hash changes.
    function showTab() {
      const requested = window.location.hash.replace('#', '');
      const active = TABS.includes(requested) ? requested : 'overview';
      TABS.forEach((name) => {
        panels[name].hidden = name !== active;
      });
      [overviewTab, notesTab].forEach((tab) => {
        if (tab.dataset.tab === active) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      });
    }

    window.addEventListener('hashchange', showTab);
    showTab();
  }

  async function load() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      showNotFound();
      return;
    }

    setLoading(root, 'Loading project…');
    try {
      const project = await getProject(id);
      if (!project) {
        showNotFound();
        return;
      }
      const notes = await getNotes(project.id);
      render(project, notes);
    } catch (error) {
      console.error('Failed to load project:', error);
      showError();
    }
  }

  load();
})();
