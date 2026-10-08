(function () {
  "use strict";
  var nav = document.querySelector(".site-frame > .nav");
  var archive = document.querySelector(".broadcasts");
  if (!nav || !archive) return;

  var header = archive.querySelector(".broadcasts__sticky");

  function updateNavHeight() {
    archive.style.setProperty("--archive-nav-height", nav.getBoundingClientRect().height + "px");
    archive.style.setProperty("--archive-header-height", (header ? header.getBoundingClientRect().height : 0) + "px");
  }

  updateNavHeight();
  if (typeof ResizeObserver !== "undefined") {
    var observer = new ResizeObserver(updateNavHeight);
    observer.observe(nav);
    if (header) observer.observe(header);
  }
  window.addEventListener("resize", updateNavHeight);
  window.addEventListener("load", updateNavHeight);
})();
