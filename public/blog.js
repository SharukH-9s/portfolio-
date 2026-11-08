(() => {
  'use strict';

  const { el, getPosts, renderPostCard, setMessage, setLoading } = window.Content;
  const container = document.getElementById('blog-content');

  async function load() {
    setLoading(container, 'Loading posts…');
    try {
      const posts = await getPosts();
      if (!posts.length) {
        setMessage(container, 'No posts yet. Check back soon.');
        return;
      }
      const list = el('div', { class: 'post-list' });
      posts.forEach((post) => {
        const href = `post.html?source=blog&id=${encodeURIComponent(post.id)}`;
        list.append(renderPostCard(post, href));
      });
      container.replaceChildren(list);
      container.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('Failed to load posts:', error);
      const retry = el('button', { class: 'btn', type: 'button', text: 'Try again' });
      retry.addEventListener('click', load);
      setMessage(container, 'Sorry, the posts could not be loaded.', retry);
    }
  }

  load();
})();
