(() => {
  'use strict';

  const { el, safeUrl, externalLink, renderLanguages, getProjects, getSkills } = window.Content;

  /* ---------- Project card ---------- */

  function renderProjectCard(project) {
    const card = el('article', { class: project.featured === true ? 'card card--featured' : 'card' });

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

  function updateProjectCount(count) {
    const chip = document.getElementById('stat-projects');
    if (!chip) return;
    chip.textContent = `${count} ${count === 1 ? 'Project' : 'Projects'}`;
    chip.hidden = false;
  }

  async function loadProjects() {
    showLoading();
    try {
      const projects = await getProjects();
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

  /* ---------- Skills ---------- */

  const skillsContent = document.getElementById('skills-content');

  function renderSkills(groups) {
    const list = el('dl', { class: 'skills' });
    groups.forEach(({ group, items }) => {
      const pills = el('ul', { class: 'pills' });
      items.forEach((item) => pills.append(el('li', { class: 'pill', text: item })));
      list.append(el('div', { class: 'skill-row' }, el('dt', { text: group }), el('dd', {}, pills)));
    });
    return list;
  }

  async function loadSkills() {
    skillsContent.setAttribute('aria-busy', 'true');
    skillsContent.replaceChildren(
      el('div', { class: 'skeleton skeleton-short', 'aria-hidden': 'true' }),
      el('p', { class: 'visually-hidden', text: 'Loading skills…' })
    );
    try {
      const groups = await getSkills();
      if (!groups.length) {
        skillsContent.replaceChildren(
          el('div', { class: 'state-box' }, el('p', { text: 'Skills coming soon.' }))
        );
      } else {
        skillsContent.replaceChildren(renderSkills(groups));
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
      const retry = el('button', { class: 'btn', type: 'button', text: 'Try again' });
      retry.addEventListener('click', loadSkills);
      skillsContent.replaceChildren(
        el(
          'div',
          { class: 'state-box', role: 'alert' },
          el('p', { text: 'Sorry, the skills could not be loaded.' }),
          retry
        )
      );
    } finally {
      skillsContent.setAttribute('aria-busy', 'false');
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

  /* ---------- Copy email ---------- */

  function initCopyEmail() {
    const button = document.getElementById('copy-email');
    const status = document.getElementById('copy-status');
    if (!button) return;
    const label = button.textContent;
    let timer;

    function report(message) {
      button.textContent = message;
      if (status) status.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = label;
        if (status) status.textContent = '';
      }, 2000);
    }

    function legacyCopy(text) {
      const area = el('textarea', { readonly: '', 'aria-hidden': 'true' });
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    }

    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      let ok = false;
      try {
        await navigator.clipboard.writeText(email);
        ok = true;
      } catch {
        ok = legacyCopy(email);
      }
      report(ok ? 'Copied!' : 'Copy failed');
    });
  }

  initReveal();
  initCopyEmail();
  loadProjects();
  loadSkills();
})();
