(function () {
  "use strict";
  var nav = document.querySelector(".site-frame > .nav");
  var archive = document.querySelector(".broadcasts");
  if (!nav || !archive) return;

  function updateNavHeight() {
    archive.style.setProperty("--archive-nav-height", nav.getBoundingClientRect().height + "px");
  }

  updateNavHeight();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(updateNavHeight).observe(nav);
  }
  window.addEventListener("resize", updateNavHeight);
  window.addEventListener("load", updateNavHeight);
})();
