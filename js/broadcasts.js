(function () {
  "use strict";

  initPagination();
  initBroadcastModal();
  initCondensedHeader();
  revealLinkedBroadcast();
  window.addEventListener("hashchange", revealLinkedBroadcast);

  function revealLinkedBroadcast() {
    var id = window.location.hash.slice(1);
    if (id.indexOf("broadcast-") !== 0) return;
    var card = document.getElementById(id);
    if (!card || !card.matches("article.cw-broadcast-card")) return;
    var load = document.getElementById("broadcast-load-more");
    while (card.hidden && load && !load.hidden) load.click();
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
    var readMore = card.querySelector("[data-broadcast-open]");
    if (readMore) readMore.click();
  }

  function initPagination() {
    var list = document.getElementById("broadcast-list");
    var button = document.getElementById("broadcast-load-more");
    var status = document.getElementById("broadcast-status");
    var emptySearch = document.getElementById("broadcast-search-empty");
    var searchFull = document.getElementById("broadcasts-search-full");
    var searchCondensed = document.getElementById("broadcasts-search-condensed");
    if (!list || !button) return;

    var cards = Array.prototype.slice.call(list.children);
    var texts = cards.map(function (card) { return card.textContent.toLowerCase(); });
    var visibleCount = Math.min(10, cards.length);
    var query = "";

    function matching() {
      if (!query) return cards;
      return cards.filter(function (card, index) { return texts[index].indexOf(query) !== -1; });
    }

    function update() {
      var matched = matching();
      var matchedSet = new Set(matched);
      var shownCount = 0;
      cards.forEach(function (card) {
        var within = matchedSet.has(card) && (query !== "" || shownCount < visibleCount);
        card.hidden = !within;
        if (within) shownCount++;
      });
      button.hidden = query !== "" || visibleCount >= cards.length;
      if (emptySearch) emptySearch.hidden = query === "" || matched.length > 0;
    }

    function setQuery(value) {
      query = value.trim().toLowerCase();
      if (searchFull && searchFull.value !== value) searchFull.value = value;
      if (searchCondensed && searchCondensed.value !== value) searchCondensed.value = value;
      update();
    }

    update();
    button.addEventListener("click", function () {
      var firstNewCard = cards[visibleCount];
      visibleCount = Math.min(visibleCount + 10, cards.length);
      update();
      if (status) status.textContent = "Showing " + visibleCount + " of " + cards.length + " broadcasts.";
      if (firstNewCard) {
        firstNewCard.setAttribute("tabindex", "-1");
        firstNewCard.focus({ preventScroll: true });
      }
    });

    if (searchFull) searchFull.addEventListener("input", function () { setQuery(searchFull.value); });
    if (searchCondensed) searchCondensed.addEventListener("input", function () { setQuery(searchCondensed.value); });
  }

  function initCondensedHeader() {
    var opening = document.querySelector(".broadcasts--v2 .broadcasts__sticky");
    var condensed = document.getElementById("broadcasts-condensed");
    var nav = document.querySelector(".site-frame > .nav");
    if (!opening || !condensed || !nav) return;

    function updateNavHeight() {
      document.documentElement.style.setProperty("--b-nav-height", nav.getBoundingClientRect().height + "px");
    }
    updateNavHeight();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(updateNavHeight).observe(nav);
    window.addEventListener("resize", updateNavHeight);

    var toggle = document.getElementById("broadcasts-search-toggle");
    var searchRow = document.getElementById("broadcasts-condensed-search-row");
    var condensedInput = document.getElementById("broadcasts-search-condensed");

    function closeCondensedSearch() {
      if (!toggle || !searchRow) return;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Show search");
      searchRow.hidden = true;
    }

    function setCollapsed(value) {
      if (condensed.hidden === !value) return;
      condensed.hidden = !value;
      if (!value) closeCondensedSearch();
    }

    var media = window.matchMedia("(max-width: 759px)");
    var observer = null;

    function setupObserver() {
      if (observer) { observer.disconnect(); observer = null; }
      if (!media.matches) { setCollapsed(false); return; }
      if (!("IntersectionObserver" in window)) return;
      var navHeight = Math.round(nav.getBoundingClientRect().height);
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { setCollapsed(entry.boundingClientRect.bottom < navHeight); });
      }, { threshold: 0, rootMargin: "-" + navHeight + "px 0px 0px 0px" });
      observer.observe(opening);
    }

    media.addEventListener("change", setupObserver);
    setupObserver();

    if (toggle && searchRow) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        if (open) {
          closeCondensedSearch();
        } else {
          toggle.setAttribute("aria-expanded", "true");
          toggle.setAttribute("aria-label", "Hide search");
          searchRow.hidden = false;
          if (condensedInput) condensedInput.focus();
        }
      });
      if (condensedInput) {
        condensedInput.addEventListener("keydown", function (event) {
          if (event.key === "Escape") { closeCondensedSearch(); toggle.focus(); }
        });
      }
    }
  }

  function initBroadcastModal() {
    var modal = document.getElementById("broadcast-modal");
    var content = document.getElementById("broadcast-modal-content");
    if (!modal || !content || typeof modal.showModal !== "function") return;

    var trigger = null;
    var scrollLock = null;
    var scrollArea = modal.querySelector(".broadcast-modal__scroll");
    var closeButton = modal.querySelector("[data-broadcast-close]");

    function lockScroll() {
      var body = document.body;
      var properties = ["position", "top", "left", "width", "overflow", "padding-right"];
      scrollLock = {
        x: window.scrollX,
        y: window.scrollY,
        styles: properties.map(function (property) {
          return [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)];
        })
      };
      var scrollbar = window.innerWidth - document.documentElement.clientWidth;
      var padding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.setProperty("position", "fixed");
      body.style.setProperty("top", "-" + scrollLock.y + "px");
      body.style.setProperty("left", "-" + scrollLock.x + "px");
      body.style.setProperty("width", "100%");
      body.style.setProperty("overflow", "hidden");
      if (scrollbar > 0) body.style.setProperty("padding-right", padding + scrollbar + "px");
    }

    document.querySelectorAll("[data-broadcast-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        var template = button.closest(".cw-broadcast-card").querySelector("template.broadcast-detail");
        if (!template || modal.open) return;
        trigger = button;
        content.replaceChildren(template.content.cloneNode(true));
        content.querySelector(".cw-broadcast-card__title").id = "broadcast-modal-title";
        // CMS rich text uses root-relative media paths. Apply the deployed
        // base URL here, just as Liquid does for attachment links.
        var baseurl = modal.getAttribute("data-baseurl") || "";
        content.querySelectorAll(".broadcast-modal__body [href], .broadcast-modal__body [src]").forEach(function (element) {
          ["href", "src"].forEach(function (attribute) {
            var value = element.getAttribute(attribute);
            if (baseurl && value && value.charAt(0) === "/" && value.charAt(1) !== "/" && value !== baseurl && value.indexOf(baseurl + "/") !== 0) {
              element.setAttribute(attribute, baseurl + value);
            }
          });
        });
        lockScroll();
        modal.showModal();
        if (scrollArea) scrollArea.scrollTop = 0;
        closeButton.focus({ preventScroll: true });
      });
    });

    closeButton.addEventListener("click", function () { modal.close(); });
    // Native dialog handles Escape, traps focus, and makes the page inert.
    modal.addEventListener("close", function () {
      if (scrollLock) {
        var saved = scrollLock;
        saved.styles.forEach(function (entry) {
          if (entry[1]) document.body.style.setProperty(entry[0], entry[1], entry[2]);
          else document.body.style.removeProperty(entry[0]);
        });
        var root = document.documentElement;
        var behavior = root.style.getPropertyValue("scroll-behavior");
        var priority = root.style.getPropertyPriority("scroll-behavior");
        root.style.setProperty("scroll-behavior", "auto", "important");
        window.scrollTo(saved.x, saved.y);
        if (behavior) root.style.setProperty("scroll-behavior", behavior, priority);
        else root.style.removeProperty("scroll-behavior");
        scrollLock = null;
      }
      content.replaceChildren();
      if (trigger) trigger.focus({ preventScroll: true });
      trigger = null;
    });
  }
})();
