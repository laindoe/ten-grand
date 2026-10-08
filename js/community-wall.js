(function () {
  "use strict";

  function setStat(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el && typeof value === "number") {
      el.textContent = value.toLocaleString("en-US");
    }
  }

  async function approvedCount(role) {
    var query = window.tenGrandSupabase
      .from("voices_heard")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");
    if (role) query = query.eq("role", role);
    var result = await query;
    if (result.error || typeof result.count !== "number") return null;
    return result.count;
  }

  async function loadStats() {
    if (!window.tenGrandSupabase) return;
    try {
      var roles = ["create", "build", "fund", "support"];
      var counts = await Promise.all(
        [approvedCount(null)].concat(roles.map(approvedCount))
      );
      var total = counts[0];
      if (total !== null) setStat("total", total);
      roles.forEach(function (role, i) {
        var count = counts[i + 1];
        if (count !== null) setStat(role, count);
      });
    } catch (error) {
      console.error("Ten Grand Community Wall stats failed", error);
    }
  }

  function initJoinModal() {
    var modal = document.getElementById("cw-join-modal");
    var triggers = document.querySelectorAll("[data-join-trigger]");
    if (!modal || !triggers.length) return;

    var lastFocused = null;
    var scrollLock = null;

    // Same body-lock technique as the AMASS modal on the homepage
    // (js/main.js's initSimpleModals): position:fixed + scroll offset
    // compensation + scrollbar-width padding compensation, so the page
    // behind the modal can't scroll (including on iOS, where plain
    // overflow:hidden on body doesn't stop background scroll).
    function lockScroll() {
      if (scrollLock) return;
      var body = document.body;
      var properties = ["position", "top", "left", "width", "overflow", "padding-right"];
      scrollLock = {
        x: window.scrollX,
        y: window.scrollY,
        styles: properties.map(function (property) {
          return [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)];
        }),
      };
      var scrollbar = window.innerWidth - document.documentElement.clientWidth;
      var padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.setProperty("position", "fixed");
      body.style.setProperty("top", "-" + scrollLock.y + "px");
      body.style.setProperty("left", "-" + scrollLock.x + "px");
      body.style.setProperty("width", "100%");
      body.style.setProperty("overflow", "hidden");
      if (scrollbar > 0) body.style.setProperty("padding-right", padding + scrollbar + "px");
    }

    function unlockScroll() {
      if (!scrollLock) return;
      var saved = scrollLock;
      scrollLock = null;
      saved.styles.forEach(function (entry) {
        var property = entry[0], value = entry[1], priority = entry[2];
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      });
      var root = document.documentElement;
      var behavior = root.style.getPropertyValue("scroll-behavior");
      var priority = root.style.getPropertyPriority("scroll-behavior");
      root.style.setProperty("scroll-behavior", "auto", "important");
      window.scrollTo(saved.x, saved.y);
      if (behavior) root.style.setProperty("scroll-behavior", behavior, priority);
      else root.style.removeProperty("scroll-behavior");
    }

    function openModal(event) {
      if (modal.classList.contains("is-open")) return;
      lastFocused = event.currentTarget;
      lockScroll();
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      modal.querySelector(".modal__close").focus({ preventScroll: true });
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      unlockScroll();
      if (lastFocused) lastFocused.focus({ preventScroll: true });
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", openModal);
    });
    modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  // Chromium doesn't reflect the .hidden IDL property to the actual
  // `hidden` content attribute on <svg> elements (same quirk worked
  // around in js/amass-modal.js), so toggling icons via plain
  // `svgEl.hidden = true` silently fails. Setting the attribute
  // directly works around it.
  function setSvgHidden(svgEl, isHidden) {
    if (isHidden) svgEl.setAttribute("hidden", "");
    else svgEl.removeAttribute("hidden");
  }

  // These are static sample cards (no real audio file behind them),
  // so "play" just demonstrates the interaction: toggling the button
  // between its play and pause icon/label.
  function initVoiceCardAudio() {
    var buttons = document.querySelectorAll(".cw-voice-card__audio-play");
    buttons.forEach(function (button) {
      var playIcon = button.querySelector(".amass-flow__review-play-icon--play");
      var pauseIcon = button.querySelector(".amass-flow__review-play-icon--pause");
      var label = button.querySelector("span");
      button.addEventListener("click", function () {
        var isPlaying = !button.classList.contains("is-playing");
        button.classList.toggle("is-playing", isPlaying);
        setSvgHidden(playIcon, isPlaying);
        setSvgHidden(pauseIcon, !isPlaying);
        label.textContent = isPlaying ? "Pause" : "Play";
      });
    });
  }

  // .cw-voice-card__avatar (CSS: grid + align-self:stretch +
  // aspect-ratio) does correctly size itself to match the name/links
  // column's real height, including when a 2-line name wraps -- but
  // .cw-voice-card__top, the grid row containing it, doesn't grow to
  // contain that stretched child: measured, the row's own box stays
  // only as tall as its non-stretched children (badge column), so a
  // taller avatar/identity overflows past the row's reported bottom
  // edge. .cw-voice-card__body's margin-top is measured from that
  // (too-small) edge, so it lands inside the overflow instead of
  // below it. This corrects the gap directly: however far the
  // content actually overflows past the row's box, add that onto the
  // intended 24px gap.
  function fixVoiceCardSpacing() {
    var desiredGap = 24;
    document.querySelectorAll(".cw-voice-card").forEach(function (card) {
      var top = card.querySelector(".cw-voice-card__top");
      var body = card.querySelector(".cw-voice-card__body");
      if (!top || !body) return;
      body.style.removeProperty("margin-top");
      var edges = [top, top.querySelector(".cw-voice-card__avatar"), top.querySelector(".cw-voice-card__identity"), top.querySelector(".cw-voice-card__badge-col")]
        .filter(Boolean)
        .map(function (el) {
          return el.getBoundingClientRect().bottom;
        });
      var contentBottom = Math.max.apply(null, edges);
      var topBottom = top.getBoundingClientRect().bottom;
      var shortfall = contentBottom - topBottom;
      if (shortfall > 0.5) {
        body.style.marginTop = Math.ceil(desiredGap + shortfall) + "px";
      }
    });
  }

  loadStats();
  initJoinModal();
  initVoiceCardAudio();
  fixVoiceCardSpacing();
  window.addEventListener("resize", fixVoiceCardSpacing);
  // Catches any late reflow from web fonts swapping in after this
  // script runs, which can change whether a name wraps.
  window.addEventListener("load", fixVoiceCardSpacing);
})();
