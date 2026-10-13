// Explicit article return links restore the archive entry that opened this post.
(() => {
  'use strict';
  let entry;
  try { entry = JSON.parse(sessionStorage.getItem('tg-return:' + location.pathname)); } catch (_) { return; }
  if (!entry || !entry.token) return;
  let archive;
  try { archive = new URL(entry.archive); } catch (_) { return; }
  if (archive.origin !== location.origin) return;
  archive.searchParams.set('return', entry.token);
  document.querySelectorAll('.transmission-post__back').forEach(link => {
    link.href = archive.href;
  });
})();
