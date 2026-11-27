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

  // [x %, y %, size (% of logo width), delay s, duration s, colour]
  var SPOTS = {
    round: [
      [58.7, 33.2, 5.2, 0.4, 7.2, 0],
      [71.6, 36.3, 4.4, 2.9, 8.4, 0],
      [35.0, 39.6, 4.6, 5.1, 7.8, 0],
      [63.6, 54.8, 4.8, 1.7, 9.0, 0],
      [78.6, 57.8, 4.2, 4.2, 8.0, 0],
      [26.9, 56.3, 4.4, 6.3, 8.6, 0]
    ],
    horizontal: [
      [6.9, 35.8, 3.4, 0.6, 7.6, 0],
      [21.9, 44.5, 3.2, 3.3, 8.4, 0],
      [48.4, 48.2, 3.4, 5.2, 7.2, 0],
      [59.7, 40.5, 3.2, 1.8, 8.8, 0],
      [73.3, 57.6, 3.4, 4.4, 8.0, 0],
      [88.4, 43.0, 3.2, 6.6, 9.2, 0]
    ]
  };
  // Glint colours (taken from the reference stars). Every glint currently uses the blue (index 0);
  // set the last number of a spot to 1 (pink) or 2 (pale lime) to change an individual one.
  var COLORS = ["#1fb8ff", "#ff3ec0", "#d4ee3c"];

  // Compass-style four-point star with needle-thin arms (north-south arm a little
  // longer), drawn in three layers: soft coloured glow, colour, white-hot core.
  // Defined once as an SVG <symbol> and reused by every glint.
  var SYMBOL =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="vh-glint-core"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<symbol id="vh-glint-star" viewBox="0 0 24 26.9">' +
    '<path d="M12.00 0.01L12.57 2.56L12.95 4.45L13.20 5.85L13.40 6.88L13.55 7.67L13.68 8.29L13.79 8.79L13.90 9.19L14.00 9.52L14.10 9.82L14.18 10.09L14.26 10.34L14.34 10.56L14.41 10.77L14.50 10.95L14.60 11.11L14.73 11.24L14.91 11.33L15.13 11.42L15.37 11.50L15.64 11.60L15.94 11.69L16.31 11.79L16.77 11.90L17.34 12.02L18.04 12.17L18.96 12.35L20.19 12.59L21.82 12.94L24.00 13.45L21.82 13.96L20.19 14.31L18.96 14.55L18.04 14.73L17.34 14.88L16.77 15.00L16.31 15.11L15.94 15.21L15.64 15.30L15.37 15.40L15.13 15.48L14.91 15.57L14.73 15.66L14.60 15.79L14.50 15.95L14.41 16.13L14.34 16.34L14.26 16.56L14.18 16.81L14.10 17.08L14.00 17.38L13.90 17.71L13.79 18.11L13.68 18.61L13.55 19.23L13.40 20.02L13.20 21.05L12.95 22.45L12.57 24.34L12.00 26.89L11.43 24.34L11.05 22.45L10.80 21.05L10.60 20.02L10.45 19.23L10.32 18.61L10.21 18.11L10.10 17.71L10.00 17.38L9.90 17.08L9.82 16.81L9.74 16.56L9.66 16.34L9.59 16.13L9.50 15.95L9.40 15.79L9.27 15.66L9.09 15.57L8.87 15.48L8.63 15.40L8.36 15.30L8.06 15.21L7.69 15.11L7.23 15.00L6.66 14.88L5.96 14.73L5.04 14.55L3.81 14.31L2.18 13.96L0.00 13.45L2.18 12.94L3.81 12.59L5.04 12.35L5.96 12.17L6.66 12.02L7.23 11.90L7.69 11.79L8.06 11.69L8.36 11.60L8.63 11.50L8.87 11.42L9.09 11.33L9.27 11.24L9.40 11.11L9.50 10.95L9.59 10.77L9.66 10.56L9.74 10.34L9.82 10.09L9.90 9.82L10.00 9.52L10.10 9.19L10.21 8.79L10.32 8.29L10.45 7.67L10.60 6.88L10.80 5.85L11.05 4.45L11.43 2.56Z" fill="currentColor" opacity=".5"/>' +
    '<path d="M12.00 0.01L12.45 4.84L12.66 7.17L12.80 8.37L12.94 9.03L13.06 9.49L13.17 9.85L13.26 10.16L13.34 10.44L13.41 10.68L13.48 10.89L13.53 11.10L13.58 11.28L13.62 11.45L13.66 11.60L13.71 11.74L13.78 11.85L13.88 11.93L14.03 11.98L14.20 12.02L14.38 12.08L14.58 12.14L14.79 12.21L15.04 12.28L15.31 12.37L15.64 12.48L16.05 12.59L16.65 12.71L17.72 12.85L19.77 13.04L24.00 13.45L19.77 13.86L17.72 14.05L16.65 14.19L16.05 14.31L15.64 14.42L15.31 14.53L15.04 14.62L14.79 14.69L14.58 14.76L14.38 14.82L14.20 14.88L14.03 14.92L13.88 14.97L13.78 15.05L13.71 15.16L13.66 15.30L13.62 15.45L13.58 15.62L13.53 15.80L13.48 16.01L13.41 16.22L13.34 16.46L13.26 16.74L13.17 17.05L13.06 17.41L12.94 17.87L12.80 18.53L12.66 19.73L12.45 22.06L12.00 26.89L11.55 22.06L11.34 19.73L11.20 18.53L11.06 17.87L10.94 17.41L10.83 17.05L10.74 16.74L10.66 16.46L10.59 16.22L10.52 16.01L10.47 15.80L10.42 15.62L10.38 15.45L10.34 15.30L10.29 15.16L10.22 15.05L10.12 14.97L9.97 14.92L9.80 14.88L9.62 14.82L9.42 14.76L9.21 14.69L8.96 14.62L8.69 14.53L8.36 14.42L7.95 14.31L7.35 14.19L6.28 14.05L4.23 13.86L0.00 13.45L4.23 13.04L6.28 12.85L7.35 12.71L7.95 12.59L8.36 12.48L8.69 12.37L8.96 12.28L9.21 12.21L9.42 12.14L9.62 12.08L9.80 12.02L9.97 11.98L10.12 11.93L10.22 11.85L10.29 11.74L10.34 11.60L10.38 11.45L10.42 11.28L10.47 11.10L10.52 10.89L10.59 10.68L10.66 10.44L10.74 10.16L10.83 9.85L10.94 9.49L11.06 9.03L11.20 8.37L11.34 7.17L11.55 4.84Z" fill="currentColor"/>' +
    '<path d="M12.00 0.01L12.39 5.93L12.52 8.55L12.59 9.71L12.68 10.27L12.75 10.67L12.81 10.97L12.86 11.21L12.91 11.41L12.95 11.59L12.99 11.74L13.02 11.88L13.05 12.01L13.08 12.12L13.10 12.22L13.14 12.31L13.18 12.39L13.25 12.43L13.35 12.47L13.47 12.50L13.59 12.53L13.74 12.57L13.90 12.61L14.08 12.65L14.29 12.70L14.57 12.76L14.93 12.83L15.43 12.91L16.48 12.98L18.80 13.09L24.00 13.45L18.80 13.81L16.48 13.92L15.43 13.99L14.93 14.07L14.57 14.14L14.29 14.20L14.08 14.25L13.90 14.29L13.74 14.33L13.59 14.37L13.47 14.40L13.35 14.43L13.25 14.47L13.18 14.51L13.14 14.59L13.10 14.68L13.08 14.78L13.05 14.89L13.02 15.02L12.99 15.16L12.95 15.31L12.91 15.49L12.86 15.69L12.81 15.93L12.75 16.23L12.68 16.63L12.59 17.19L12.52 18.35L12.39 20.97L12.00 26.89L11.61 20.97L11.48 18.35L11.41 17.19L11.32 16.63L11.25 16.23L11.19 15.93L11.14 15.69L11.09 15.49L11.05 15.31L11.01 15.16L10.98 15.02L10.95 14.89L10.92 14.78L10.90 14.68L10.86 14.59L10.82 14.51L10.75 14.47L10.65 14.43L10.53 14.40L10.41 14.37L10.26 14.33L10.10 14.29L9.92 14.25L9.71 14.20L9.43 14.14L9.07 14.07L8.57 13.99L7.52 13.92L5.20 13.81L0.00 13.45L5.20 13.09L7.52 12.98L8.57 12.91L9.07 12.83L9.43 12.76L9.71 12.70L9.92 12.65L10.10 12.61L10.26 12.57L10.41 12.53L10.53 12.50L10.65 12.47L10.75 12.43L10.82 12.39L10.86 12.31L10.90 12.22L10.92 12.12L10.95 12.01L10.98 11.88L11.01 11.74L11.05 11.59L11.09 11.41L11.14 11.21L11.19 10.97L11.25 10.67L11.32 10.27L11.41 9.71L11.48 8.55L11.61 5.93Z" fill="#fff"/>' +
    '<circle cx="12" cy="13.45" r="2.6" fill="url(#vh-glint-core)"/>' +
    '</symbol></defs></svg>';
  var STAR = '<svg viewBox="0 0 24 26.9" aria-hidden="true" focusable="false"><use href="#vh-glint-star"/></svg>';
  function ensureSymbol() {
    if (document.getElementById("vh-glint-star")) return;
    var host = document.createElement("div");
    host.innerHTML = SYMBOL;
    document.body.appendChild(host.firstChild);
  }

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
      star.style.color = COLORS[s[5] || 0];
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
    ensureSymbol();
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
