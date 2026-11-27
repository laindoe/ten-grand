// Subtle animated glints over the Voices Heard logos.
//
// Any element marked data-sparkles="round" | "horizontal" gets an overlay of small
// four-point stars placed on the logo's brightest highlights (positions are a % of
// the logo image, so they stay on the same letters at every size). The overlay is
// measured against the element, so it follows it through the page's layout changes.
// Elements that draw the logo as a background image (not an <img>) can add
// data-sparkles-aspect="<width/height of the image>" so the overlay matches the
// letterboxed picture.
(function () {
  "use strict";

  // [x %, y %, size (% of logo width), delay s, duration s]
  var SPOTS = {
    round: [
      [58.7, 33.2, 4.4, 0.4, 7.2],
      [71.6, 36.3, 3.6, 2.9, 8.4],
      [35.0, 39.6, 3.8, 5.1, 7.8],
      [63.6, 54.8, 4.0, 1.7, 9.0],
      [78.6, 57.8, 3.4, 4.2, 8.0],
      [26.9, 56.3, 3.6, 6.3, 8.6]
    ],
    horizontal: [
      [6.9, 35.8, 2.8, 0.6, 7.6],
      [21.9, 44.5, 2.6, 3.3, 8.4],
      [48.4, 48.2, 2.8, 5.2, 7.2],
      [59.7, 40.5, 2.6, 1.8, 8.8],
      [73.3, 57.6, 2.8, 4.4, 8.0],
      [88.4, 43.0, 2.6, 6.6, 9.2]
    ]
  };

  // Compass-style four-point star: thin arms pointing up, down, left and right.
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C12.22 9.2 14.8 11.78 24 12 14.8 12.22 12.22 14.8 12 24 11.78 14.8 9.2 12.22 0 12 9.2 11.78 11.78 9.2 12 0Z"/></svg>';

  function build(kind) {
    var layer = document.createElement("span");
    layer.className = "vh-sparkles";
    layer.setAttribute("aria-hidden", "true");
    (SPOTS[kind] || []).forEach(function (s) {
      var star = document.createElement("span");
      star.className = "vh-sparkle";
      star.style.left = s[0] + "%";
      star.style.top = s[1] + "%";
      star.style.width = s[2] + "%";
      star.style.animationDelay = s[3] + "s";
      star.style.animationDuration = s[4] + "s";
      star.innerHTML = STAR;
      layer.appendChild(star);
    });
    return layer;
  }

  // The area the logo image actually covers inside its element.
  function imageBox(target) {
    var r = target.getBoundingClientRect();
    var aspect = parseFloat(target.getAttribute("data-sparkles-aspect"));
    if (!aspect || !r.width || !r.height) return r;
    var boxAspect = r.width / r.height, w = r.width, h = r.height;
    if (aspect > boxAspect) h = r.width / aspect; else w = r.height * aspect;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  function attach(target) {
    if (target.__vhSparkles) return;
    var parent = target.parentElement;
    if (!parent) return;
    target.__vhSparkles = true;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    var layer = build(target.getAttribute("data-sparkles"));
    target.insertAdjacentElement("afterend", layer);

    function place() {
      var box = imageBox(target);
      if (!box.width || !box.height) { layer.style.display = "none"; return; }
      var pr = parent.getBoundingClientRect();
      layer.style.display = "block";
      layer.style.left = box.left - pr.left - parent.clientLeft + parent.scrollLeft + "px";
      layer.style.top = box.top - pr.top - parent.clientTop + parent.scrollTop + "px";
      layer.style.width = box.width + "px";
      layer.style.height = box.height + "px";
    }
    place();
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(place);
      ro.observe(target); ro.observe(parent);
    }
    window.addEventListener("resize", place);
    // Pages that animate or reflow around the logo: re-measure shortly after changes.
    var pending = 0;
    new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () { pending = 0; place(); });
    }).observe(parent, { attributes: true, subtree: true, attributeFilter: ["hidden", "class", "style"] });
  }

  function init() {
    document.querySelectorAll("[data-sparkles]").forEach(attach);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
