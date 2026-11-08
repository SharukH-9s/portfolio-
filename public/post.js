(() => {
  'use strict';

  const {
    el,
    formatDate,
    renderMarkdownInto,
    setMessage,
    setLoading,
    setPageMeta,
    getPost,
    getProject,
    getNote,
  } = window.Content;

  const root = document.getElementById('post-root');
  const backSlot = document.getElementById('post-back');

  function setBack(href, label) {
    backSlot.replaceChildren(el('a', { class: 'back-link', href, text: label }));
  }

  function showNotFound() {
    setPageMeta('Post not found');
    setBack('blog.html', '← Back to blog');
    setMessage(
      root,
      'Sorry, that post does not exist.',
      el('a', { class: 'btn btn-primary', href: 'blog.html', text: 'Browse the blog' }),
      el('a', { class: 'btn', href: 'index.html', text: 'Go home' })
    );
  }

  function showError() {
    const retry = el('button', { class: 'btn', type: 'button', text: 'Try again' });
    retry.addEventListener('click', load);
    setMessage(root, 'Sorry, this post could not be loaded.', retry);
  }

  function render(post, project) {
    setPageMeta(post.title, post.summary);

    const meta = el('p', { class: 'meta' });
    if (post.date) meta.append(el('time', { datetime: post.date, text: formatDate(post.date) }));
    if (project) {
      if (meta.childNodes.length) meta.append(' · ');
      meta.append(
        el('a', {
          href: `project.html?id=${encodeURIComponent(project.id)}#notes`,
          text: project.title,
        })
      );
    }

    const header = el('header', { class: 'page-header' }, el('h1', { text: post.title }), meta);

    const tags = Array.isArray(post.tags) ? post.tags : [];
    if (tags.length) {
      const list = el('ul', { class: 'pills', 'aria-label': 'Tags' });
      tags.forEach((tag) => list.append(el('li', { class: 'pill', text: String(tag) })));
      header.append(list);
    }

    const body = el('article', { class: 'prose' });
    renderMarkdownInto(body, post.content || '');

    root.replaceChildren(header, body);
    root.setAttribute('aria-busy', 'false');
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const id = params.get('id');
    const projectId = params.get('project');

    if (!id || (source !== 'blog' && source !== 'project') || (source === 'project' && !projectId)) {
      showNotFound();
      return;
    }

    setLoading(root, 'Loading post…');
    try {
      if (source === 'blog') {
        const post = await getPost(id);
        if (!post) {
          showNotFound();
          return;
        }
        setBack('blog.html', '← Back to blog');
        render(post, null);
      } else {
        const [project, note] = await Promise.all([getProject(projectId), getNote(projectId, id)]);
        if (!project || !note) {
          showNotFound();
          return;
        }
        setBack(`project.html?id=${encodeURIComponent(project.id)}#notes`, `← Back to ${project.title}`);
        render(note, project);
      }
    } catch (error) {
      console.error('Failed to load post:', error);
      showError();
    }
  }

  load();
})();
