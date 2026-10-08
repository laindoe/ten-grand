(function () {
  "use strict";

  initPagination();
  initBroadcastModal();

  function initPagination() {
    var list = document.getElementById("broadcast-list");
    var button = document.getElementById("broadcast-load-more");
    var status = document.getElementById("broadcast-status");
    if (!list || !button) return;

    var cards = Array.prototype.slice.call(list.children);
    var visibleCount = Math.min(10, cards.length);

    function update() {
      cards.forEach(function (card, index) { card.hidden = index >= visibleCount; });
      button.hidden = visibleCount >= cards.length;
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
